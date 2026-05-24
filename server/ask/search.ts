// Hybrid search: BM25 (FTS5) + cosine over in-memory vector cache, fused
// with Reciprocal Rank Fusion (RRF). Heuristic reranker by default.

import type { DbInstance } from '../db'
import type { AskDocKind, RankedSource } from './types'
import { bm25Search, hydrateSources, loadAllEmbeddings } from './storage'
import { embed } from './embedder'

interface CacheEntry {
  built: number
  rowids: Int32Array
  vectors: Float32Array // flat dim*N
  kinds: AskDocKind[]
  ts: Float64Array
}

const cache = new Map<string, CacheEntry>()
const EMBED_DIM = 384

/** Clears the in-memory vector cache for a project. Called when the index
 *  changes materially. */
export function invalidateVectorCache(projectId: string): void {
  cache.delete(projectId)
}

function buildCache(projectId: string, db: DbInstance): CacheEntry {
  const all = loadAllEmbeddings(db)
  const rowids = new Int32Array(all.length)
  const ts = new Float64Array(all.length)
  const vectors = new Float32Array(all.length * EMBED_DIM)
  const kinds: AskDocKind[] = new Array(all.length)
  for (let i = 0; i < all.length; i++) {
    rowids[i] = all[i]!.rowid
    kinds[i] = all[i]!.kind
    ts[i] = all[i]!.ts
    vectors.set(all[i]!.vector, i * EMBED_DIM)
  }
  const entry: CacheEntry = { built: Date.now(), rowids, vectors, kinds, ts }
  cache.set(projectId, entry)
  return entry
}

function getCache(projectId: string, db: DbInstance): CacheEntry {
  const c = cache.get(projectId)
  if (c) return c
  return buildCache(projectId, db)
}

function cosineTop(entry: CacheEntry, query: Float32Array, limit: number, kinds?: AskDocKind[]): Array<{ rowid: number; score: number; rank: number }> {
  const n = entry.rowids.length
  const dim = EMBED_DIM
  const heap: Array<{ rowid: number; score: number }> = []
  for (let i = 0; i < n; i++) {
    if (kinds && kinds.length > 0 && !kinds.includes(entry.kinds[i]!)) continue
    let dot = 0
    const base = i * dim
    for (let d = 0; d < dim; d++) dot += entry.vectors[base + d]! * query[d]!
    heap.push({ rowid: entry.rowids[i]!, score: dot })
  }
  heap.sort((a, b) => b.score - a.score)
  return heap.slice(0, limit).map((h, i) => ({ ...h, rank: i + 1 }))
}

function rrfFuse(
  bm25: Array<{ rowid: number; rank: number }>,
  vector: Array<{ rowid: number; rank: number }>,
  k = 60,
): Map<number, number> {
  const scores = new Map<number, number>()
  for (const r of bm25) scores.set(r.rowid, (scores.get(r.rowid) ?? 0) + 1 / (k + r.rank))
  for (const r of vector) scores.set(r.rowid, (scores.get(r.rowid) ?? 0) + 1 / (k + r.rank))
  return scores
}

const KIND_WEIGHT: Record<AskDocKind, number> = {
  ticket: 1.2,
  'explore-turn': 1.0,
  job: 0.9,
  'file-summary': 0.95,
  'git-commit': 0.7,
}

function heuristicRerank(sources: RankedSource[], fused: Map<number, number>): RankedSource[] {
  const nowDays = Date.now() / 86400000
  return sources
    .map((s) => {
      const fusedScore = fused.get(s.rowid) ?? 0
      const ageDays = Math.max(0, nowDays - s.ts / 86400000)
      const recency = 1 / (1 + ageDays / 30) // half-life ~30 days
      const kw = KIND_WEIGHT[s.kind] ?? 1
      return { ...s, score: fusedScore * recency * kw }
    })
    .sort((a, b) => b.score - a.score)
}

export interface HybridSearchOptions {
  query: string
  projectId: string
  db: DbInstance
  kinds?: AskDocKind[]
  limit?: number
  /** Skip vector search even if cache available. Useful for the instant path. */
  bm25Only?: boolean
}

export async function hybridSearch(opts: HybridSearchOptions): Promise<RankedSource[]> {
  const limit = opts.limit ?? 20
  const bm25 = bm25Search(opts.db, opts.query, 50, opts.kinds)
  let vector: Array<{ rowid: number; score: number; rank: number }> = []
  if (!opts.bm25Only) {
    try {
      const c = getCache(opts.projectId, opts.db)
      if (c.rowids.length > 0) {
        const qVec = await embed(`query: ${opts.query}`)
        vector = cosineTop(c, qVec, 50, opts.kinds)
      }
    } catch {
      // Degraded — vector path silently skipped.
    }
  }
  const fused = rrfFuse(bm25, vector)
  const top = Array.from(fused.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(limit, 8))
    .map(([rowid]) => rowid)
  const hydrated = hydrateSources(opts.db, top)
  return heuristicRerank(hydrated, fused).slice(0, limit)
}

/** Instant BM25-only search used by Cmd+K typing path. < 50ms target. */
export function searchInstant(db: DbInstance, query: string, kinds?: AskDocKind[], limit = 20): RankedSource[] {
  const bm25 = bm25Search(db, query, limit, kinds)
  if (bm25.length === 0) return []
  const hydrated = hydrateSources(db, bm25.map((r) => r.rowid))
  const ranked = hydrated.map((s, i) => ({ ...s, score: bm25[i]?.score ?? 0 }))
  return ranked
}

/** Hybrid instant search — BM25 + vector cosine fused. Slower than `searchInstant`
 *  (~150-300ms) but materially better recall for short / typo'd queries. Used
 *  by the Cmd+K search endpoint when the user types a real word but BM25 alone
 *  misses (e.g. "auth" should also surface explore turns about "login flow"). */
export async function searchHybridInstant(db: DbInstance, projectId: string, query: string, kinds?: AskDocKind[], limit = 20): Promise<RankedSource[]> {
  const out = await hybridSearch({ db, projectId, query, kinds, limit })
  return out
}
