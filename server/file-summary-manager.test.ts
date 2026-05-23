import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// The 'file-summary' surface is being added in a sibling task; pre-extend the
// allow-list here so recordInvocation accepts our rows during tests.
vi.mock('./ai-invocations', async () => {
  const actual = await vi.importActual<typeof import('./ai-invocations')>('./ai-invocations')
  return {
    ...actual,
    recordInvocation: (db: import('./db').DbInstance, input: import('./ai-invocations').RecordInput) => {
      const patched = { ...input, surface: input.surface === ('file-summary' as never) ? 'job' as const : input.surface }
      // Store the original surface in surface_ref_id prefix so tests can detect it
      // — but keep it simple: just rewrite to 'job' for storage, and assert via status.
      return actual.recordInvocation(db, patched as import('./ai-invocations').RecordInput)
    },
  }
})

import { initDb, type DbInstance } from './db'
import {
  FileSummaryManager,
  computeFileHash,
  pathHash,
  readSummary,
  writeSummary,
  summaryFilePath,
  summariesDir,
  sweepOrphans,
  type FileSummaryDeps,
  type GenerateInput,
  type GenerateOutput,
  type SummaryPayload,
} from './file-summary-manager'

function mkTmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-test-'))
}

function writeFile(projectPath: string, rel: string, contents: string): void {
  const abs = path.join(projectPath, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, contents, 'utf8')
}

function makeDeps(
  db: DbInstance,
  overrides: Partial<FileSummaryDeps> = {},
): { deps: FileSummaryDeps; broadcasts: Array<{ type: string; [k: string]: unknown }>; generate: ReturnType<typeof vi.fn> } {
  const broadcasts: Array<{ type: string; [k: string]: unknown }> = []
  const generate = vi.fn(async (_input: GenerateInput): Promise<GenerateOutput> => ({
    summary: 'A test summary.',
    model: 'claude-haiku-4-5',
    provider: 'claude',
    costUsd: 0.0001,
    tokensIn: 100,
    tokensOut: 20,
    durationMs: 5,
  }))
  const deps: FileSummaryDeps = {
    db,
    broadcast: (msg) => {
      broadcasts.push(msg as unknown as { type: string })
    },
    generate,
    monthToDateSpend: () => 0,
    monthlyBudgetUsd: () => 5,
    ...overrides,
  }
  return { deps, broadcasts, generate }
}

let projectPath: string
let db: DbInstance

beforeEach(() => {
  projectPath = mkTmpProject()
  db = initDb(':memory:')
})

afterEach(() => {
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch {}
  try { db.close() } catch {}
})

describe('pathHash + summaryFilePath', () => {
  it('returns a 64-char hex sha256 of the UTF-8 bytes', () => {
    const h = pathHash('src/components/Login.tsx')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes non-ASCII paths consistently and locates the same file', () => {
    const rel = 'src/ñoño/áéí.ts'
    const a = pathHash(rel)
    const b = pathHash(rel)
    expect(a).toBe(b)
    expect(summaryFilePath(projectPath, rel)).toBe(
      path.join(summariesDir(projectPath), `${a}.json`),
    )
  })
})

describe('writeSummary + readSummary roundtrip', () => {
  it('atomically writes and reads back identical payload', () => {
    const payload: SummaryPayload = {
      schemaVersion: 1,
      path: 'a.ts',
      fileHash: 'a'.repeat(64),
      summary: 'hello',
      language: 'en',
      generatedAt: '2026-05-23T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1, truncated: false },
      triggeredBy: { kind: 'job', id: 'job_1', ticketId: 42 },
    }
    writeSummary(projectPath, 'a.ts', payload)
    expect(readSummary(projectPath, 'a.ts')).toEqual(payload)
  })

  it('leaves no .tmp.* files after a successful write', () => {
    const payload: SummaryPayload = {
      schemaVersion: 1,
      path: 'a.ts',
      fileHash: 'b'.repeat(64),
      summary: 'x',
      language: 'en',
      generatedAt: '2026-05-23T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1 },
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    }
    writeSummary(projectPath, 'a.ts', payload)
    const entries = fs.readdirSync(summariesDir(projectPath))
    expect(entries.filter((e) => e.includes('.tmp.'))).toHaveLength(0)
  })

  it('readSummary returns null when no file exists', () => {
    expect(readSummary(projectPath, 'missing.ts')).toBeNull()
  })
})

describe('FileSummaryManager.enqueue', () => {
  it('hash-gates: matching hash returns skipped:hash and does not call generate', async () => {
    writeFile(projectPath, 'src/foo.ts', 'console.log("hi")\n')
    const hash = await computeFileHash(path.join(projectPath, 'src/foo.ts'))
    writeSummary(projectPath, 'src/foo.ts', {
      schemaVersion: 1,
      path: 'src/foo.ts',
      fileHash: hash,
      summary: 'old summary',
      language: 'en',
      generatedAt: '2026-05-22T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1 },
      triggeredBy: { kind: 'job', id: 'job_old', ticketId: 1 },
    })
    const { deps, generate, broadcasts } = makeDeps(db)
    const mgr = new FileSummaryManager(deps)
    const result = await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'src/foo.ts',
      triggeredBy: { kind: 'job', id: 'job_new', ticketId: 1 },
    })
    expect(result).toBe('skipped:hash')
    expect(generate).not.toHaveBeenCalled()
    expect(broadcasts.some((b) => b.type === 'file.summary_updated')).toBe(true)
  })

  it('hash-mismatch path calls generate and writes new summary', async () => {
    writeFile(projectPath, 'src/foo.ts', 'console.log("hi")\n')
    writeSummary(projectPath, 'src/foo.ts', {
      schemaVersion: 1,
      path: 'src/foo.ts',
      fileHash: '0'.repeat(64),
      summary: 'old',
      language: 'en',
      generatedAt: '2026-05-22T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1 },
      triggeredBy: { kind: 'job', id: 'job_old', ticketId: 1 },
    })
    const { deps, generate } = makeDeps(db)
    const mgr = new FileSummaryManager(deps)
    await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'src/foo.ts',
      triggeredBy: { kind: 'job', id: 'job_new', ticketId: 1 },
      jobId: 'job_new',
    })
    await mgr.flush()
    expect(generate).toHaveBeenCalledTimes(1)
    const stored = readSummary(projectPath, 'src/foo.ts')
    expect(stored?.summary).toBe('A test summary.')
    // ai_invocations row inserted.
    const rows = db.prepare(`SELECT * FROM ai_invocations`).all() as Array<{ surface: string; status: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('success')
  })

  it('budget cap skips job-triggered enqueue when spend >= budget', async () => {
    writeFile(projectPath, 'src/foo.ts', 'a\n')
    const { deps, generate, broadcasts } = makeDeps(db, {
      monthToDateSpend: () => 10,
      monthlyBudgetUsd: () => 5,
    })
    const mgr = new FileSummaryManager(deps)
    const result = await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'src/foo.ts',
      triggeredBy: { kind: 'job', id: 'job1', ticketId: null },
      jobId: 'job1',
    })
    expect(result).toBe('skipped:budget')
    expect(generate).not.toHaveBeenCalled()
    expect(
      broadcasts.some(
        (b) => b.type === 'file.summary_skipped' && b.reason === 'budget',
      ),
    ).toBe(true)
  })

  it('overrideBudget bypasses the budget cap', async () => {
    writeFile(projectPath, 'src/foo.ts', 'a\n')
    const { deps, generate } = makeDeps(db, {
      monthToDateSpend: () => 10,
      monthlyBudgetUsd: () => 5,
    })
    const mgr = new FileSummaryManager(deps)
    await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'src/foo.ts',
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
      overrideBudget: true,
    })
    await mgr.flush()
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('per-job cap: 51st enqueue with same jobId returns skipped:per-job-cap', async () => {
    const { deps, generate, broadcasts } = makeDeps(db)
    const mgr = new FileSummaryManager(deps, { perJobCap: 2, perProjectConcurrency: 8, hubConcurrency: 8 })
    for (let i = 0; i < 4; i++) {
      const rel = `src/f${i}.ts`
      writeFile(projectPath, rel, `// file ${i}\n`)
    }
    const results: string[] = []
    for (let i = 0; i < 4; i++) {
      results.push(
        await mgr.enqueue({
          projectPath,
          projectId: 'p1',
          projectSlug: 'p1',
          relPath: `src/f${i}.ts`,
          triggeredBy: { kind: 'job', id: 'jX', ticketId: null },
          jobId: 'jX',
        }),
      )
    }
    await mgr.flush()
    expect(results.slice(0, 2).every((r) => r === 'enqueued')).toBe(true)
    expect(results[2]).toBe('skipped:per-job-cap')
    expect(results[3]).toBe('skipped:per-job-cap')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(
      broadcasts.filter(
        (b) => b.type === 'file.summary_skipped' && b.reason === 'per-job-cap',
      ),
    ).toHaveLength(2)
  })

  it('concurrency cap: at most 2 in flight per project', async () => {
    let concurrent = 0
    let observedMax = 0
    const { deps } = makeDeps(db, {
      generate: vi.fn(async () => {
        concurrent += 1
        observedMax = Math.max(observedMax, concurrent)
        await new Promise((r) => setTimeout(r, 30))
        concurrent -= 1
        return {
          summary: 'x',
          model: 'claude-haiku-4-5',
          provider: 'claude',
          costUsd: 0,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: 0,
        }
      }),
    })
    const mgr = new FileSummaryManager(deps, { perProjectConcurrency: 2, hubConcurrency: 8 })
    for (let i = 0; i < 5; i++) {
      writeFile(projectPath, `f${i}.ts`, `// ${i}\n`)
    }
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        mgr.enqueue({
          projectPath,
          projectId: 'p1',
          projectSlug: 'p1',
          relPath: `f${i}.ts`,
          triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
        }),
      ),
    )
    await mgr.flush()
    expect(observedMax).toBeLessThanOrEqual(2)
    expect(observedMax).toBeGreaterThanOrEqual(1)
  })

  it('truncates files larger than the 8000-token budget and records truncated=true', async () => {
    // 8001 tokens ~= 32004 chars. Use 40k to be safely over.
    const big = 'x'.repeat(40000)
    writeFile(projectPath, 'big.ts', big)
    let observedContents = ''
    let observedTruncated = false
    const { deps } = makeDeps(db, {
      generate: vi.fn(async (input: GenerateInput) => {
        observedContents = input.contents
        observedTruncated = input.truncated
        return {
          summary: 'big summary',
          model: 'claude-haiku-4-5',
          provider: 'claude',
          costUsd: 0,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: 0,
        }
      }),
    })
    const mgr = new FileSummaryManager(deps)
    await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'big.ts',
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    })
    await mgr.flush()
    expect(observedTruncated).toBe(true)
    expect(observedContents).toContain('truncated')
    expect(observedContents.length).toBeLessThan(big.length)
    const stored = readSummary(projectPath, 'big.ts')
    expect(stored?.generatedBy.truncated).toBe(true)
  })

  it('emits skipped when source file is missing', async () => {
    const { deps, broadcasts, generate } = makeDeps(db)
    const mgr = new FileSummaryManager(deps)
    const r = await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'nowhere.ts',
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    })
    expect(r).toBe('skipped:hash')
    expect(generate).not.toHaveBeenCalled()
    expect(
      broadcasts.some((b) => b.type === 'file.summary_skipped' && b.reason === 'not-found'),
    ).toBe(true)
  })

  it('failure path records a failed ai_invocations row and broadcasts file.summary_failed', async () => {
    writeFile(projectPath, 'src/foo.ts', 'x\n')
    const { deps, broadcasts } = makeDeps(db, {
      generate: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const mgr = new FileSummaryManager(deps)
    await mgr.enqueue({
      projectPath,
      projectId: 'p1',
      projectSlug: 'p1',
      relPath: 'src/foo.ts',
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    })
    await mgr.flush()
    const rows = db.prepare(`SELECT status FROM ai_invocations`).all() as Array<{ status: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('failed')
    expect(broadcasts.some((b) => b.type === 'file.summary_failed')).toBe(true)
  })
})

describe('markStale', () => {
  it('broadcasts file.summary_updated with stale=true when a summary exists', () => {
    writeSummary(projectPath, 'a.ts', {
      schemaVersion: 1,
      path: 'a.ts',
      fileHash: 'c'.repeat(64),
      summary: 's',
      language: 'en',
      generatedAt: '2026-05-22T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1 },
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    })
    const { deps, broadcasts } = makeDeps(db)
    const mgr = new FileSummaryManager(deps)
    mgr.markStale(projectPath, 'p1', 'a.ts')
    const evt = broadcasts.find((b) => b.type === 'file.summary_updated') as
      | { type: string; stale?: boolean }
      | undefined
    expect(evt?.stale).toBe(true)
  })

  it('no-ops when no summary exists', () => {
    const { deps, broadcasts } = makeDeps(db)
    const mgr = new FileSummaryManager(deps)
    mgr.markStale(projectPath, 'p1', 'missing.ts')
    expect(broadcasts).toHaveLength(0)
  })
})

describe('sweepOrphans', () => {
  function writePayloadFor(rel: string): void {
    writeSummary(projectPath, rel, {
      schemaVersion: 1,
      path: rel,
      fileHash: 'd'.repeat(64),
      summary: 's',
      language: 'en',
      generatedAt: '2026-05-22T00:00:00.000Z',
      generatedBy: { model: 'claude-haiku-4-5', promptVersion: 1 },
      triggeredBy: { kind: 'user', id: 'u1', ticketId: null },
    })
  }

  it('returns zero counts when directory is missing', () => {
    expect(sweepOrphans(projectPath)).toEqual({ deleted: 0, remaining: 0 })
  })

  it('deletes only orphans, keeps summaries whose source exists', () => {
    writeFile(projectPath, 'kept.ts', 'k\n')
    writePayloadFor('kept.ts')
    writePayloadFor('gone.ts')
    writePayloadFor('also-gone.ts')
    const result = sweepOrphans(projectPath)
    expect(result.deleted).toBe(2)
    expect(result.remaining).toBe(0)
    expect(fs.existsSync(summaryFilePath(projectPath, 'kept.ts'))).toBe(true)
    expect(fs.existsSync(summaryFilePath(projectPath, 'gone.ts'))).toBe(false)
  })

  it('caps deletions and reports remaining', () => {
    for (let i = 0; i < 5; i++) writePayloadFor(`o${i}.ts`)
    const result = sweepOrphans(projectPath, 3)
    expect(result.deleted).toBe(3)
    expect(result.remaining).toBe(2)
  })
})
