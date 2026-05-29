import type { DbInstance } from '../db'

export interface QueryLogRow {
  id: number
  query: string
  scope: string | null
  intent: string | null
  model: string | null
  provider: string | null
  sources_count: number
  cost_usd: number | null
  latency_ms: number | null
  status: string
  rated: number | null
  rating_comment: string | null
  ts: number
}

export function insertQueryLog(db: DbInstance, row: Omit<QueryLogRow, 'id' | 'rated' | 'rating_comment'>): number {
  const r = db
    .prepare(
      `INSERT INTO ask_query_log (query, scope, intent, model, provider, sources_count, cost_usd, latency_ms, status, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.query,
      row.scope,
      row.intent,
      row.model,
      row.provider,
      row.sources_count,
      row.cost_usd,
      row.latency_ms,
      row.status,
      row.ts,
    )
  return Number(r.lastInsertRowid)
}

export function listRecentQueries(db: DbInstance, limit = 20): QueryLogRow[] {
  return db
    .prepare(`SELECT * FROM ask_query_log ORDER BY ts DESC LIMIT ?`)
    .all(limit) as QueryLogRow[]
}

export function clearQueryLog(db: DbInstance): void {
  db.prepare('DELETE FROM ask_query_log').run()
}

export function rateQuery(db: DbInstance, id: number, rated: 1 | -1, comment?: string): void {
  db.prepare('UPDATE ask_query_log SET rated = ?, rating_comment = ? WHERE id = ?').run(rated, comment ?? null, id)
}
