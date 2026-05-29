import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, type DbInstance } from './db'
import { initHubDb } from './hub-db'
import { createAskRouter } from './ask-router'

vi.mock('./ask/embedder', () => ({
  embed: async () => new Float32Array(384),
  embedBatch: async (t: string[]) => t.map(() => new Float32Array(384)),
  bufferFromVector: (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
  vectorFromBuffer: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
  isEmbedderDegraded: () => ({ degraded: false, reason: null }),
  warmup: async () => {},
  EMBEDDING_DIM: 384,
}))

vi.mock('./ask/provider-detect', () => ({
  detectAvailableProviders: async () => ({ providers: [], usable: [] }),
  resolveAskProvider: () => ({ mode: 'none' }),
}))

function buildApp(db: DbInstance, hubDb: DbInstance) {
  const app = express()
  app.use(express.json())
  const router = createAskRouter({
    db,
    hubDb,
    projectId: 'proj-1',
    projectPath: '/tmp/proj',
    projectStateDir: '/tmp/state',
    projectProvider: 'claude',
    broadcast: () => {},
  })
  app.use('/ask', router)
  return app
}

describe('ask-router', () => {
  let db: DbInstance
  let hubDb: DbInstance

  beforeEach(() => {
    db = initDb(':memory:')
    hubDb = initHubDb(':memory:')
    delete process.env.SPECRAILS_ASK_HUB
  })

  it('GET /search returns empty for empty q', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).get('/ask/search?q=')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: [] })
  })

  it('GET /index/status returns zeros on fresh db', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).get('/ask/index/status')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
  })

  it('GET /providers reports no usable providers when mocked', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).get('/ask/providers')
    expect(res.status).toBe(200)
    expect(res.body.resolution.mode).toBe('none')
  })

  it('GET /history returns empty array initially', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).get('/ask/history')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })

  it('returns 404 when kill switch is engaged', async () => {
    process.env.SPECRAILS_ASK_HUB = '0'
    const app = buildApp(db, hubDb)
    const res = await request(app).get('/ask/search?q=hi')
    expect(res.status).toBe(404)
  })

  it('POST /index/rebuild starts a backfill and clears existing docs', async () => {
    db.exec(`INSERT INTO ask_docs (kind, source_id, title, body, body_hash, ts, model) VALUES ('ticket','ticket:999','t','b','h',0,'m')`)
    const app = buildApp(db, hubDb)
    const res = await request(app).post('/ask/index/rebuild')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('started')
    // Wipe is synchronous before the async backfill — count is 0 right away.
    const count = (db.prepare('SELECT COUNT(*) AS n FROM ask_docs').get() as { n: number }).n
    expect(count).toBe(0)
  })

  it('POST /history/:id/rating updates the row', async () => {
    db.exec(`INSERT INTO ask_query_log (query, sources_count, status, ts) VALUES ('q', 0, 'success', 1)`)
    const app = buildApp(db, hubDb)
    const id = (db.prepare('SELECT id FROM ask_query_log LIMIT 1').get() as { id: number }).id
    const res = await request(app).post(`/ask/history/${id}/rating`).send({ rated: 1, comment: 'good' })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT rated, rating_comment FROM ask_query_log WHERE id = ?').get(id) as { rated: number; rating_comment: string }
    expect(row.rated).toBe(1)
    expect(row.rating_comment).toBe('good')
  })

  it('POST /history/:id/rating rejects invalid rated value', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).post('/ask/history/1/rating').send({ rated: 99 })
    expect(res.status).toBe(400)
  })

  it('DELETE /history clears the log', async () => {
    db.exec(`INSERT INTO ask_query_log (query, sources_count, status, ts) VALUES ('q', 0, 'success', 1)`)
    const app = buildApp(db, hubDb)
    const res = await request(app).delete('/ask/history')
    expect(res.status).toBe(200)
    const count = (db.prepare('SELECT COUNT(*) AS n FROM ask_query_log').get() as { n: number }).n
    expect(count).toBe(0)
  })

  it('POST /query short-circuits to no_provider when none configured', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).post('/ask/query').send({ question: 'cómo va' })
    expect(res.status).toBe(200)
    expect(res.text).toContain('event: sources')
    expect(res.text).toContain('event: done')
    // query is logged with status='search-only'
    const row = db.prepare(`SELECT status FROM ask_query_log ORDER BY id DESC LIMIT 1`).get() as { status: string } | undefined
    expect(row?.status).toBe('search-only')
  })

  it('POST /query rejects empty question', async () => {
    const app = buildApp(db, hubDb)
    const res = await request(app).post('/ask/query').send({ question: '' })
    expect(res.status).toBe(400)
  })

  afterEach(() => {
    delete process.env.SPECRAILS_ASK_HUB
  })
})
