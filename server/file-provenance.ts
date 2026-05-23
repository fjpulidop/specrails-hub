import { execFileSync, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { DbInstance } from './db'
import type { WsMessage } from './types'

export type DiffStatus = 'A' | 'M' | 'D' | 'R'

export interface DiffEntry {
  path: string
  status: DiffStatus
  renamedFrom?: string
}

export type ProvenanceKind = 'created' | 'modified' | 'deleted'

export interface ProvenanceRow {
  id: number
  file_path: string
  ticket_id: number | null
  job_id: string | null
  kind: ProvenanceKind
  at: number
}

const MAX_PATCH_BYTES = 512 * 1024

export function snapshotWorkingTree(cwd: string): string {
  try {
    const out = execSync('git stash create --include-untracked', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out.trim()
  } catch (err) {
    const msg = (err as { message?: string }).message ?? ''
    if (/ENOENT|not found|command not found/i.test(msg)) {
      throw err
    }
    return ''
  }
}

export function diffAgainstSnapshot(cwd: string, snapshotRef: string): DiffEntry[] {
  const hasSnap = snapshotRef && snapshotRef.length > 0
  const ref = hasSnap ? snapshotRef : 'HEAD'
  let out = ''
  try {
    out = execSync(`git diff --name-status -z ${ref} --`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    out = ''
  }

  const entries: DiffEntry[] = []
  const seen = new Set<string>()

  if (out) {
    const tokens = out.split('\0').filter((t) => t.length > 0)
    let i = 0
    while (i < tokens.length) {
      const raw = tokens[i]
      const code = raw[0]
      if (code === 'R') {
        const oldPath = tokens[i + 1]
        const newPath = tokens[i + 2]
        if (oldPath !== undefined && newPath !== undefined && !seen.has(newPath)) {
          entries.push({ path: newPath, status: 'R', renamedFrom: oldPath })
          seen.add(newPath)
        }
        i += 3
        continue
      }
      if (code === 'A' || code === 'M' || code === 'D') {
        const p = tokens[i + 1]
        if (p !== undefined && !seen.has(p)) {
          entries.push({ path: p, status: code })
          seen.add(p)
        }
        i += 2
        continue
      }
      i += 1
    }
  }

  // `git diff HEAD` only reports tracked-file changes. When the pre-spawn
  // snapshot was empty (clean working tree) the diff above misses every NEW
  // file the rail created. `git ls-files --others` surfaces untracked paths;
  // we record them as 'A' (created) since they did not exist at snapshot time.
  if (!hasSnap) {
    let others = ''
    try {
      others = execSync('git ls-files --others --exclude-standard -z', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      others = ''
    }
    if (others) {
      for (const p of others.split('\0')) {
        if (p && !seen.has(p)) {
          entries.push({ path: p, status: 'A' })
          seen.add(p)
        }
      }
    }
  }

  return entries
}

export interface StoredPatch {
  patch: string
  truncated: boolean
}

function truncatePatch(patch: string): StoredPatch {
  const bytes = Buffer.byteLength(patch, 'utf8')
  if (bytes <= MAX_PATCH_BYTES) return { patch, truncated: false }
  return {
    patch: `${patch.slice(0, MAX_PATCH_BYTES)}\n[specrails-hub] diff truncated at ${MAX_PATCH_BYTES} bytes\n`,
    truncated: true,
  }
}

function addedFilePatch(cwd: string, relPath: string): string {
  const abs = path.resolve(cwd, relPath)
  const root = cwd.endsWith(path.sep) ? cwd : `${cwd}${path.sep}`
  if (abs !== cwd && !abs.startsWith(root)) return ''
  let content = ''
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile() || stat.size > MAX_PATCH_BYTES) return ''
    content = fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return [
    `diff --git a/${relPath} b/${relPath}`,
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    `+++ b/${relPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    '',
  ].join('\n')
}

export function collectDiffPatches(cwd: string, snapshotRef: string, diff: DiffEntry[]): Map<string, StoredPatch> {
  const patches = new Map<string, StoredPatch>()
  if (diff.length === 0) return patches

  const ref = snapshotRef && snapshotRef.length > 0 ? snapshotRef : 'HEAD'
  for (const entry of diff) {
    let patch = ''
    try {
      patch = execFileSync('git', ['diff', '--no-ext-diff', '--find-renames', '--unified=80', ref, '--', entry.path], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: MAX_PATCH_BYTES + 64 * 1024,
      })
    } catch (err) {
      patch = ((err as { stdout?: string }).stdout ?? '').toString()
    }
    if (!patch && entry.status === 'A') patch = addedFilePatch(cwd, entry.path)
    if (patch) patches.set(entry.path, truncatePatch(patch))
  }
  return patches
}

export function recordProvenanceForJob(
  db: DbInstance,
  projectId: string,
  jobId: string,
  ticketId: number | null,
  diff: DiffEntry[],
  atMs: number = Date.now(),
  patches?: Map<string, StoredPatch>,
): ProvenanceRow[] {
  void projectId
  if (diff.length === 0) return []

  type Pending = { file_path: string; kind: ProvenanceKind }
  const pending: Pending[] = []
  for (const entry of diff) {
    if (entry.status === 'A') {
      pending.push({ file_path: entry.path, kind: 'created' })
    } else if (entry.status === 'M') {
      pending.push({ file_path: entry.path, kind: 'modified' })
    } else if (entry.status === 'D') {
      pending.push({ file_path: entry.path, kind: 'deleted' })
    } else if (entry.status === 'R') {
      // rename = two rows because tree row tracking needs both the new path (modified) and old path (deleted)
      pending.push({ file_path: entry.path, kind: 'modified' })
      if (entry.renamedFrom !== undefined) {
        pending.push({ file_path: entry.renamedFrom, kind: 'deleted' })
      }
    }
  }

  const insert = db.prepare(`
    INSERT INTO file_provenance (file_path, ticket_id, job_id, kind, at)
    VALUES (?, ?, ?, ?, ?)
  `)
  let insertPatch: any = null
  try {
    insertPatch = db.prepare(`
      INSERT OR REPLACE INTO file_provenance_diffs (provenance_id, patch, truncated)
      VALUES (?, ?, ?)
    `)
  } catch {
    insertPatch = null
  }

  const inserted: ProvenanceRow[] = []
  const tx = db.transaction((rows: Pending[]) => {
    for (const r of rows) {
      const result = insert.run(r.file_path, ticketId, jobId, r.kind, atMs)
      inserted.push({
        id: Number(result.lastInsertRowid),
        file_path: r.file_path,
        ticket_id: ticketId,
        job_id: jobId,
        kind: r.kind,
        at: atMs,
      })
      const storedPatch = patches?.get(r.file_path)
      if (insertPatch && storedPatch) {
        insertPatch.run(Number(result.lastInsertRowid), storedPatch.patch, storedPatch.truncated ? 1 : 0)
      }
    }
  })
  tx(pending)
  return inserted
}

export function getProvenanceDiff(
  db: DbInstance,
  projectId: string,
  jobId: string,
  filePath: string,
): { patch: string; truncated: boolean } | null {
  void projectId
  try {
    const row = db.prepare(
      `SELECT d.patch, d.truncated
       FROM file_provenance p
       JOIN file_provenance_diffs d ON d.provenance_id = p.id
       WHERE p.job_id = ? AND p.file_path = ?
       ORDER BY p.at DESC, p.id DESC
       LIMIT 1`,
    ).get(jobId, filePath) as { patch: string; truncated: number } | undefined
    return row ? { patch: row.patch, truncated: row.truncated === 1 } : null
  } catch {
    return null
  }
}

export function listProvenanceByTicket(
  db: DbInstance,
  projectId: string,
  ticketId: number,
): ProvenanceRow[] {
  void projectId
  return db.prepare(
    `SELECT id, file_path, ticket_id, job_id, kind, at
     FROM file_provenance WHERE ticket_id = ? ORDER BY at DESC`,
  ).all(ticketId) as ProvenanceRow[]
}

export function listProvenanceByPath(
  db: DbInstance,
  projectId: string,
  filePath: string,
): ProvenanceRow[] {
  void projectId
  return db.prepare(
    `SELECT id, file_path, ticket_id, job_id, kind, at
     FROM file_provenance WHERE file_path = ? ORDER BY at DESC`,
  ).all(filePath) as ProvenanceRow[]
}

export function broadcastProvenanceUpdated(
  broadcast: (msg: WsMessage) => void,
  projectId: string,
  row: ProvenanceRow,
): void {
  const msg = {
    type: 'file.provenance_updated' as const,
    projectId,
    path: row.file_path,
    kind: row.kind,
    ticketId: row.ticket_id,
    jobId: row.job_id,
    at: row.at,
  }
  // TODO: extend WsMessage union in server/types.ts with the 'file.provenance_updated' variant
  ;(broadcast as (msg: unknown) => void)(msg)
}
