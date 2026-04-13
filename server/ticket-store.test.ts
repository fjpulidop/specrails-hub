import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import { vi } from 'vitest'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueueManager() {
  return {
    enqueue: vi.fn(() => ({ id: 'job-1', queuePosition: 0 })),
    cancel: vi.fn(() => 'canceled'),
    pause: vi.fn(),
    resume: vi.fn(),
    reorder: vi.fn(),
    getJobs: vi.fn(() => []),
    isPaused: vi.fn(() => false),
    getActiveJobId: vi.fn(() => null),
    phasesForCommand: vi.fn(() => []),
  }
}

function makeSetupManager() {
  return {
    isInstalling: vi.fn(() => false),
    isSettingUp: vi.fn(() => false),
    startInstall: vi.fn(),
    startSetup: vi.fn(),
    resumeSetup: vi.fn(),
    abort: vi.fn(),
    getCheckpointStatus: vi.fn(() => []),
    getInstallLog: vi.fn(() => []),
  }
}

function makeChatManager() {
  return {
    isActive: vi.fn(() => false),
    sendMessage: vi.fn(async () => {}),
    abort: vi.fn(),
  }
}

function makeProposalManager() {
  return {
    isActive: vi.fn(() => false),
    startExploration: vi.fn(async () => {}),
    sendRefinement: vi.fn(async () => {}),
    createIssue: vi.fn(async () => {}),
    cancel: vi.fn(),
  }
}

function makeSpecLauncherManager() {
  return {
    isActive: vi.fn(() => false),
    launch: vi.fn(async () => {}),
    cancel: vi.fn(),
  }
}

function makeContext(db: DbInstance, projectPath: string): ProjectContext {
  return {
    project: { id: 'proj-1', slug: 'proj', name: 'Test Project', path: projectPath, db_path: ':memory:', added_at: '', last_seen_at: '' },
    db,
    queueManager: makeQueueManager() as any,
    chatManager: makeChatManager() as any,
    setupManager: makeSetupManager() as any,
    proposalManager: makeProposalManager() as any,
    specLauncherManager: makeSpecLauncherManager() as any,
    ticketWatcher: { notifyHubWrite: vi.fn(), start: vi.fn(), close: vi.fn() } as any,
    broadcast: vi.fn(),
  } as any
}

function makeRegistry(contexts: Map<string, ProjectContext>): ProjectRegistry {
  const hubDb = initHubDb(':memory:')
  return {
    hubDb,
    getContext: vi.fn((id: string) => contexts.get(id)),
    getContextByPath: vi.fn(() => undefined),
    addProject: vi.fn() as any,
    removeProject: vi.fn(),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => Array.from(contexts.values())),
  } as unknown as ProjectRegistry
}

function createApp(contexts: Map<string, ProjectContext> = new Map()) {
  const registry = makeRegistry(contexts)
  const router = createProjectRouter(registry)
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return { app, registry }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ticket endpoints', () => {
  let db: DbInstance
  let tmpDir: string

  beforeEach(() => {
    db = initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-hub-ticket-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── GET /tickets ──────────────────────────────────────────────────────────

  describe('GET /:projectId/tickets', () => {
    it('returns empty list when no tickets file exists', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toEqual([])
      expect(res.body.total).toBe(0)
      expect(res.body.revision).toBe(0)
    })

    it('returns tickets from existing file', async () => {
      const storeDir = path.join(tmpDir, '.specrails')
      fs.mkdirSync(storeDir, { recursive: true })
      fs.writeFileSync(path.join(storeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0',
        revision: 3,
        last_updated: '2026-01-01T00:00:00Z',
        next_id: 3,
        tickets: {
          '1': { id: 1, title: 'First', description: '', status: 'todo', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: 'user', source: 'manual' },
          '2': { id: 2, title: 'Second', description: 'desc', status: 'in_progress', priority: 'high', labels: ['area:backend'], assignee: null, prerequisites: [], metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(2)
      expect(res.body.total).toBe(2)
      expect(res.body.revision).toBe(3)
    })

    it('filters by status', async () => {
      const storeDir = path.join(tmpDir, '.specrails')
      fs.mkdirSync(storeDir, { recursive: true })
      fs.writeFileSync(path.join(storeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0', revision: 1, last_updated: '', next_id: 3,
        tickets: {
          '1': { id: 1, title: 'Todo', description: '', status: 'todo', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
          '2': { id: 2, title: 'Done', description: '', status: 'done', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets?status=todo')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(1)
      expect(res.body.tickets[0].title).toBe('Todo')
    })

    it('filters by label', async () => {
      const storeDir = path.join(tmpDir, '.specrails')
      fs.mkdirSync(storeDir, { recursive: true })
      fs.writeFileSync(path.join(storeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0', revision: 1, last_updated: '', next_id: 3,
        tickets: {
          '1': { id: 1, title: 'Frontend', description: '', status: 'todo', priority: 'medium', labels: ['area:frontend'], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
          '2': { id: 2, title: 'Backend', description: '', status: 'todo', priority: 'medium', labels: ['area:backend'], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets?label=area:frontend')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(1)
      expect(res.body.tickets[0].title).toBe('Frontend')
    })

    it('filters by search query', async () => {
      const storeDir = path.join(tmpDir, '.specrails')
      fs.mkdirSync(storeDir, { recursive: true })
      fs.writeFileSync(path.join(storeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0', revision: 1, last_updated: '', next_id: 3,
        tickets: {
          '1': { id: 1, title: 'Fix login bug', description: '', status: 'todo', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
          '2': { id: 2, title: 'Add feature', description: 'login related', status: 'todo', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets?q=login')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(2)
    })
  })

  // ─── GET /tickets/:id ──────────────────────────────────────────────────────

  describe('GET /:projectId/tickets/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets/abc')
      expect(res.status).toBe(400)
    })

    it('returns 404 for missing ticket', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets/999')
      expect(res.status).toBe(404)
    })

    it('returns ticket by id', async () => {
      const storeDir = path.join(tmpDir, '.specrails')
      fs.mkdirSync(storeDir, { recursive: true })
      fs.writeFileSync(path.join(storeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0', revision: 1, last_updated: '', next_id: 2,
        tickets: {
          '1': { id: 1, title: 'Test', description: 'desc', status: 'todo', priority: 'high', labels: ['bug'], assignee: null, prerequisites: [], metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets/1')
      expect(res.status).toBe(200)
      expect(res.body.ticket.id).toBe(1)
      expect(res.body.ticket.title).toBe('Test')
      expect(res.body.ticket.priority).toBe('high')
    })
  })

  // ─── POST /tickets ─────────────────────────────────────────────────────────

  describe('POST /:projectId/tickets', () => {
    it('returns 400 when title is missing', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).post('/api/projects/proj-1/tickets').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('title')
    })

    it('returns 400 for invalid status', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Test', status: 'invalid' })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid priority', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Test', priority: 'extreme' })
      expect(res.status).toBe(400)
    })

    it('creates ticket with defaults', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).post('/api/projects/proj-1/tickets').send({ title: 'New ticket' })
      expect(res.status).toBe(201)
      expect(res.body.ticket.id).toBe(1)
      expect(res.body.ticket.title).toBe('New ticket')
      expect(res.body.ticket.status).toBe('todo')
      expect(res.body.ticket.priority).toBe('medium')
      expect(res.body.ticket.source).toBe('hub')
      expect(res.body.revision).toBe(1)
    })

    it('creates ticket with all fields', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).post('/api/projects/proj-1/tickets').send({
        title: 'Full ticket',
        description: 'A detailed description',
        status: 'in_progress',
        priority: 'critical',
        labels: ['bug', 'area:frontend'],
        assignee: 'alice',
        prerequisites: [1, 2],
        metadata: { effort_level: 'Large' },
        source: 'product-backlog',
      })
      expect(res.status).toBe(201)
      expect(res.body.ticket.description).toBe('A detailed description')
      expect(res.body.ticket.status).toBe('in_progress')
      expect(res.body.ticket.priority).toBe('critical')
      expect(res.body.ticket.labels).toEqual(['bug', 'area:frontend'])
      expect(res.body.ticket.assignee).toBe('alice')
      expect(res.body.ticket.source).toBe('product-backlog')
    })

    it('increments next_id across creates', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'First' })
      const res = await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Second' })
      expect(res.body.ticket.id).toBe(2)
      expect(res.body.revision).toBe(2)
    })

    it('broadcasts ticket_created', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Broadcasted' })
      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ticket_created', ticket: expect.objectContaining({ title: 'Broadcasted' }), timestamp: expect.any(String) })
      )
    })
  })

  // ─── PATCH /tickets/:id ────────────────────────────────────────────────────

  describe('PATCH /:projectId/tickets/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).patch('/api/projects/proj-1/tickets/abc').send({ title: 'x' })
      expect(res.status).toBe(400)
    })

    it('returns 404 for missing ticket', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).patch('/api/projects/proj-1/tickets/999').send({ title: 'x' })
      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid status', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).patch('/api/projects/proj-1/tickets/1').send({ status: 'bad' })
      expect(res.status).toBe(400)
    })

    it('returns 400 for empty title', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).patch('/api/projects/proj-1/tickets/1').send({ title: '' })
      expect(res.status).toBe(400)
    })

    it('updates ticket fields', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      // Create first
      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Original' })

      // Update
      const res = await request(app).patch('/api/projects/proj-1/tickets/1').send({
        title: 'Updated',
        status: 'in_progress',
        priority: 'high',
        labels: ['area:backend'],
      })
      expect(res.status).toBe(200)
      expect(res.body.ticket.title).toBe('Updated')
      expect(res.body.ticket.status).toBe('in_progress')
      expect(res.body.ticket.priority).toBe('high')
      expect(res.body.ticket.labels).toEqual(['area:backend'])
    })

    it('merges metadata instead of replacing', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      await request(app).post('/api/projects/proj-1/tickets').send({
        title: 'Meta test',
        metadata: { effort_level: 'Small', area: 'backend' },
      })

      const res = await request(app).patch('/api/projects/proj-1/tickets/1').send({
        metadata: { effort_level: 'Large' },
      })
      expect(res.body.ticket.metadata.effort_level).toBe('Large')
      expect(res.body.ticket.metadata.area).toBe('backend')
    })

    it('broadcasts ticket_updated', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'Track' })
      await request(app).patch('/api/projects/proj-1/tickets/1').send({ status: 'done' })

      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ticket_updated', ticket: expect.objectContaining({ status: 'done' }), timestamp: expect.any(String) })
      )
    })
  })

  // ─── DELETE /tickets/:id ───────────────────────────────────────────────────

  describe('DELETE /:projectId/tickets/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).delete('/api/projects/proj-1/tickets/abc')
      expect(res.status).toBe(400)
    })

    it('returns 404 for missing ticket', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).delete('/api/projects/proj-1/tickets/999')
      expect(res.status).toBe(404)
    })

    it('deletes existing ticket', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      // Create then delete
      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'To delete' })
      const res = await request(app).delete('/api/projects/proj-1/tickets/1')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      // Verify it's gone
      const getRes = await request(app).get('/api/projects/proj-1/tickets/1')
      expect(getRes.status).toBe(404)
    })

    it('broadcasts ticket_deleted', async () => {
      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      await request(app).post('/api/projects/proj-1/tickets').send({ title: 'To delete' })
      await request(app).delete('/api/projects/proj-1/tickets/1')

      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ticket_deleted', ticketId: 1, timestamp: expect.any(String) })
      )
    })
  })

  // ─── Integration contract path resolution ─────────────────────────────────

  describe('integration contract path resolution', () => {
    it('uses storagePath from integration-contract.json when available', async () => {
      const claudeDir = path.join(tmpDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })

      // Write contract with custom storage path
      fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), JSON.stringify({
        schemaVersion: '1.0',
        ticketProvider: {
          type: 'local',
          storagePath: '.claude/local-tickets.json',
          capabilities: ['crud'],
        },
      }))

      // Pre-populate tickets at the custom path
      fs.writeFileSync(path.join(claudeDir, 'local-tickets.json'), JSON.stringify({
        schema_version: '1.0', revision: 5, last_updated: '', next_id: 2,
        tickets: {
          '1': { id: 1, title: 'From contract path', description: '', status: 'todo', priority: 'medium', labels: [], assignee: null, prerequisites: [], metadata: {}, created_at: '', updated_at: '', created_by: 'user', source: 'manual' },
        },
      }))

      const ctx = makeContext(db, tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      const res = await request(app).get('/api/projects/proj-1/tickets')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(1)
      expect(res.body.tickets[0].title).toBe('From contract path')
    })
  })
})
