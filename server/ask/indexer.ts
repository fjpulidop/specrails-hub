// Indexer — upserts AskDocs and maintains the per-project semantic index.
//
// Event-driven incremental + on-demand backfill. Embedding cost is paid only
// when body_hash differs from the stored row.

import type { DbInstance } from '../db'
import type { AskDoc } from './types'
import { embed } from './embedder'
import { getDocByKey, insertDoc, updateDoc, deleteDoc } from './storage'
import { invalidateVectorCache } from './search'

const MAX_DOCS_PER_PROJECT = 100_000

export interface UpsertResult {
  status: 'inserted' | 'updated' | 'unchanged'
  rowid: number | null
}

export async function upsertDoc(db: DbInstance, projectId: string, doc: AskDoc): Promise<UpsertResult> {
  const existing = getDocByKey(db, doc.kind, doc.source_id)
  if (existing && existing.body_hash === doc.body_hash) {
    return { status: 'unchanged', rowid: existing.rowid }
  }
  const vector = await safeEmbed(doc.body)
  if (existing) {
    updateDoc(db, existing.rowid, doc, vector)
    invalidateVectorCache(projectId)
    return { status: 'updated', rowid: existing.rowid }
  }
  const count = (db.prepare('SELECT COUNT(*) AS n FROM ask_docs').get() as { n: number }).n
  if (count >= MAX_DOCS_PER_PROJECT) {
    // FIFO sweep: drop oldest non-ticket docs until we have headroom.
    db.prepare(`
      DELETE FROM ask_docs WHERE rowid IN (
        SELECT rowid FROM ask_docs WHERE kind != 'ticket' ORDER BY ts ASC LIMIT 100
      )
    `).run()
  }
  const rowid = insertDoc(db, doc, vector)
  invalidateVectorCache(projectId)
  return { status: 'inserted', rowid }
}

async function safeEmbed(text: string): Promise<Float32Array | null> {
  try {
    return await embed(`passage: ${text}`)
  } catch {
    return null
  }
}

export async function upsertDocs(db: DbInstance, projectId: string, docs: AskDoc[]): Promise<{ inserted: number; updated: number; unchanged: number }> {
  let inserted = 0
  let updated = 0
  let unchanged = 0
  for (const d of docs) {
    const r = await upsertDoc(db, projectId, d)
    if (r.status === 'inserted') inserted++
    else if (r.status === 'updated') updated++
    else unchanged++
  }
  return { inserted, updated, unchanged }
}

export function removeDoc(db: DbInstance, projectId: string, kind: AskDoc['kind'], source_id: string): void {
  deleteDoc(db, kind, source_id)
  invalidateVectorCache(projectId)
}
