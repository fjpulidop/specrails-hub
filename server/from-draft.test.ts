import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import request from 'supertest'

import { createProjectRouter } from './project-router'
import { initDb } from './db'
import { initHubDb } from './hub-db'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import type { DbInstance } from './db'

function makeContext(db: DbInstance, projectPath: string): ProjectContext {
  return {
    project: { id: 'proj-1', slug: 'proj', name: 'Test', path: projectPath, db_path: ':memory:', added_at: '', last_seen_at: '' },
    db,
    queueManager: { enqueue: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), reorder: vi.fn(), getJobs: vi.fn(() => []), isPaused: vi.fn(() => false), getActiveJobId: vi.fn(() => null), phasesForCommand: vi.fn(() => []) } as any,
    chatManager: { isActive: vi.fn(() => false), sendMessage: vi.fn(), abort: vi.fn(), forgetSpecDraft: vi.fn() } as any,
    setupManager: {} as any,
    proposalManager: {} as any,
    specLauncherManager: {} as any,
    ticketWatcher: { notifyHubWrite: vi.fn(), start: vi.fn(), close: vi.fn() } as any,
    broadcast: vi.fn(),
  }
}

function makeRegistry(ctx: ProjectContext): ProjectRegistry {
  const hubDb = initHubDb(':memory:')
  const map = new Map([[ctx.project.id, ctx]])
  return {
    hubDb,
    getContext: vi.fn((id: string) => map.get(id)),
    getContextByPath: vi.fn(() => undefined),
    addProject: vi.fn() as any,
    removeProject: vi.fn(),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => Array.from(map.values())),
  } as unknown as ProjectRegistry
}

function createApp(ctx: ProjectContext) {
  const registry = makeRegistry(ctx)
  const router = createProjectRouter(registry)
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return app
}

describe('POST /tickets/from-draft', () => {
  let tmpDir: string
  let db: DbInstance
  let ctx: ProjectContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fromdraft-'))
    db = initDb(':memory:')
    ctx = makeContext(db, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a ticket with the supplied fields and returns 201', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({
        title: 'Add dark mode',
        description: '## Problem Statement\nUsers cannot override OS theme.\n\n## Proposed Solution\nA toggle in settings.',
        labels: ['ui', 'theme'],
        priority: 'high',
        acceptanceCriteria: ['Toggle visible', 'Persists across reload'],
      })
    expect(res.status).toBe(201)
    expect(res.body.ticket.title).toBe('Add dark mode')
    expect(res.body.ticket.priority).toBe('high')
    expect(res.body.ticket.labels).toEqual(['ui', 'theme'])
    expect(res.body.ticket.source).toBe('propose-spec')
    expect(res.body.ticket.created_by).toBe('sr-explore-spec')
    // Title is its own field — must NOT be echoed as `## Spec Title` heading.
    expect(res.body.ticket.description).not.toContain('## Spec Title')
    expect(res.body.ticket.description).toContain('## Problem Statement')
    expect(res.body.ticket.description).toContain('## Proposed Solution')
    expect(res.body.ticket.description).toContain('## Acceptance Criteria')
    expect(res.body.ticket.description).toContain('- Toggle visible')
  })

  it('rejects empty title with 400', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('title')
  })

  it('rejects whitespace-only title with 400', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('normalises invalid priority to medium', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'X', priority: 'urgent' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.priority).toBe('medium')
  })

  it('defaults missing labels and acceptanceCriteria', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Y' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.labels).toEqual([])
    // No body / AC supplied → description is empty (title lives in its own field).
    expect(res.body.ticket.description).toBe('')
  })

  it('assigns monotonic ids when called twice', async () => {
    const app = createApp(ctx)
    const r1 = await request(app).post('/api/projects/proj-1/tickets/from-draft').send({ title: 'A' })
    const r2 = await request(app).post('/api/projects/proj-1/tickets/from-draft').send({ title: 'B' })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.ticket.id).toBe(r1.body.ticket.id + 1)
  })

  it('broadcasts a ticket_created WS message', async () => {
    const app = createApp(ctx)
    await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Z' })
    expect(ctx.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket_created', projectId: 'proj-1' }),
    )
  })

  it('drops non-string labels', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'X', labels: ['ui', 42, null, 'theme'] })
    expect(res.status).toBe(201)
    expect(res.body.ticket.labels).toEqual(['ui', 'theme'])
  })

  it('accepts pendingSpecId without crashing when no attachments exist', async () => {
    // Migration is a no-op when the pending dir is empty (renameTicketDir
    // returns []). The endpoint must still succeed and produce a ticket.
    // Full attachment-migration coverage lives in attachment-manager tests
    // because the path resolves under the user's home dir, which we don't
    // override here.
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Pending OK', pendingSpecId: 'pending-zzz' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.title).toBe('Pending OK')
  })
})
