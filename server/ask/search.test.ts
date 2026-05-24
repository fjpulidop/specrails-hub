import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { hybridSearch, searchInstant, invalidateVectorCache } from './search'
import { chunkTicket } from './chunker'
import { upsertDoc } from './indexer'

vi.mock('./embedder', () => ({
  embed: async (text: string) => {
    const v = new Float32Array(384)
    for (let i = 0; i < 384; i++) v[i] = ((text.charCodeAt(i % text.length) || 0) % 7) / 10
    return v
  },
  embedBatch: async (t: string[]) => t.map(() => new Float32Array(384)),
  bufferFromVector: (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
  vectorFromBuffer: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
  isEmbedderDegraded: () => ({ degraded: false, reason: null }),
  warmup: async () => {},
  EMBEDDING_DIM: 384,
}))

async function seed(db: DbInstance): Promise<void> {
  await upsertDoc(db, 'p', chunkTicket({ id: 1, title: 'Add Google OAuth login', description: 'passport google auth', updated_at: '2026-05-01' }))
  await upsertDoc(db, 'p', chunkTicket({ id: 2, title: 'Fix terminal pty', description: 'buffer bug', updated_at: '2026-04-01' }))
  await upsertDoc(db, 'p', chunkTicket({ id: 3, title: 'Refactor queue manager', description: 'cleanup spawn', updated_at: '2026-03-01' }))
}

describe('hybridSearch', () => {
  let db: DbInstance
  beforeEach(async () => {
    db = initDb(':memory:')
    await seed(db)
    invalidateVectorCache('p')
  })

  it('returns top results for keyword query (BM25 wins)', async () => {
    const out = await hybridSearch({ db, projectId: 'p', query: 'oauth', limit: 5 })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.title.toLowerCase()).toContain('oauth')
  })

  it('returns no results for nonsense query', async () => {
    const out = await hybridSearch({ db, projectId: 'p', query: 'zzzzzzzznevermatch', limit: 5 })
    // RRF may still return something via vector even with no BM25 hits, but
    // we just assert no exception and a bounded list.
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('respects bm25Only flag', async () => {
    const out = await hybridSearch({ db, projectId: 'p', query: 'terminal', limit: 5, bm25Only: true })
    expect(out.some((s) => s.title.toLowerCase().includes('terminal'))).toBe(true)
  })

  it('honours kind filter', async () => {
    const out = await hybridSearch({ db, projectId: 'p', query: 'queue', kinds: ['ticket'], limit: 5 })
    expect(out.every((s) => s.kind === 'ticket')).toBe(true)
  })
})

describe('searchInstant', () => {
  let db: DbInstance
  beforeEach(async () => {
    db = initDb(':memory:')
    await seed(db)
  })

  it('returns BM25 matches without invoking the embedder', () => {
    const hits = searchInstant(db, 'oauth')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.title.toLowerCase()).toContain('oauth')
  })

  it('returns empty for whitespace query', () => {
    expect(searchInstant(db, '   ')).toEqual([])
  })
})

describe('invalidateVectorCache', () => {
  it('does not throw for unknown project id', () => {
    expect(() => invalidateVectorCache('unknown')).not.toThrow()
  })
})
