import fs from 'fs'
import path from 'path'
import { Router, Request, Response } from 'express'
import type { DbInstance } from './db'
import type { WsMessage } from './types'
import { isCodeExplorerEnabled } from './feature-flags'
import { BUILD_DIRS } from './build-dirs'
import {
  listProvenanceByPath,
  listProvenanceByTicket,
  getProvenanceDiff,
  type ProvenanceRow,
} from './file-provenance'
import {
  readSummary,
  computeFileHash,
  type FileSummaryManager,
  type SummaryPayload,
} from './file-summary-manager'

declare module 'express-serve-static-core' {
  interface Request {
    projectCtx?: import('./project-registry').ProjectContext
  }
}

const MAX_TREE_PAGE = 2000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const BINARY_PROBE_BYTES = 8 * 1024

// Hard-coded hub deny-list (mirrors design D8). Dotfiles are excluded by name
// prefix; build/dep dirs come from the shared BUILD_DIRS set (node_modules, dist,
// build, out, coverage, target, vendor) so the on-demand tree walk skips the same
// heavy trees the file-summary watcher prunes; extensions handled below.
const DENY_EXTS = new Set(['.lock', '.log'])

function isDenied(entryName: string): boolean {
  if (entryName.startsWith('.')) return true
  if (BUILD_DIRS.has(entryName)) return true
  const ext = path.extname(entryName).toLowerCase()
  if (DENY_EXTS.has(ext)) return true
  // common lockfile names whose extension is .json/.yaml are excluded by
  // explicit name match below.
  if (entryName === 'package-lock.json' || entryName === 'pnpm-lock.yaml' || entryName === 'yarn.lock') return true
  return false
}

function languageForExt(ext: string): string {
  const e = ext.toLowerCase()
  switch (e) {
    case '.ts': return 'typescript'
    case '.tsx': return 'typescriptreact'
    case '.js': return 'javascript'
    case '.jsx': return 'javascriptreact'
    case '.json': return 'json'
    case '.md': return 'markdown'
    case '.py': return 'python'
    case '.rs': return 'rust'
    case '.go': return 'go'
    case '.css': return 'css'
    case '.html': return 'html'
    case '.yml':
    case '.yaml': return 'yaml'
    case '.sh': return 'shell'
    case '.sql': return 'sql'
    case '.toml': return 'toml'
    default: return 'plaintext'
  }
}

function decodeCursor(raw: string | undefined): { skip: number } {
  if (!raw) return { skip: 0 }
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as { skip?: number }
    if (typeof parsed.skip === 'number' && parsed.skip >= 0) return { skip: parsed.skip }
  } catch {
    // fall through to default
  }
  return { skip: 0 }
}

function encodeCursor(skip: number): string {
  return Buffer.from(JSON.stringify({ skip }), 'utf8').toString('base64')
}

interface TreeEntryProvenance {
  createdByTicketId: number | null
  modifiedByTicketIds: number[]
  latest: ProvenanceRow | null
  touchedFileCount: number
  rows: ProvenanceRow[]
}

interface TreeEntry {
  path: string
  kind: 'file' | 'dir'
  sizeBytes: number | null
  hasSummary: boolean
  provenance: TreeEntryProvenance
  lastModifiedAt: number | null
}

function rollupProvenance(rows: ProvenanceRow[]): TreeEntryProvenance {
  let createdByTicketId: number | null = null
  const modifiedSet = new Set<number>()
  // `rows` arrives ordered by `at DESC`. Walk oldest → newest so the earliest
  // 'created' wins for createdByTicketId.
  for (const r of [...rows].reverse()) {
    if (r.ticket_id == null) continue
    if (r.kind === 'created' && createdByTicketId == null) {
      createdByTicketId = r.ticket_id
    } else if (r.kind === 'modified') {
      modifiedSet.add(r.ticket_id)
    }
  }
  // Don't double-count the creating ticket in the modified chips list.
  if (createdByTicketId != null) modifiedSet.delete(createdByTicketId)
  return {
    createdByTicketId,
    modifiedByTicketIds: [...modifiedSet],
    latest: rows[0] ?? null,
    touchedFileCount: 0,
    rows,
  }
}

function rollupDirectoryProvenance(rowsByPath: Map<string, ProvenanceRow[]>, dirPath: string): TreeEntryProvenance {
  const prefix = `${dirPath}/`
  const childRows: ProvenanceRow[] = []
  let touchedFileCount = 0
  for (const [filePath, rows] of rowsByPath) {
    if (!filePath.startsWith(prefix)) continue
    touchedFileCount += 1
    childRows.push(...rows)
  }
  childRows.sort((a, b) => b.at - a.at)
  return {
    ...rollupProvenance(childRows),
    touchedFileCount,
  }
}

function provenanceToJson(row: ProvenanceRow | null): unknown {
  if (!row) return null
  return {
    path: row.file_path,
    ticketId: row.ticket_id,
    jobId: row.job_id,
    kind: row.kind,
    at: row.at,
  }
}

function provenanceRowsToJson(rows: ProvenanceRow[]): unknown[] {
  return rows.map((row) => ({
    path: row.file_path,
    ticketId: row.ticket_id,
    jobId: row.job_id,
    kind: row.kind,
    at: row.at,
  }))
}

function treeProvenanceToJson(provenance: TreeEntryProvenance): unknown {
  return {
    createdByTicketId: provenance.createdByTicketId,
    modifiedByTicketIds: provenance.modifiedByTicketIds,
    latest: provenanceToJson(provenance.latest),
    touchedFileCount: provenance.touchedFileCount,
    rows: provenanceRowsToJson(provenance.rows),
  }
}

function parsePositiveInt(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseNonEmptyString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

function listTouchedRows(
  db: DbInstance,
  filters: { ticketId?: number | null; jobId?: string | null; path?: string | null },
): ProvenanceRow[] {
  const where: string[] = []
  const args: Array<string | number> = []
  if (filters.ticketId != null) {
    where.push('ticket_id = ?')
    args.push(filters.ticketId)
  }
  if (filters.jobId) {
    where.push('job_id = ?')
    args.push(filters.jobId)
  }
  if (filters.path) {
    where.push('file_path = ?')
    args.push(filters.path)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  return db.prepare(
    `SELECT id, file_path, ticket_id, job_id, kind, at
     FROM file_provenance ${whereSql}
     ORDER BY file_path ASC, at DESC`,
  ).all(...args) as ProvenanceRow[]
}

function listAllEntries(projectPath: string): Array<{ rel: string; isDir: boolean; size: number | null; mtime: number | null }> {
  const out: Array<{ rel: string; isDir: boolean; size: number | null; mtime: number | null }> = []
  const stack: string[] = [projectPath]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (isDenied(entry.name)) continue
      const abs = path.join(dir, entry.name)
      const rel = path.relative(projectPath, abs)
      if (entry.isDirectory()) {
        out.push({ rel, isDir: true, size: null, mtime: null })
        stack.push(abs)
      } else if (entry.isFile()) {
        let size: number | null = null
        let mtime: number | null = null
        try {
          const st = fs.statSync(abs)
          size = st.size
          mtime = st.mtimeMs
        } catch {
          // ignore
        }
        out.push({ rel, isDir: false, size, mtime })
      }
    }
  }
  out.sort((a, b) => a.rel.localeCompare(b.rel))
  return out
}

function listTouchedEntries(
  projectPath: string,
  rowsByPath: Map<string, ProvenanceRow[]>,
): Array<{ rel: string; isDir: boolean; size: number | null; mtime: number | null }> {
  const seen = new Set<string>()
  const out: Array<{ rel: string; isDir: boolean; size: number | null; mtime: number | null }> = []

  for (const filePath of rowsByPath.keys()) {
    const parts = filePath.split('/').filter(Boolean)
    for (let i = 1; i < parts.length; i += 1) {
      const dirRel = parts.slice(0, i).join('/')
      if (!seen.has(dirRel)) {
        seen.add(dirRel)
        out.push({ rel: dirRel, isDir: true, size: null, mtime: null })
      }
    }

    if (seen.has(filePath)) continue
    seen.add(filePath)
    const abs = path.join(projectPath, filePath)
    let size: number | null = null
    let mtime: number | null = null
    try {
      const st = fs.statSync(abs)
      size = st.size
      mtime = st.mtimeMs
    } catch {
      // file may have been deleted after provenance was recorded
    }
    out.push({ rel: filePath, isDir: false, size, mtime })
  }

  out.sort((a, b) => {
    const byPath = a.rel.localeCompare(b.rel)
    if (byPath !== 0) return byPath
    return Number(b.isDir) - Number(a.isDir)
  })
  return out
}

export interface CodeExplorerDeps {
  db: DbInstance
  projectPath: string
  projectId: string
  broadcast: (msg: WsMessage) => void
  fileSummaryManager: Pick<FileSummaryManager, 'enqueue' | 'attachWatcher'>
  listProvenanceByPath?: (db: DbInstance, projectId: string, filePath: string) => ProvenanceRow[]
  listProvenanceByTicket?: (db: DbInstance, projectId: string, ticketId: number) => ProvenanceRow[]
}

export function createCodeExplorerRouter(deps: CodeExplorerDeps): Router {
  const router = Router({ mergeParams: true })

  const listByPath = deps.listProvenanceByPath ?? listProvenanceByPath
  const listByTicket = deps.listProvenanceByTicket ?? listProvenanceByTicket

  // Feature-flag gate — entire prefix returns 404 when disabled.
  router.use((_req, res, next) => {
    if (!isCodeExplorerEnabled()) {
      res.status(404).end()
      return
    }
    // Lazily attach the file-summary watcher on first Code-Explorer use. It is
    // not attached at registry load (that recursive watcher caused the fd leak
    // that broke terminals); attachWatcher is idempotent, so this is cheap on
    // every subsequent request.
    try { deps.fileSummaryManager.attachWatcher(deps.projectId, deps.projectPath) } catch { /* non-fatal */ }
    next()
  })

  router.get('/tree', (req: Request, res: Response) => {
    const filter = (req.query.filter as string | undefined) ?? 'touched-by-ai'
    const withProvenance = req.query.withProvenance === '1' || req.query.withProvenance === 'true'
    const { skip } = decodeCursor(req.query.cursor as string | undefined)
    const ticketId = parsePositiveInt(req.query.ticketId)
    const jobId = parseNonEmptyString(req.query.jobId)

    let entries: Array<{ rel: string; isDir: boolean; size: number | null; mtime: number | null }>
    let touchedRowsByPath = new Map<string, ProvenanceRow[]>()
    if (filter === 'touched-by-ai') {
      const rows = listTouchedRows(deps.db, { ticketId, jobId })
      for (const row of rows) {
        const existing = touchedRowsByPath.get(row.file_path)
        if (existing) existing.push(row)
        else touchedRowsByPath.set(row.file_path, [row])
      }
      entries = listTouchedEntries(deps.projectPath, touchedRowsByPath)
    } else {
      entries = listAllEntries(deps.projectPath)
    }

    const page = entries.slice(skip, skip + MAX_TREE_PAGE)
    const nextCursor = skip + page.length < entries.length ? encodeCursor(skip + page.length) : null

    const out: TreeEntry[] = page.map((e) => {
      const rawRows = withProvenance
        ? (filter === 'touched-by-ai' && e.isDir
            ? []
            : (touchedRowsByPath.get(e.rel) ?? listByPath(deps.db, deps.projectId, e.rel)))
        : []
      const summary = readSummary(deps.projectPath, e.rel)
      const provenance = withProvenance && filter === 'touched-by-ai' && e.isDir
        ? rollupDirectoryProvenance(touchedRowsByPath, e.rel)
        : rollupProvenance(rawRows)
      return {
        path: e.rel,
        kind: e.isDir ? 'dir' : 'file',
        sizeBytes: e.size,
        hasSummary: summary != null,
        provenance,
        lastModifiedAt: e.mtime,
      }
    })

    res.json({
      entries: out.map((entry) => ({
        ...entry,
        provenance: treeProvenanceToJson(entry.provenance),
      })),
      nextCursor,
    })
  })

  router.get('/file', async (req: Request, res: Response) => {
    const relRaw = req.query.path as string | undefined
    if (!relRaw || typeof relRaw !== 'string') {
      res.status(400).json({ error: 'path query parameter is required' })
      return
    }

    const guard = resolveSafePath(deps.projectPath, relRaw)
    if (!guard) {
      res.status(400).json({ error: 'path traversal not allowed' })
      return
    }
    const abs = guard

    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      // Honour the staleness scenario: even if content is unavailable, return
      // the existing summary so the client can render a "not found" banner.
      const summary = readSummary(deps.projectPath, relRaw)
      const provenance = listByPath(deps.db, deps.projectId, relRaw)
      if (summary || provenance.length > 0) {
        res.json({
          content: null,
          reason: 'not-found',
          summary,
          summaryStale: true,
          provenance: provenanceRowsToJson(provenance),
        })
        return
      }
      res.status(404).json({ error: 'file not found' })
      return
    }
    if (!stat.isFile()) {
      res.status(400).json({ error: 'path is not a regular file' })
      return
    }

    if (stat.size > MAX_FILE_BYTES) {
      res.json({
        tooLarge: true,
        sizeBytes: stat.size,
        provenance: provenanceRowsToJson(listByPath(deps.db, deps.projectId, relRaw)),
        summary: readSummary(deps.projectPath, relRaw),
        absolutePath: abs,
      })
      return
    }

    // Binary detection: read first 8 KB, scan for NUL.
    let head: Buffer
    try {
      const fd = fs.openSync(abs, 'r')
      try {
        head = Buffer.alloc(Math.min(BINARY_PROBE_BYTES, stat.size))
        fs.readSync(fd, head, 0, head.length, 0)
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      res.status(500).json({ error: 'failed to read file' })
      return
    }
    if (head.includes(0)) {
      res.json({
        binary: true,
        sizeBytes: stat.size,
        mime: 'application/octet-stream',
        provenance: provenanceRowsToJson(listByPath(deps.db, deps.projectId, relRaw)),
        summary: readSummary(deps.projectPath, relRaw),
        absolutePath: abs,
      })
      return
    }

    let content: string
    try {
      content = fs.readFileSync(abs, 'utf8')
    } catch {
      res.status(500).json({ error: 'failed to read file' })
      return
    }

    const summary = readSummary(deps.projectPath, relRaw)
    const summaryStale = await computeStaleness(abs, summary)
    res.json({
      content,
      encoding: 'utf-8',
      language: languageForExt(path.extname(relRaw)),
      provenance: provenanceRowsToJson(listByPath(deps.db, deps.projectId, relRaw)),
      summary,
      summaryStale,
      absolutePath: abs,
    })
  })

  router.get('/summary', async (req: Request, res: Response) => {
    const relRaw = req.query.path as string | undefined
    if (!relRaw || typeof relRaw !== 'string') {
      res.status(400).json({ error: 'path query parameter is required' })
      return
    }
    const guard = resolveSafePath(deps.projectPath, relRaw)
    if (!guard) {
      res.status(400).json({ error: 'path traversal not allowed' })
      return
    }
    const summary = readSummary(deps.projectPath, relRaw)
    if (!summary) {
      res.json({ summary: null })
      return
    }
    let summaryStale = false
    try {
      summaryStale = await computeStaleness(guard, summary)
    } catch {
      summaryStale = true
    }
    res.json({ summary, summaryStale })
  })

  router.post('/file/regenerate-summary', async (req: Request, res: Response) => {
    const relRaw = req.query.path as string | undefined
    if (!relRaw || typeof relRaw !== 'string') {
      res.status(400).json({ error: 'path query parameter is required' })
      return
    }
    const guard = resolveSafePath(deps.projectPath, relRaw)
    if (!guard) {
      res.status(400).json({ error: 'path traversal not allowed' })
      return
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(guard)
    } catch {
      res.status(404).json({ skipped: 'not-found' })
      return
    }
    if (!stat.isFile()) {
      res.status(400).json({ skipped: 'not-file' })
      return
    }
    if (stat.size > MAX_FILE_BYTES) {
      res.status(413).json({ skipped: 'too-large' })
      return
    }
    try {
      const fd = fs.openSync(guard, 'r')
      try {
        const head = Buffer.alloc(Math.min(BINARY_PROBE_BYTES, stat.size))
        fs.readSync(fd, head, 0, head.length, 0)
        if (head.includes(0)) {
          res.status(415).json({ skipped: 'binary' })
          return
        }
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      res.status(500).json({ error: 'failed to inspect file' })
      return
    }
    const body = (req.body ?? {}) as { overrideBudget?: boolean }
    try {
      await deps.fileSummaryManager.enqueue({
        projectPath: deps.projectPath,
        projectId: deps.projectId,
        projectSlug: deps.projectId,
        relPath: relRaw,
        triggeredBy: { kind: 'user', id: 'manual', ticketId: null },
        overrideBudget: body.overrideBudget === true,
      })
      res.status(202).json({ enqueued: true })
    } catch (err) {
      console.error('[code-explorer-router] enqueue failed:', err)
      res.status(500).json({ error: 'enqueue failed', message: (err as Error).message })
    }
  })

  router.get('/provenance', (req: Request, res: Response) => {
    const ticketId = parsePositiveInt(req.query.ticketId)
    const jobId = parseNonEmptyString(req.query.jobId)
    const relPath = parseNonEmptyString(req.query.path)
    if (relPath) {
      const guard = resolveSafePath(deps.projectPath, relPath)
      if (!guard) {
        res.status(400).json({ error: 'path traversal not allowed' })
        return
      }
    }
    if (ticketId == null && !jobId && !relPath) {
      res.status(400).json({ error: 'ticketId, jobId, or path query parameter is required' })
      return
    }
    if (req.query.ticketId != null && ticketId == null) {
      res.status(400).json({ error: 'ticketId must be a positive integer' })
      return
    }
    const rows = ticketId != null && !jobId && !relPath
      ? listByTicket(deps.db, deps.projectId, ticketId)
      : listTouchedRows(deps.db, { ticketId, jobId, path: relPath })
    res.json(
      provenanceRowsToJson(rows),
    )
  })

  router.get('/diff', (req: Request, res: Response) => {
    const jobId = parseNonEmptyString(req.query.jobId)
    const relPath = parseNonEmptyString(req.query.path)
    if (!jobId || !relPath) {
      res.status(400).json({ error: 'jobId and path query parameters are required' })
      return
    }
    const guard = resolveSafePath(deps.projectPath, relPath)
    if (!guard) {
      res.status(400).json({ error: 'path traversal not allowed' })
      return
    }
    const diff = getProvenanceDiff(deps.db, deps.projectId, jobId, relPath)
    if (!diff) {
      res.status(404).json({ error: 'diff not available' })
      return
    }
    res.json(diff)
  })

  return router
}

function resolveSafePath(projectPath: string, relPath: string): string | null {
  // Reject absolute paths and any path with explicit traversal segments before
  // we ever hit the filesystem. resolve() can collapse `..` legally so we still
  // verify the prefix below.
  if (path.isAbsolute(relPath)) return null
  const resolved = path.resolve(projectPath, relPath)
  const root = projectPath.endsWith(path.sep) ? projectPath : projectPath + path.sep
  if (resolved !== projectPath && !resolved.startsWith(root)) return null
  return resolved
}

async function computeStaleness(abs: string, summary: SummaryPayload | null): Promise<boolean> {
  if (!summary) return false
  try {
    const currentHash = await computeFileHash(abs)
    return currentHash !== summary.fileHash
  } catch {
    return true
  }
}
