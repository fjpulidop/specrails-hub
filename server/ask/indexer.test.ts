import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { upsertDoc } from './indexer'
import { chunkTicket } from './chunker'
import { getDocByKey } from './storage'

// Force the embedder fallback path (no model bundled in tests)
vi.mock('./embedder', async () => {
  return {
    embed: async (text: string) => {
      const v = new Float32Array(384)
      for (let i = 0; i < 384; i++) v[i] = ((text.charCodeAt(i % text.length) || 0) % 7) / 10
      return v
    },
    embedBatch: async (texts: string[]) => texts.map(() => new Float32Array(384)),
    bufferFromVector: (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
    vectorFromBuffer: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
    isEmbedderDegraded: () => ({ degraded: false, reason: null }),
    warmup: async () => {},
    EMBEDDING_DIM: 384,
  }
})

describe('upsertDoc', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('inserts new doc', async () => {
    const d = chunkTicket({ id: 1, title: 'A', description: 'x', updated_at: '2026' })
    const r = await upsertDoc(db, 'proj', d)
    expect(r.status).toBe('inserted')
    expect(getDocByKey(db, 'ticket', d.source_id)).not.toBeNull()
  })

  it('skips re-embed when body_hash unchanged', async () => {
    const d = chunkTicket({ id: 1, title: 'A', description: 'x', updated_at: '2026' })
    await upsertDoc(db, 'proj', d)
    const r2 = await upsertDoc(db, 'proj', d)
    expect(r2.status).toBe('unchanged')
  })

  it('updates when body_hash changes', async () => {
    const d1 = chunkTicket({ id: 1, title: 'A', description: 'x', updated_at: '2026' })
    await upsertDoc(db, 'proj', d1)
    const d2 = chunkTicket({ id: 1, title: 'A v2', description: 'x', updated_at: '2026' })
    const r = await upsertDoc(db, 'proj', d2)
    expect(r.status).toBe('updated')
    expect(getDocByKey(db, 'ticket', d2.source_id)?.title).toBe('A v2')
  })

  it('removeDoc deletes and invalidates cache', async () => {
    const { removeDoc } = await import('./indexer')
    const d = chunkTicket({ id: 1, title: 'A', description: 'x', updated_at: '2026' })
    await upsertDoc(db, 'proj', d)
    removeDoc(db, 'proj', 'ticket', d.source_id)
    expect(getDocByKey(db, 'ticket', d.source_id)).toBeNull()
  })

  it('upsertDocs aggregates counts across mixed inserts and skips', async () => {
    const { upsertDocs } = await import('./indexer')
    const a = chunkTicket({ id: 1, title: 'A', description: 'x', updated_at: '2026' })
    const b = chunkTicket({ id: 2, title: 'B', description: 'y', updated_at: '2026' })
    const r1 = await upsertDocs(db, 'proj', [a, b])
    expect(r1).toEqual({ inserted: 2, updated: 0, unchanged: 0 })
    const r2 = await upsertDocs(db, 'proj', [a, b])
    expect(r2).toEqual({ inserted: 0, updated: 0, unchanged: 2 })
  })
})
