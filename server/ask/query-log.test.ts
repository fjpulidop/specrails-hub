import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { insertQueryLog, listRecentQueries, clearQueryLog, rateQuery } from './query-log'

describe('ask query log', () => {
  let db: DbInstance
  beforeEach(() => {
    db = initDb(':memory:')
  })

  it('inserts and lists queries DESC by ts', () => {
    insertQueryLog(db, { query: 'a', scope: null, intent: 'factual', model: 'h', provider: 'claude', sources_count: 2, cost_usd: 0.01, latency_ms: 100, status: 'success', ts: 1 })
    insertQueryLog(db, { query: 'b', scope: null, intent: 'status', model: 'h', provider: 'claude', sources_count: 0, cost_usd: 0, latency_ms: 50, status: 'success', ts: 2 })
    const items = listRecentQueries(db)
    expect(items[0]!.query).toBe('b')
    expect(items[1]!.query).toBe('a')
  })

  it('clears all queries', () => {
    insertQueryLog(db, { query: 'a', scope: null, intent: null, model: null, provider: null, sources_count: 0, cost_usd: null, latency_ms: null, status: 'success', ts: 1 })
    clearQueryLog(db)
    expect(listRecentQueries(db)).toHaveLength(0)
  })

  it('rates a query', () => {
    const id = insertQueryLog(db, { query: 'a', scope: null, intent: null, model: null, provider: null, sources_count: 0, cost_usd: null, latency_ms: null, status: 'success', ts: 1 })
    rateQuery(db, id, 1, 'great')
    const rows = listRecentQueries(db)
    expect(rows[0]!.rated).toBe(1)
    expect(rows[0]!.rating_comment).toBe('great')
  })
})
