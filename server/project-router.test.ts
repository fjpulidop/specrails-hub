import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

import { createProjectRouter } from './project-router'
import { initDb } from './db'
import { initHubDb } from './hub-db'
import { ClaudeNotFoundError, JobNotFoundError, JobAlreadyTerminalError } from './queue-manager'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import type { DbInstance } from './db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueueManager(overrides: Partial<{
  enqueue: () => any
  cancel: () => any
  pause: () => void
  resume: () => void
  reorder: () => void
  getJobs: () => any[]
  isPaused: () => boolean
  getActiveJobId: () => string | null
  phasesForCommand: () => any[]
}> = {}) {
  return {
    enqueue: overrides.enqueue ?? vi.fn(() => ({ id: 'job-1', queuePosition: 0 })),
    cancel: overrides.cancel ?? vi.fn(() => 'canceled'),
    pause: overrides.pause ?? vi.fn(),
    resume: overrides.resume ?? vi.fn(),
    reorder: overrides.reorder ?? vi.fn(),
    getJobs: overrides.getJobs ?? vi.fn(() => []),
    isPaused: overrides.isPaused ?? vi.fn(() => false),
    getActiveJobId: overrides.getActiveJobId ?? vi.fn(() => null),
    phasesForCommand: overrides.phasesForCommand ?? vi.fn(() => []),
  }
}

function makeSetupManager(overrides: Partial<{
  isInstalling: (id: string) => boolean
  isSettingUp: (id: string) => boolean
  startInstall: () => void
  startSetup: () => void
  resumeSetup: () => void
  abort: () => void
  getCheckpointStatus: () => any[]
}> = {}) {
  return {
    isInstalling: overrides.isInstalling ?? vi.fn(() => false),
    isSettingUp: overrides.isSettingUp ?? vi.fn(() => false),
    startInstall: overrides.startInstall ?? vi.fn(),
    startSetup: overrides.startSetup ?? vi.fn(),
    resumeSetup: overrides.resumeSetup ?? vi.fn(),
    abort: overrides.abort ?? vi.fn(),
    getCheckpointStatus: overrides.getCheckpointStatus ?? vi.fn(() => []),
  }
}

function makeChatManager(overrides: Partial<{
  isActive: (id: string) => boolean
  sendMessage: () => Promise<void>
  abort: () => void
}> = {}) {
  return {
    isActive: overrides.isActive ?? vi.fn(() => false),
    sendMessage: overrides.sendMessage ?? vi.fn(async () => {}),
    abort: overrides.abort ?? vi.fn(),
  }
}

function makeProposalManager(overrides: Partial<{
  isActive: (id: string) => boolean
  startExploration: () => Promise<void>
  sendRefinement: () => Promise<void>
  createIssue: () => Promise<void>
  cancel: () => void
}> = {}) {
  return {
    isActive: overrides.isActive ?? vi.fn(() => false),
    startExploration: overrides.startExploration ?? vi.fn(async () => {}),
    sendRefinement: overrides.sendRefinement ?? vi.fn(async () => {}),
    createIssue: overrides.createIssue ?? vi.fn(async () => {}),
    cancel: overrides.cancel ?? vi.fn(),
  }
}

function makeContext(db: DbInstance, overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    project: { id: 'proj-1', slug: 'proj', name: 'Test Project', path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
    db,
    queueManager: makeQueueManager() as any,
    chatManager: makeChatManager() as any,
    setupManager: makeSetupManager() as any,
    proposalManager: makeProposalManager() as any,
    broadcast: vi.fn(),
    ...overrides,
  }
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

// ─── App factory ──────────────────────────────────────────────────────────────

function createApp(contexts: Map<string, ProjectContext> = new Map()) {
  const registry = makeRegistry(contexts)
  const router = createProjectRouter(registry)
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return { app, registry }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('project-router', () => {
  let db: DbInstance

  beforeEach(() => {
    db = initDb(':memory:')
  })

  // ─── Middleware: unknown projectId ──────────────────────────────────────────

  describe('unknown projectId middleware', () => {
    it('returns 404 for an unregistered project', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/projects/nonexistent/state')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Project not found')
    })

    it('returns 404 for jobs endpoint with unknown project', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/projects/bad-id/jobs')
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /spawn ────────────────────────────────────────────────────────────

  describe('POST /spawn', () => {
    it('returns 400 when command is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('command is required')
    })

    it('returns 400 when command is empty string', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({ command: '  ' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when claude is not found', async () => {
      const qm = makeQueueManager({ enqueue: vi.fn(() => { throw new ClaudeNotFoundError() }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({ command: 'test' })
      expect(res.status).toBe(400)
    })

    it('returns 202 with jobId on success', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({ command: 'sr:implement' })
      expect(res.status).toBe(202)
      expect(res.body.jobId).toBeDefined()
    })
  })

  // ─── DELETE /jobs/:id ──────────────────────────────────────────────────────

  describe('DELETE /jobs/:id', () => {
    it('returns 404 when job does not exist', async () => {
      const qm = makeQueueManager({ cancel: vi.fn(() => { throw new JobNotFoundError() }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs/no-such-job')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Job not found')
    })

    it('returns 409 when job is already terminal', async () => {
      const qm = makeQueueManager({ cancel: vi.fn(() => { throw new JobAlreadyTerminalError() }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs/some-job')
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('terminal')
    })
  })

  // ─── PUT /queue/reorder ────────────────────────────────────────────────────

  describe('PUT /queue/reorder', () => {
    it('returns 400 when jobIds is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).put('/api/projects/proj-1/queue/reorder').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('jobIds must be an array')
    })

    it('returns 200 on valid reorder', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).put('/api/projects/proj-1/queue/reorder').send({ jobIds: ['a', 'b'] })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  // ─── GET /jobs/:id ─────────────────────────────────────────────────────────

  describe('GET /jobs/:id', () => {
    it('returns 404 when job does not exist', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/jobs/no-such-job')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Job not found')
    })

    it('returns job data when job exists', async () => {
      const today = new Date().toISOString().slice(0, 10)
      db.prepare(`
        INSERT INTO jobs (id, command, started_at, status)
        VALUES ('j1', 'sr:implement', ?, 'running')
      `).run(`${today}T10:00:00.000Z`)
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/jobs/j1')
      expect(res.status).toBe(200)
      expect(res.body.job.id).toBe('j1')
      expect(res.body.events).toBeDefined()
    })
  })

  // ─── GET /analytics ────────────────────────────────────────────────────────

  describe('GET /analytics', () => {
    it('returns 400 for invalid period', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics?period=bad')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid period')
    })

    it('returns 400 for custom period without from/to', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics?period=custom')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('from and to are required')
    })

    it('returns analytics for valid period', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics?period=7d')
      expect(res.status).toBe(200)
      expect(res.body.kpi).toBeDefined()
    })
  })

  // ─── GET /state ────────────────────────────────────────────────────────────

  describe('GET /state', () => {
    it('returns project name and busy status', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/state')
      expect(res.status).toBe(200)
      expect(res.body.projectName).toBe('Test Project')
      expect(res.body.busy).toBe(false)
    })
  })

  // ─── Chat conversation routes ───────────────────────────────────────────────

  describe('chat conversations', () => {
    it('GET /conversations returns empty list', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/chat/conversations')
      expect(res.status).toBe(200)
      expect(res.body.conversations).toEqual([])
    })

    it('GET /conversations/:id returns 404 for unknown conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/chat/conversations/no-id')
      expect(res.status).toBe(404)
    })

    it('DELETE /conversations/:id returns 404 for unknown conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/chat/conversations/no-id')
      expect(res.status).toBe(404)
    })

    it('PATCH /conversations/:id returns 404 for unknown conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/chat/conversations/no-id').send({ title: 'x' })
      expect(res.status).toBe(404)
    })

    it('POST /conversations/:id/messages returns 400 when text is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      // Create a conversation first
      const createRes = await request(app).post('/api/projects/proj-1/chat/conversations').send({ model: 'claude-sonnet-4-5' })
      expect(createRes.status).toBe(201)
      const convId = createRes.body.conversation.id
      const res = await request(app).post(`/api/projects/proj-1/chat/conversations/${convId}/messages`).send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('text is required')
    })

    it('POST /conversations/:id/messages returns 409 when conversation is busy', async () => {
      const chatManager = makeChatManager({ isActive: vi.fn(() => true) })
      const ctx = makeContext(db, { chatManager: chatManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/chat/conversations').send({})
      const convId = createRes.body.conversation.id
      const res = await request(app).post(`/api/projects/proj-1/chat/conversations/${convId}/messages`).send({ text: 'hello' })
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('CONVERSATION_BUSY')
    })
  })

  // ─── Setup routes ──────────────────────────────────────────────────────────

  describe('setup routes', () => {
    it('POST /setup/install returns 409 when install already in progress', async () => {
      const sm = makeSetupManager({ isInstalling: vi.fn(() => true) })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/install')
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('Install already in progress')
    })

    it('POST /setup/start returns 409 when setup already in progress', async () => {
      const sm = makeSetupManager({ isSettingUp: vi.fn(() => true) })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/start')
      expect(res.status).toBe(409)
    })

    it('POST /setup/message returns 400 when sessionId is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/message').send({ message: 'hello' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('sessionId is required')
    })

    it('POST /setup/message returns 400 when message is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/message').send({ sessionId: 'sess-1' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('message is required')
    })

    it('GET /setup/checkpoints returns checkpoint status', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/setup/checkpoints')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.checkpoints)).toBe(true)
    })
  })

  // ─── Proposal routes ────────────────────────────────────────────────────────

  describe('proposal routes', () => {
    it('GET /propose returns empty list', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/propose')
      expect(res.status).toBe(200)
    })

    it('GET /propose/:id returns 404 for unknown proposal', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/propose/no-such-id')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Proposal not found')
    })

    it('DELETE /propose/:id returns 404 for unknown proposal', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/propose/no-such-id')
      expect(res.status).toBe(404)
    })

    it('POST /propose returns 400 when idea is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/propose').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('idea is required')
    })
  })

  // ─── Queue routes ───────────────────────────────────────────────────────────

  describe('queue routes', () => {
    it('GET /queue returns queue state', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/queue')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.jobs)).toBe(true)
      expect(typeof res.body.paused).toBe('boolean')
    })

    it('POST /queue/pause returns ok', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/queue/pause')
      expect(res.status).toBe(200)
      expect(res.body.paused).toBe(true)
    })

    it('POST /queue/resume returns ok', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/queue/resume')
      expect(res.status).toBe(200)
      expect(res.body.paused).toBe(false)
    })
  })
})
