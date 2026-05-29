// Backfill — one-shot enumerate + batched upsert with progress broadcasts.

import type { DbInstance } from '../db'
import type { AskDoc } from './types'
import { enumerateAll, type EnumerationContext } from './enumerator'
import { upsertDoc } from './indexer'

export type Broadcast = (msg: Record<string, unknown>) => void

const BATCH_SIZE = 25

export interface BackfillResult {
  total: number
  inserted: number
  updated: number
  unchanged: number
}

export async function runBackfill(
  ctx: EnumerationContext,
  projectId: string,
  broadcast: Broadcast,
): Promise<BackfillResult> {
  broadcast({ type: 'ask.indexing', phase: 'enumerate', current: 0, total: 0 })
  const docs = await enumerateAll(ctx)
  const total = docs.length
  broadcast({ type: 'ask.indexing', phase: 'embed', current: 0, total })

  let inserted = 0
  let updated = 0
  let unchanged = 0
  let processed = 0
  let lastReport = 0

  for (const doc of docs) {
    const r = await upsertDoc(ctx.db, projectId, doc)
    if (r.status === 'inserted') inserted++
    else if (r.status === 'updated') updated++
    else unchanged++
    processed++
    if (processed - lastReport >= BATCH_SIZE || processed === total) {
      lastReport = processed
      broadcast({ type: 'ask.indexing', phase: 'embed', current: processed, total })
    }
  }

  broadcast({ type: 'ask.indexing', phase: 'done', current: total, total })
  broadcast({ type: 'ask.index_updated', added: inserted, removed: 0, updated })
  return { total, inserted, updated, unchanged }
}

/** Upserts a single doc and broadcasts the index_updated event. */
export async function indexOne(
  ctx: EnumerationContext,
  projectId: string,
  doc: AskDoc,
  broadcast: Broadcast,
): Promise<void> {
  const r = await upsertDoc(ctx.db, projectId, doc)
  if (r.status !== 'unchanged') {
    broadcast({ type: 'ask.index_updated', added: r.status === 'inserted' ? 1 : 0, removed: 0, updated: r.status === 'updated' ? 1 : 0 })
  }
}
