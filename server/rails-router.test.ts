import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, type DbInstance } from './db'
import { createRailsRouter } from './rails-router'
import { getRail, setRailTickets } from './rails-store'

function appWith(db: DbInstance) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    // Minimal ProjectContext stand-in; the routes under test only touch db.
    ;(req as unknown as { projectCtx: unknown }).projectCtx = {
      db,
      railJobs: new Map(),
      project: { id: 'p1', slug: 's1' },
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
})
