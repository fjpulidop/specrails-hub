import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, type DbInstance } from './db'
import { createRailsRouter } from './rails-router'
import { getRail, setRailTickets } from './rails-store'

function appWith(
  db: DbInstance,
  opts?: {
    providers?: ('claude' | 'codex')[]
    queueManager?: { enqueue: (...args: unknown[]) => unknown }
  },
) {
  const providers = opts?.providers ?? ['claude']
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    // Minimal ProjectContext stand-in; the routes under test only touch db
    // (+ queueManager/broadcast for launch).
    ;(req as unknown as { projectCtx: unknown }).projectCtx = {
      db,
      railJobs: new Map(),
      project: { id: 'p1', slug: 's1', provider: providers[0], providers },
      queueManager: opts?.queueManager,
      broadcast: () => { /* noop */ },
    }
    next()
  })
  app.use('/rails', createRailsRouter())
  return app
}

describe('rails-router PUT /:railIndex/tickets', () => {
  let db: DbInstance

  beforeEach(() => { db = initDb(':memory:') })
  afterEach(() => { db.close() })

  it('preserves a previously-set profile and mode when reassigning tickets', async () => {
    setRailTickets(db, 0, [1, 2], 'batch-implement', 'prof-a')
    expect(getRail(db, 0).profileName).toBe('prof-a')

    const res = await request(appWith(db)).put('/rails/0/tickets').send({ ticketIds: [3, 4] })

    expect(res.status).toBe(200)
    const rail = getRail(db, 0)
    expect(rail.ticketIds).toEqual([3, 4])
    expect(rail.mode).toBe('batch-implement') // preserved (pre-fix reset to 'implement')
    expect(rail.profileName).toBe('prof-a')    // preserved (pre-fix wiped to null)
  })

  it('honors explicit mode/profileName overrides in the body', async () => {
    setRailTickets(db, 1, [1], 'implement', 'old')
    const res = await request(appWith(db))
      .put('/rails/1/tickets')
      .send({ ticketIds: [9], mode: 'batch-implement', profileName: 'new' })
    expect(res.status).toBe(200)
    const rail = getRail(db, 1)
    expect(rail.mode).toBe('batch-implement')
    expect(rail.profileName).toBe('new')
  })

  it('lets an explicit null profileName clear the stored profile', async () => {
    setRailTickets(db, 0, [1], 'implement', 'prof-a')
    const res = await request(appWith(db))
      .put('/rails/0/tickets')
      .send({ ticketIds: [2], profileName: null })
    expect(res.status).toBe(200)
    expect(getRail(db, 0).profileName).toBeNull()
  })

  it('rejects an invalid rail index', async () => {
    const res = await request(appWith(db)).put('/rails/abc/tickets').send({ ticketIds: [1] })
    expect(res.status).toBe(400)
  })

  it('rejects ticketIds that are not an array of numbers', async () => {
    const res = await request(appWith(db)).put('/rails/0/tickets').send({ ticketIds: ['x'] })
    expect(res.status).toBe(400)
  })

  it('preserves a previously-set ai engine when reassigning tickets', async () => {
    setRailTickets(db, 0, [1], 'implement', null, 'codex')
    expect(getRail(db, 0).aiEngine).toBe('codex')
    const res = await request(appWith(db, { providers: ['claude', 'codex'] }))
      .put('/rails/0/tickets').send({ ticketIds: [3] })
    expect(res.status).toBe(200)
    expect(getRail(db, 0).aiEngine).toBe('codex')
  })
})

describe('rails-router PUT /:railIndex/engine', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })
  afterEach(() => { db.close() })

  it('sets the AI engine for a rail', async () => {
    setRailTickets(db, 0, [1])
    const res = await request(appWith(db, { providers: ['claude', 'codex'] }))
      .put('/rails/0/engine').send({ aiEngine: 'codex' })
    expect(res.status).toBe(200)
    expect(getRail(db, 0).aiEngine).toBe('codex')
  })

  it('clears the engine when aiEngine is null', async () => {
    setRailTickets(db, 0, [1], 'implement', null, 'codex')
    const res = await request(appWith(db, { providers: ['claude', 'codex'] }))
      .put('/rails/0/engine').send({ aiEngine: null })
    expect(res.status).toBe(200)
    expect(getRail(db, 0).aiEngine).toBeNull()
  })

  it('rejects an engine not installed for the project', async () => {
    setRailTickets(db, 0, [1])
    const res = await request(appWith(db, { providers: ['claude'] }))
      .put('/rails/0/engine').send({ aiEngine: 'codex' })
    expect(res.status).toBe(400)
  })

  it('rejects a body without aiEngine', async () => {
    const res = await request(appWith(db, { providers: ['claude', 'codex'] }))
      .put('/rails/0/engine').send({})
    expect(res.status).toBe(400)
  })

  it('rejects an invalid rail index', async () => {
    const res = await request(appWith(db)).put('/rails/-1/engine').send({ aiEngine: 'claude' })
    expect(res.status).toBe(400)
  })
})

describe('rails-router POST /:railIndex/launch with aiEngine', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })
  afterEach(() => { db.close() })

  it('passes the explicit aiEngine through to enqueue as provider', async () => {
    setRailTickets(db, 0, [1, 2])
    const enqueue = vi.fn().mockReturnValue({ id: 'job-1', queuePosition: 0 })
    const res = await request(appWith(db, { providers: ['claude', 'codex'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'implement', aiEngine: 'codex' })
    expect(res.status).toBe(202)
    expect(enqueue).toHaveBeenCalledTimes(1)
    const opts = enqueue.mock.calls[0][2] as { provider?: string; profileName?: unknown }
    expect(opts.provider).toBe('codex')
    // Codex has no profiles → forced legacy (null) profile.
    expect(opts.profileName).toBeNull()
  })

  it('falls back to the stored rail engine when the body omits aiEngine', async () => {
    setRailTickets(db, 1, [3], 'implement', null, 'codex')
    const enqueue = vi.fn().mockReturnValue({ id: 'job-2', queuePosition: 0 })
    const res = await request(appWith(db, { providers: ['claude', 'codex'], queueManager: { enqueue } }))
      .post('/rails/1/launch').send({ mode: 'implement' })
    expect(res.status).toBe(202)
    expect((enqueue.mock.calls[0][2] as { provider?: string }).provider).toBe('codex')
  })

  it('rejects an aiEngine not installed for the project', async () => {
    setRailTickets(db, 0, [1])
    const enqueue = vi.fn()
    const res = await request(appWith(db, { providers: ['claude'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'implement', aiEngine: 'codex' })
    expect(res.status).toBe(400)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('omits provider (legacy path) when no engine is requested or stored', async () => {
    setRailTickets(db, 0, [1])
    const enqueue = vi.fn().mockReturnValue({ id: 'job-3', queuePosition: 0 })
    const res = await request(appWith(db, { providers: ['claude'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'implement' })
    expect(res.status).toBe(202)
    expect((enqueue.mock.calls[0][2] as { provider?: string }).provider).toBeUndefined()
  })
})

describe('rails-router POST /:railIndex/launch ultracode mode', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })
  afterEach(() => { db.close() })

  it('enqueues one claude job per ticket with an ultracode command and no profile', async () => {
    setRailTickets(db, 0, [5, 7])
    let n = 0
    const enqueue = vi.fn().mockImplementation(() => ({ id: `job-${++n}`, queuePosition: 0 }))
    const railJobs = new Map<string, unknown>()
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as unknown as { projectCtx: unknown }).projectCtx = {
        db, railJobs,
        project: { id: 'p1', slug: 's1', provider: 'claude', providers: ['claude'] },
        queueManager: { enqueue },
        broadcast: () => {},
      }
      next()
    })
    app.use('/rails', createRailsRouter())

    const res = await request(app).post('/rails/0/launch').send({ mode: 'ultracode' })
    expect(res.status).toBe(202)
    expect(res.body.jobIds).toEqual(['job-1', 'job-2'])
    expect(res.body.jobId).toBe('job-1')
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue.mock.calls[0][0]).toBe('/specrails:ultracode #5 --yes')
    expect(enqueue.mock.calls[1][0]).toBe('/specrails:ultracode #7 --yes')
    const opts = enqueue.mock.calls[0][2] as { provider?: string; profileName?: unknown }
    expect(opts.provider).toBe('claude')
    expect(opts.profileName).toBeNull()
    // Each job registered against the rail with its single ticket.
    expect(railJobs.size).toBe(2)
  })

  it('rejects ultracode when the effective engine is not claude', async () => {
    setRailTickets(db, 0, [1], 'implement', null, 'codex')
    const enqueue = vi.fn()
    const res = await request(appWith(db, { providers: ['claude', 'codex'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'ultracode', aiEngine: 'codex' })
    expect(res.status).toBe(400)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('rejects an unknown mode', async () => {
    setRailTickets(db, 0, [1])
    const res = await request(appWith(db, { queueManager: { enqueue: vi.fn() } }))
      .post('/rails/0/launch').send({ mode: 'bogus' })
    expect(res.status).toBe(400)
  })

  it('passes a valid ultracode model through to enqueue', async () => {
    setRailTickets(db, 0, [1])
    const enqueue = vi.fn().mockReturnValue({ id: 'job-1', queuePosition: 0 })
    const res = await request(appWith(db, { providers: ['claude'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'ultracode', model: 'opus' })
    expect(res.status).toBe(202)
    expect((enqueue.mock.calls[0][2] as { model?: string }).model).toBe('opus')
  })

  it('rejects an invalid ultracode model', async () => {
    setRailTickets(db, 0, [1])
    const enqueue = vi.fn()
    const res = await request(appWith(db, { providers: ['claude'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'ultracode', model: 'gpt-5' })
    expect(res.status).toBe(400)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('omits model from enqueue when none is provided', async () => {
    setRailTickets(db, 0, [1])
    const enqueue = vi.fn().mockReturnValue({ id: 'job-1', queuePosition: 0 })
    const res = await request(appWith(db, { providers: ['claude'], queueManager: { enqueue } }))
      .post('/rails/0/launch').send({ mode: 'ultracode' })
    expect(res.status).toBe(202)
    expect((enqueue.mock.calls[0][2] as { model?: string }).model).toBeUndefined()
  })
})
