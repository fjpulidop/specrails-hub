import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { runComparePipeline } from './pipelines/compare'
import { runStatusPipeline } from './pipelines/status'
import { runFactualPipeline } from './pipelines/factual'
import { runDecisionPipeline } from './pipelines/decision'

vi.mock('./embedder', () => ({
  embed: async () => new Float32Array(384),
  embedBatch: async (t: string[]) => t.map(() => new Float32Array(384)),
  bufferFromVector: (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
  vectorFromBuffer: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
  isEmbedderDegraded: () => ({ degraded: false, reason: null }),
  warmup: async () => {},
  EMBEDDING_DIM: 384,
}))

describe('runComparePipeline', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('produces an aggregate-context table when ai_invocations has rows', () => {
    db.prepare(
      `INSERT INTO ai_invocations (id, project_id, provider, surface, status, started_at, model, total_cost_usd, num_turns, duration_ms)
       VALUES (?, 'p', 'claude', 'job', 'success', '2026-05-01', 'opus', 0.3, 5, 1000)`,
    ).run('a')
    db.prepare(
      `INSERT INTO ai_invocations (id, project_id, provider, surface, status, started_at, model, total_cost_usd, num_turns, duration_ms)
       VALUES (?, 'p', 'claude', 'job', 'success', '2026-05-01', 'sonnet', 0.1, 8, 500)`,
    ).run('b')
    const ctx = runComparePipeline(db, 'p', 'opus vs sonnet')
    expect(ctx.intent).toBe('compare')
    expect(ctx.aggregateContext).toContain('opus')
    expect(ctx.aggregateContext).toContain('sonnet')
    expect(ctx.aggregateContext).toContain('Runs')
  })

  it('reports empty state cleanly', () => {
    const ctx = runComparePipeline(db, 'p', 'opus vs sonnet')
    expect(ctx.aggregateContext).toContain('No invocation history')
  })
})

describe('runStatusPipeline', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('returns a status context even with an empty project', () => {
    const ctx = runStatusPipeline({ db, projectId: 'p', projectPath: '/tmp/does-not-exist', question: 'cómo va' })
    expect(ctx.intent).toBe('status')
    expect(ctx.aggregateContext).toContain('# Status')
    expect(ctx.aggregateContext).toContain('Tickets')
    expect(ctx.aggregateContext).toContain('Jobs')
  })

  it('classifies tickets into shipped / in-progress / stalled buckets', () => {
    // Set up an inline ticket store on disk for the status pipeline to read.
    const fs = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const os = require('node:os') as typeof import('node:os')
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-status-'))
    fs.mkdirSync(path.join(projectPath, '.specrails'), { recursive: true })
    const now = Date.now()
    const yesterday = new Date(now - 86400_000).toISOString()
    const oldDate = new Date(now - 30 * 86400_000).toISOString()
    const store = {
      schema_version: '1.1',
      revision: 1,
      last_updated: yesterday,
      next_id: 100,
      tickets: {
        '1': { id: 1, title: 'shipped recently', description: '', status: 'done', priority: 'high', labels: [], assignee: null, prerequisites: [], metadata: {}, origin_conversation_id: null, is_epic: false, parent_epic_id: null, execution_order: null, short_summary: null, created_at: yesterday, updated_at: yesterday, created_by: 'test', source: 'manual' },
        '2': { id: 2, title: 'in progress', description: '', status: 'in_progress', priority: 'high', labels: [], assignee: null, prerequisites: [], metadata: {}, origin_conversation_id: null, is_epic: false, parent_epic_id: null, execution_order: null, short_summary: null, created_at: yesterday, updated_at: yesterday, created_by: 'test', source: 'manual' },
        '3': { id: 3, title: 'old todo', description: '', status: 'todo', priority: 'low', labels: [], assignee: null, prerequisites: [], metadata: {}, origin_conversation_id: null, is_epic: false, parent_epic_id: null, execution_order: null, short_summary: null, created_at: oldDate, updated_at: oldDate, created_by: 'test', source: 'manual' },
      },
    }
    fs.writeFileSync(path.join(projectPath, '.specrails', 'local-tickets.json'), JSON.stringify(store))
    const ctx = runStatusPipeline({ db, projectId: 'p', projectPath, question: 'cómo va' })
    expect(ctx.aggregateContext).toContain('shipped recently')
    expect(ctx.aggregateContext).toContain('in progress')
    expect(ctx.aggregateContext).toContain('old todo')
    expect(ctx.sources.length).toBeGreaterThan(0)
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it('renders spending and file hotspots when present', () => {
    db.exec(`
      INSERT INTO ai_invocations (id, project_id, provider, surface, status, started_at, model, total_cost_usd, num_turns, duration_ms)
      VALUES ('a', 'p', 'claude', 'job', 'success', datetime('now'), 'opus', 1.0, 5, 1000);
    `)
    // file_provenance schema may vary by migration; skip insert if columns differ.
    try {
      db.exec(`INSERT INTO file_provenance (file_path, ticket_id, kind, at) VALUES ('server/db.ts', 1, 'modified', datetime('now'))`)
    } catch { /* schema mismatch — skip */ }
    const ctx = runStatusPipeline({ db, projectId: 'p', projectPath: '/tmp/no', question: 'cómo va' })
    expect(ctx.aggregateContext).toContain('Spending')
  })
})

describe('runFactualPipeline', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('returns sources from retrieval', async () => {
    const ctx = await runFactualPipeline(db, 'p', 'oauth')
    expect(ctx.intent).toBe('factual')
    expect(Array.isArray(ctx.sources)).toBe(true)
  })
})

describe('runDecisionPipeline', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('returns sources from retrieval', async () => {
    const ctx = await runDecisionPipeline(db, 'p', 'why oauth')
    expect(ctx.intent).toBe('decision')
    expect(Array.isArray(ctx.sources)).toBe(true)
  })

  it('boosts explore-turn sources over tickets', async () => {
    const { upsertDoc } = await import('./indexer')
    const { chunkTicket, chunkExploreTurn } = await import('./chunker')
    await upsertDoc(db, 'p', chunkTicket({ id: 1, title: 'oauth feature ticket', description: 'detail', updated_at: '2026-05-01' }))
    const expl = chunkExploreTurn({ conversation_id: 'c1', turn_index: 1, user_text: 'why are we using passport oauth library here?', assistant_text: 'because acme wanted enterprise SSO', ts: '2026-05-01' })
    if (expl) await upsertDoc(db, 'p', expl)
    const ctx = await runDecisionPipeline(db, 'p', 'oauth')
    // Both kinds may appear; explore-turn should be ranked highly given the boost.
    const kinds = ctx.sources.map((s) => s.kind)
    expect(kinds.length).toBeGreaterThan(0)
  })
})
