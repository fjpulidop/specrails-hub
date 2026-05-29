import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { runBackfill, indexOne } from './backfill'
import { chunkTicket } from './chunker'
import { countDocs } from './storage'

vi.mock('./embedder', () => ({
  embed: async () => new Float32Array(384),
  embedBatch: async (t: string[]) => t.map(() => new Float32Array(384)),
  bufferFromVector: (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
  vectorFromBuffer: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
  isEmbedderDegraded: () => ({ degraded: false, reason: null }),
  warmup: async () => {},
  EMBEDDING_DIM: 384,
}))

vi.mock('./enumerator', () => ({
  enumerateAll: async () => [
    { kind: 'ticket' as const, source_id: 'ticket:1', title: 'A', body: 'body A', body_hash: 'h1', ts: 1, model: 'm' },
    { kind: 'ticket' as const, source_id: 'ticket:2', title: 'B', body: 'body B', body_hash: 'h2', ts: 2, model: 'm' },
    { kind: 'job' as const, source_id: 'job:1', title: 'J1', body: 'job body', body_hash: 'h3', ts: 3, model: 'm' },
  ],
  enumerateTickets: () => [],
  enumerateExploreTurns: () => [],
  enumerateJobs: () => [],
  enumerateFileSummaries: () => [],
  enumerateGitCommits: async () => [],
}))

describe('runBackfill', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('inserts all docs and emits progress events', async () => {
    const events: Array<Record<string, unknown>> = []
    const broadcast = (msg: Record<string, unknown>) => { events.push(msg) }
    const result = await runBackfill({ db, projectPath: '/tmp', projectStateDir: '/tmp' }, 'p', broadcast)
    expect(result.total).toBe(3)
    expect(result.inserted).toBe(3)
    expect(countDocs(db)).toBe(3)
    // enumerate phase + at least one embed event + done
    const phases = events.filter((e) => e.type === 'ask.indexing').map((e) => e.phase)
    expect(phases).toContain('enumerate')
    expect(phases).toContain('done')
    expect(events.some((e) => e.type === 'ask.index_updated')).toBe(true)
  })

  it('is idempotent on re-run (all unchanged)', async () => {
    await runBackfill({ db, projectPath: '/tmp', projectStateDir: '/tmp' }, 'p', () => {})
    const events: Array<Record<string, unknown>> = []
    const r2 = await runBackfill({ db, projectPath: '/tmp', projectStateDir: '/tmp' }, 'p', (m) => events.push(m))
    expect(r2.unchanged).toBe(3)
    expect(r2.inserted).toBe(0)
    expect(countDocs(db)).toBe(3)
  })
})

describe('indexOne', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('upserts a single doc and broadcasts on change', async () => {
    const events: Array<Record<string, unknown>> = []
    await indexOne({ db, projectPath: '/tmp', projectStateDir: '' }, 'p', chunkTicket({ id: 1, title: 'a', description: 'x', updated_at: '2026' }), (m) => events.push(m))
    expect(events.some((e) => e.type === 'ask.index_updated')).toBe(true)
  })

  it('does not broadcast on unchanged upsert', async () => {
    const doc = chunkTicket({ id: 1, title: 'a', description: 'x', updated_at: '2026' })
    await indexOne({ db, projectPath: '/tmp', projectStateDir: '' }, 'p', doc, () => {})
    const events: Array<Record<string, unknown>> = []
    await indexOne({ db, projectPath: '/tmp', projectStateDir: '' }, 'p', doc, (m) => events.push(m))
    expect(events).toHaveLength(0)
  })
})
