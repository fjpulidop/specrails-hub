// Per-project ask_docs storage helpers.

import type { DbInstance } from '../db'
import type { AskDoc, AskDocKind, RankedSource } from './types'
import { bufferFromVector, vectorFromBuffer } from './embedder'

export interface AskDocRow extends AskDoc {
  rowid: number
}

export function getDocByKey(db: DbInstance, kind: AskDocKind, source_id: string): AskDocRow | null {
  const row = db
    .prepare('SELECT * FROM ask_docs WHERE kind = ? AND source_id = ?')
    .get(kind, source_id) as AskDocRow | undefined
  return row ?? null
}

export function insertDoc(db: DbInstance, doc: AskDoc, vector: Float32Array | null): number {
  const stmt = db.prepare(`
    INSERT INTO ask_docs (
      kind, source_id, ticket_id, job_id, conversation_id, file_path,
      title, body, body_hash, ts, model, schema_version, embedding
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const r = stmt.run(
    doc.kind,
    doc.source_id,
    doc.ticket_id ?? null,
    doc.job_id ?? null,
    doc.conversation_id ?? null,
    doc.file_path ?? null,
    doc.title,
    doc.body,
    doc.body_hash,
    doc.ts,
    doc.model,
    doc.schema_version ?? 1,
    vector ? bufferFromVector(vector) : null,
  )
  return Number(r.lastInsertRowid)
}

export function updateDoc(db: DbInstance, rowid: number, doc: AskDoc, vector: Float32Array | null): void {
  db.prepare(`
    UPDATE ask_docs SET
      ticket_id       = ?,
      job_id          = ?,
      conversation_id = ?,
      file_path       = ?,
      title           = ?,
      body            = ?,
      body_hash       = ?,
      ts              = ?,
      model           = ?,
      schema_version  = ?,
      embedding       = ?
    WHERE rowid = ?
  `).run(
    doc.ticket_id ?? null,
    doc.job_id ?? null,
    doc.conversation_id ?? null,
    doc.file_path ?? null,
    doc.title,
    doc.body,
    doc.body_hash,
    doc.ts,
    doc.model,
    doc.schema_version ?? 1,
    vector ? bufferFromVector(vector) : null,
    rowid,
  )
}

export function deleteDoc(db: DbInstance, kind: AskDocKind, source_id: string): void {
  db.prepare('DELETE FROM ask_docs WHERE kind = ? AND source_id = ?').run(kind, source_id)
}

export function countDocs(db: DbInstance): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM ask_docs').get() as { n: number }
  return r.n
}

export function countByKind(db: DbInstance): Record<AskDocKind, number> {
  const rows = db.prepare('SELECT kind, COUNT(*) AS n FROM ask_docs GROUP BY kind').all() as Array<{ kind: AskDocKind; n: number }>
  const out: Record<string, number> = {}
  for (const r of rows) out[r.kind] = r.n
  return out as Record<AskDocKind, number>
}

export interface SearchHit {
  rowid: number
  rank: number
  score: number
}

export function bm25Search(db: DbInstance, query: string, limit = 50, kinds?: AskDocKind[]): SearchHit[] {
  const safeQuery = sanitizeFtsQuery(query)
  if (!safeQuery) return []
  let sql = `
    SELECT rowid, bm25(ask_docs_fts) AS score
    FROM ask_docs_fts
    WHERE ask_docs_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(safeQuery, limit) as Array<{ rowid: number; score: number }>
  if (!kinds || kinds.length === 0) {
    return rows.map((r, i) => ({ rowid: r.rowid, rank: i + 1, score: -r.score }))
  }
  const keep = new Set(
    (db.prepare(`SELECT rowid FROM ask_docs WHERE rowid IN (${rows.map(() => '?').join(',') || 'NULL'}) AND kind IN (${kinds.map(() => '?').join(',')})`).all(
      ...rows.map((r) => r.rowid),
      ...kinds,
    ) as Array<{ rowid: number }>).map((r) => r.rowid),
  )
  return rows.filter((r) => keep.has(r.rowid)).map((r, i) => ({ rowid: r.rowid, rank: i + 1, score: -r.score }))
}

/** Build an FTS5 MATCH expression: each token becomes a prefix-match (`token*`)
 *  joined with OR, so partial words / morphology / mid-word matches all hit.
 *  Stop-words ≤ 2 chars are dropped to avoid noise. */
export function sanitizeFtsQuery(q: string): string {
  const tokens = q
    .replace(/["()*:^~?¿!¡.,;]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return ''
  return tokens
    .map((t) => `"${t.replace(/"/g, '')}"*`)
    .join(' OR ')
}

export function loadAllEmbeddings(db: DbInstance): Array<{ rowid: number; vector: Float32Array; kind: AskDocKind; ts: number }> {
  const rows = db
    .prepare('SELECT rowid, kind, ts, embedding FROM ask_docs WHERE embedding IS NOT NULL')
    .all() as Array<{ rowid: number; kind: AskDocKind; ts: number; embedding: Buffer }>
  return rows.map((r) => ({ rowid: r.rowid, kind: r.kind, ts: r.ts, vector: vectorFromBuffer(r.embedding) }))
}

export function hydrateSources(db: DbInstance, rowids: number[]): RankedSource[] {
  if (rowids.length === 0) return []
  const placeholders = rowids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT * FROM ask_docs WHERE rowid IN (${placeholders})`)
    .all(...rowids) as AskDocRow[]
  const byRowid = new Map(rows.map((r) => [r.rowid, r]))
  return rowids
    .map((id) => byRowid.get(id))
    .filter((r): r is AskDocRow => r !== undefined)
    .map((r) => ({
      rowid: r.rowid,
      kind: r.kind,
      source_id: r.source_id,
      title: r.title,
      body: r.body,
      ts: r.ts,
      ticket_id: r.ticket_id ?? null,
      job_id: r.job_id ?? null,
      conversation_id: r.conversation_id ?? null,
      file_path: r.file_path ?? null,
      score: 0,
    }))
}
