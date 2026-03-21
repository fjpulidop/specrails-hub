import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
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
  getInstallLog: () => string[]
}> = {}) {
  return {
    isInstalling: overrides.isInstalling ?? vi.fn(() => false),
    isSettingUp: overrides.isSettingUp ?? vi.fn(() => false),
    startInstall: overrides.startInstall ?? vi.fn(),
    startSetup: overrides.startSetup ?? vi.fn(),
    resumeSetup: overrides.resumeSetup ?? vi.fn(),
    abort: overrides.abort ?? vi.fn(),
    getCheckpointStatus: overrides.getCheckpointStatus ?? vi.fn(() => []),
    getInstallLog: overrides.getInstallLog ?? vi.fn(() => []),
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

function makeSpecLauncherManager(overrides: Partial<{
  isActive: (id: string) => boolean
  launch: () => Promise<void>
  cancel: () => void
}> = {}) {
  return {
    isActive: overrides.isActive ?? vi.fn(() => false),
    launch: overrides.launch ?? vi.fn(async () => {}),
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
    specLauncherManager: makeSpecLauncherManager() as any,
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

    it('accepts priority parameter', async () => {
      const enqueueMock = vi.fn(() => ({ id: 'job-1', queuePosition: 1, priority: 'high' }))
      const qm = makeQueueManager({ enqueue: enqueueMock })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({ command: 'sr:implement', priority: 'high' })
      expect(res.status).toBe(202)
      expect(enqueueMock).toHaveBeenCalledWith('sr:implement', 'high')
    })

    it('returns 400 for invalid priority', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/spawn').send({ command: 'sr:implement', priority: 'ultra' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('priority')
    })
  })

  // ─── PATCH /jobs/:id/priority ──────────────────────────────────────────────

  describe('PATCH /jobs/:id/priority', () => {
    it('returns 400 for invalid priority value', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/jobs/job-1/priority').send({ priority: 'ultra' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('priority')
    })

    it('returns 404 when job does not exist', async () => {
      const qm = makeQueueManager()
      ;(qm as any).updatePriority = vi.fn(() => { throw new JobNotFoundError() })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/jobs/no-such-job/priority').send({ priority: 'high' })
      expect(res.status).toBe(404)
    })

    it('returns 200 on successful priority update', async () => {
      const qm = makeQueueManager()
      ;(qm as any).updatePriority = vi.fn()
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/jobs/job-1/priority').send({ priority: 'critical' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
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

  // ─── GET /activity ──────────────────────────────────────────────────────────

  describe('GET /activity', () => {
    it('returns empty array when project has no jobs', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('returns 404 for unknown project', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/projects/nonexistent/activity')
      expect(res.status).toBe(404)
    })

    it('running job appears as job_started', async () => {
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, status) VALUES ('j-run', 'sr:implement', '2025-01-01T10:00:00.000Z', 'running')"
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity')
      expect(res.status).toBe(200)
      const item = res.body.find((i: any) => i.jobId === 'j-run')
      expect(item).toBeDefined()
      expect(item.type).toBe('job_started')
      expect(item.costUsd).toBeNull()
    })

    it('completed job appears as job_completed with costUsd', async () => {
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, finished_at, status, total_cost_usd) VALUES ('j-done', 'sr:implement', '2025-01-01T10:00:00.000Z', '2025-01-01T10:05:00.000Z', 'completed', 0.05)"
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity')
      const item = res.body.find((i: any) => i.jobId === 'j-done')
      expect(item.type).toBe('job_completed')
      expect(item.costUsd).toBe(0.05)
    })

    it('failed job appears as job_failed', async () => {
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, finished_at, status) VALUES ('j-fail', 'sr:implement', '2025-01-01T09:00:00.000Z', '2025-01-01T09:01:00.000Z', 'failed')"
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity')
      const item = res.body.find((i: any) => i.jobId === 'j-fail')
      expect(item.type).toBe('job_failed')
    })

    it('canceled job appears as job_canceled', async () => {
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, finished_at, status) VALUES ('j-cancel', 'sr:implement', '2025-01-01T08:00:00.000Z', '2025-01-01T08:00:30.000Z', 'canceled')"
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity')
      const item = res.body.find((i: any) => i.jobId === 'j-cancel')
      expect(item.type).toBe('job_canceled')
    })

    it('respects limit param', async () => {
      for (let i = 0; i < 5; i++) {
        db.prepare(
          `INSERT INTO jobs (id, command, started_at, status) VALUES ('lim-${i}', 'cmd', '2025-01-0${i + 1}T10:00:00.000Z', 'completed')`
        ).run()
      }
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity?limit=2')
      expect(res.status).toBe(200)
      expect(res.body.length).toBeLessThanOrEqual(2)
    })

    it('caps limit at 100', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      // Just verify the request succeeds (no 400/500) when limit > 100
      const res = await request(app).get('/api/projects/proj-1/activity?limit=500')
      expect(res.status).toBe(200)
      expect(res.body.length).toBeLessThanOrEqual(100)
    })

    it('before param filters results', async () => {
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, status) VALUES ('before-old', 'cmd', '2024-01-01T10:00:00.000Z', 'completed')"
      ).run()
      db.prepare(
        "INSERT INTO jobs (id, command, started_at, status) VALUES ('before-new', 'cmd', '2025-06-01T10:00:00.000Z', 'completed')"
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/activity?before=2025-01-01T00:00:00.000Z')
      expect(res.status).toBe(200)
      const ids = res.body.map((i: any) => i.jobId)
      expect(ids).toContain('before-old')
      expect(ids).not.toContain('before-new')
    })
  })

  // ─── Spec Launcher ───────────────────────────────────────────────────────────

  describe('POST /:projectId/spec-launcher/start', () => {
    it('returns 400 if description is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toBeTruthy()
    })

    it('returns 400 if description is empty string', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({ description: '   ' })
      expect(res.status).toBe(400)
    })

    it('returns 202 with launchId and calls launch', async () => {
      const launch = vi.fn(async () => {})
      const slm = makeSpecLauncherManager({ launch })
      const ctx = makeContext(db, { specLauncherManager: slm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({ description: 'feat: add dark mode toggle' })
      expect(res.status).toBe(202)
      expect(typeof res.body.launchId).toBe('string')
      expect(res.body.launchId).toBeTruthy()
      // launch is called asynchronously — wait a tick
      await new Promise((r) => setTimeout(r, 10))
      expect(launch).toHaveBeenCalledWith(res.body.launchId, 'feat: add dark mode toggle')
    })
  })

  describe('DELETE /:projectId/spec-launcher/:launchId', () => {
    it('returns 404 if no active launch', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/spec-launcher/nonexistent-id')
      expect(res.status).toBe(404)
    })

    it('cancels an active launch and returns ok', async () => {
      const cancel = vi.fn()
      const slm = makeSpecLauncherManager({
        isActive: vi.fn(() => true),
        cancel,
      })
      const ctx = makeContext(db, { specLauncherManager: slm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/spec-launcher/some-launch-id')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(cancel).toHaveBeenCalledWith('some-launch-id')
    })
  })

  // ─── Changes endpoint ─────────────────────────────────────────────────────

  describe('GET /:projectId/changes', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-hub-changes-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns empty changes array when no openspec/changes dir', async () => {
      const ctx = makeContext(db, {
        project: { id: 'proj-1', slug: 'proj', name: 'Test', path: tmpDir, db_path: ':memory:', added_at: '', last_seen_at: '' },
      })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes')
      expect(res.status).toBe(200)
      expect(res.body.changes).toEqual([])
    })

    it('returns active changes from openspec/changes/', async () => {
      const changesDir = path.join(tmpDir, 'openspec', 'changes')
      fs.mkdirSync(path.join(changesDir, 'my-feature'), { recursive: true })
      fs.writeFileSync(path.join(changesDir, 'my-feature', 'proposal.md'), '# Proposal')

      const ctx = makeContext(db, {
        project: { id: 'proj-1', slug: 'proj', name: 'Test', path: tmpDir, db_path: ':memory:', added_at: '', last_seen_at: '' },
      })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes')
      expect(res.status).toBe(200)
      const change = res.body.changes.find((c: { id: string }) => c.id === 'my-feature')
      expect(change).toBeDefined()
      expect(change.artifacts.proposal).toBe(true)
      expect(change.isArchived).toBe(false)
    })
  })

  // ─── Change Artifact Browser ──────────────────────────────────────────────

  describe('GET /:projectId/changes/:changeId/artifacts/:artifact', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-hub-artifacts-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function makeCtxWithPath(p: string) {
      return makeContext(db, {
        project: { id: 'proj-1', slug: 'proj', name: 'Test', path: p, db_path: ':memory:', added_at: '', last_seen_at: '' },
      })
    }

    it('returns 400 for disallowed artifact names', async () => {
      const ctx = makeCtxWithPath(tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/my-change/artifacts/package.json')
      expect(res.status).toBe(400)
    })

    it('rejects change IDs with special characters', async () => {
      const ctx = makeCtxWithPath(tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/my%2Fevil/artifacts/proposal.md')
      expect(res.status).toBe(400)
    })

    it('returns 404 when artifact file does not exist', async () => {
      fs.mkdirSync(path.join(tmpDir, 'openspec', 'changes', 'my-change'), { recursive: true })
      const ctx = makeCtxWithPath(tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/my-change/artifacts/proposal.md')
      expect(res.status).toBe(404)
    })

    it('returns artifact content from active changes dir', async () => {
      const changeDir = path.join(tmpDir, 'openspec', 'changes', 'my-change')
      fs.mkdirSync(changeDir, { recursive: true })
      fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# My Proposal')
      const ctx = makeCtxWithPath(tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/my-change/artifacts/proposal.md')
      expect(res.status).toBe(200)
      expect(res.body.content).toBe('# My Proposal')
      expect(res.body.artifact).toBe('proposal.md')
      expect(res.body.changeId).toBe('my-change')
    })

    it('returns artifact content from archive dir', async () => {
      const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive', 'old-change')
      fs.mkdirSync(archiveDir, { recursive: true })
      fs.writeFileSync(path.join(archiveDir, 'design.md'), '# Design')
      const ctx = makeCtxWithPath(tmpDir)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/old-change/artifacts/design.md')
      expect(res.status).toBe(200)
      expect(res.body.content).toBe('# Design')
    })
  })

  // ─── Trends endpoint ────────────────────────────────────────────────────────

  describe('GET /:projectId/trends', () => {
    it('returns 400 for invalid period', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/trends?period=invalid')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid period')
    })

    it('returns trends data for valid period 7d', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/trends?period=7d')
      expect(res.status).toBe(200)
    })

    it('uses 7d as default period', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/trends')
      expect(res.status).toBe(200)
    })

    it('accepts 1d and 30d periods', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      expect((await request(app).get('/api/projects/proj-1/trends?period=1d')).status).toBe(200)
      expect((await request(app).get('/api/projects/proj-1/trends?period=30d')).status).toBe(200)
    })
  })

  // ─── Config routes ──────────────────────────────────────────────────────────

  describe('GET /:projectId/config', () => {
    it('returns config object with project, issueTracker, commands', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/config')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('project')
      expect(res.body).toHaveProperty('issueTracker')
      expect(res.body).toHaveProperty('commands')
    })
  })

  describe('POST /:projectId/config', () => {
    it('persists active tracker', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/config')
        .send({ active: 'github' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('persists label filter', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/config')
        .send({ labelFilter: 'bug' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('accepts empty body without error', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/config').send({})
      expect(res.status).toBe(200)
    })
  })

  // ─── Issues endpoint ────────────────────────────────────────────────────────

  describe('GET /:projectId/issues', () => {
    it('returns 503 or 200 depending on tracker availability', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/issues')
      expect([200, 503]).toContain(res.status)
    })
  })

  // ─── GET /stats ─────────────────────────────────────────────────────────────

  describe('GET /:projectId/stats', () => {
    it('returns stats object', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/stats')
      expect(res.status).toBe(200)
    })
  })

  // ─── DELETE /jobs (purge) ────────────────────────────────────────────────────

  describe('DELETE /:projectId/jobs', () => {
    it('returns ok with deleted count', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(typeof res.body.deleted).toBe('number')
    })
  })

  // ─── Full conversation lifecycle ─────────────────────────────────────────────

  describe('full conversation lifecycle', () => {
    it('creates, reads, updates, and deletes a conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))

      // Create
      const createRes = await request(app)
        .post('/api/projects/proj-1/chat/conversations')
        .send({ model: 'claude-sonnet-4-5' })
      expect(createRes.status).toBe(201)
      const convId = createRes.body.conversation.id

      // Read
      const getRes = await request(app).get(`/api/projects/proj-1/chat/conversations/${convId}`)
      expect(getRes.status).toBe(200)
      expect(getRes.body.conversation.id).toBe(convId)

      // Get messages
      const msgsRes = await request(app).get(`/api/projects/proj-1/chat/conversations/${convId}/messages`)
      expect(msgsRes.status).toBe(200)
      expect(Array.isArray(msgsRes.body.messages)).toBe(true)

      // Update
      const patchRes = await request(app)
        .patch(`/api/projects/proj-1/chat/conversations/${convId}`)
        .send({ title: 'Updated Title' })
      expect(patchRes.status).toBe(200)
      expect(patchRes.body.ok).toBe(true)

      // Delete
      const deleteRes = await request(app).delete(`/api/projects/proj-1/chat/conversations/${convId}`)
      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.ok).toBe(true)

      // Verify deleted
      const afterDelete = await request(app).get(`/api/projects/proj-1/chat/conversations/${convId}`)
      expect(afterDelete.status).toBe(404)
    })

    it('returns 404 for DELETE /conversations/:id/messages/stream when no active stream', async () => {
      const chatManager = makeChatManager({ isActive: vi.fn(() => false) })
      const ctx = makeContext(db, { chatManager: chatManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/chat/conversations/some-id/messages/stream')
      expect(res.status).toBe(404)
    })
  })

  // ─── Config routes (dailyBudgetUsd) ──────────────────────────────────────────

  describe('Config routes', () => {
    describe('GET /:projectId/config', () => {
      it('returns config with null dailyBudgetUsd when not set', async () => {
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app).get('/api/projects/proj-1/config')
        expect(res.status).toBe(200)
        expect(res.body.dailyBudgetUsd).toBeNull()
      })

      it('returns config with dailyBudgetUsd when set', async () => {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.daily_budget_usd', '25.5')`).run()
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app).get('/api/projects/proj-1/config')
        expect(res.status).toBe(200)
        expect(res.body.dailyBudgetUsd).toBe(25.5)
      })
    })

    describe('POST /:projectId/config', () => {
      it('sets dailyBudgetUsd', async () => {
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app)
          .post('/api/projects/proj-1/config')
          .send({ dailyBudgetUsd: 10.0 })
        expect(res.status).toBe(200)
        expect(res.body.ok).toBe(true)
        const row = db.prepare(`SELECT value FROM queue_state WHERE key = 'config.daily_budget_usd'`).get() as { value: string }
        expect(row.value).toBe('10')
      })

      it('clears dailyBudgetUsd when null', async () => {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.daily_budget_usd', '10')`).run()
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app)
          .post('/api/projects/proj-1/config')
          .send({ dailyBudgetUsd: null })
        expect(res.status).toBe(200)
        const row = db.prepare(`SELECT value FROM queue_state WHERE key = 'config.daily_budget_usd'`).get()
        expect(row).toBeUndefined()
      })

      it('ignores dailyBudgetUsd when not a positive number', async () => {
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app)
          .post('/api/projects/proj-1/config')
          .send({ dailyBudgetUsd: -5 })
        expect(res.status).toBe(200)
        const row = db.prepare(`SELECT value FROM queue_state WHERE key = 'config.daily_budget_usd'`).get()
        expect(row).toBeUndefined()
      })

      it('sets active and labelFilter together', async () => {
        const ctx = makeContext(db)
        const { app } = createApp(new Map([['proj-1', ctx]]))
        const res = await request(app)
          .post('/api/projects/proj-1/config')
          .send({ active: 'tracker1', labelFilter: 'bug' })
        expect(res.status).toBe(200)
        expect(res.body.ok).toBe(true)
      })
    })
  })

  // ─── Spec Launcher routes ────────────────────────────────────────────────────

  describe('Spec Launcher routes', () => {
    it('POST /spec-launcher/start returns 400 without description', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('description is required')
    })

    it('POST /spec-launcher/start returns 400 for empty string description', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({ description: '   ' })
      expect(res.status).toBe(400)
    })

    it('POST /spec-launcher/start returns 202 with valid description', async () => {
      const launchFn = vi.fn(async () => {})
      const ctx = makeContext(db, { specLauncherManager: makeSpecLauncherManager({ launch: launchFn }) as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spec-launcher/start')
        .send({ description: 'Add user auth' })
      expect(res.status).toBe(202)
      expect(res.body.launchId).toBeDefined()
    })

    it('DELETE /spec-launcher/:launchId returns 404 for unknown launch', async () => {
      const ctx = makeContext(db, { specLauncherManager: makeSpecLauncherManager({ isActive: vi.fn(() => false) }) as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/spec-launcher/unknown-id')
      expect(res.status).toBe(404)
    })

    it('DELETE /spec-launcher/:launchId cancels active launch', async () => {
      const cancelFn = vi.fn()
      const ctx = makeContext(db, { specLauncherManager: makeSpecLauncherManager({ isActive: vi.fn(() => true), cancel: cancelFn }) as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/spec-launcher/active-id')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(cancelFn).toHaveBeenCalledWith('active-id')
    })
  })

  // ─── Change Artifact Browser routes ──────────────────────────────────────────

  describe('Change Artifact Browser', () => {
    it('returns 400 for invalid artifact name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/chg-1/artifacts/malicious.js')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid artifact')
    })

    it('returns 400 for path traversal in changeId', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/chg%2F..%2F..%2Fetc/artifacts/proposal.md')
      expect(res.status).toBe(400)
    })

    it('returns 404 when artifact file does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/chg-1/artifacts/proposal.md')
      expect(res.status).toBe(404)
      vi.restoreAllMocks()
    })

    it('falls back to archive dir when active dir has no artifact', async () => {
      let callCount = 0
      vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        callCount++
        return callCount > 1 // first call (active) returns false, second (archive) returns true
      })
      vi.spyOn(fs, 'readFileSync').mockReturnValue('# Archived')
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/chg-1/artifacts/design.md')
      expect(res.status).toBe(200)
      expect(res.body.content).toBe('# Archived')
      vi.restoreAllMocks()
    })

    it('returns artifact content when file exists', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockReturnValue('# Proposal Content')
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes/chg-1/artifacts/proposal.md')
      expect(res.status).toBe(200)
      expect(res.body.content).toBe('# Proposal Content')
      expect(res.body.artifact).toBe('proposal.md')
      vi.restoreAllMocks()
    })
  })

  // ─── Template routes ─────────────────────────────────────────────────────────

  describe('Template routes', () => {
    it('GET /templates returns empty list initially', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/templates')
      expect(res.status).toBe(200)
      expect(res.body.templates).toEqual([])
    })

    it('POST /templates creates and returns a template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Deploy', commands: ['build', 'deploy'] })
      expect(res.status).toBe(201)
      expect(res.body.template.name).toBe('Deploy')
      expect(res.body.template.commands).toEqual(['build', 'deploy'])
    })

    it('POST /templates returns 400 without name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ commands: ['build'] })
      expect(res.status).toBe(400)
    })

    it('POST /templates returns 400 with empty commands', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Test', commands: [] })
      expect(res.status).toBe(400)
    })

    it('POST /templates returns 400 with non-string command', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Test', commands: [123] })
      expect(res.status).toBe(400)
    })

    it('POST /templates returns 409 for duplicate name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      await request(app).post('/api/projects/proj-1/templates').send({ name: 'Deploy', commands: ['build'] })
      const res = await request(app).post('/api/projects/proj-1/templates').send({ name: 'Deploy', commands: ['test'] })
      expect(res.status).toBe(409)
    })

    it('GET /templates/:id returns 404 for unknown template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/templates/nonexistent')
      expect(res.status).toBe(404)
    })

    it('PATCH /templates/:id updates template name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'Old', commands: ['cmd'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ name: 'New' })
      expect(res.status).toBe(200)
      expect(res.body.template.name).toBe('New')
    })

    it('PATCH /templates/:id returns 404 for unknown template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/templates/nonexistent').send({ name: 'New' })
      expect(res.status).toBe(404)
    })

    it('PATCH /templates/:id returns 400 for empty name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'T', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ name: '' })
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:id returns 400 for empty commands array', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'T', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ commands: [] })
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:id returns 400 for non-string commands', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'T', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ commands: [42] })
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:id updates description to null', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'T', description: 'orig', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ description: null })
      expect(res.status).toBe(200)
      expect(res.body.template.description).toBeNull()
    })

    it('PATCH /templates/:id updates commands', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'T', commands: ['old'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ commands: ['new1', 'new2'] })
      expect(res.status).toBe(200)
      expect(res.body.template.commands).toEqual(['new1', 'new2'])
    })

    it('PATCH /templates/:id returns 409 for duplicate name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      await request(app).post('/api/projects/proj-1/templates').send({ name: 'A', commands: ['c'] })
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'B', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).patch(`/api/projects/proj-1/templates/${id}`).send({ name: 'A' })
      expect(res.status).toBe(409)
    })

    it('DELETE /templates/:id removes a template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'Tmp', commands: ['c'] })
      const id = createRes.body.template.id
      const res = await request(app).delete(`/api/projects/proj-1/templates/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('DELETE /templates/:id returns 404 for unknown template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/templates/nonexistent')
      expect(res.status).toBe(404)
    })

    it('POST /templates/:id/run enqueues template commands', async () => {
      const enqueueFn = vi.fn(() => ({ id: `job-${Math.random().toString(36).slice(2, 6)}`, queuePosition: 0 }))
      const ctx = makeContext(db, { queueManager: makeQueueManager({ enqueue: enqueueFn }) as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'Run', commands: ['cmd1', 'cmd2'] })
      const id = createRes.body.template.id
      const res = await request(app).post(`/api/projects/proj-1/templates/${id}/run`)
      expect(res.status).toBe(202)
      expect(res.body.jobIds).toHaveLength(2)
      expect(enqueueFn).toHaveBeenCalledTimes(2)
    })

    it('POST /templates/:id/run returns 404 for unknown template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/templates/nonexistent/run')
      expect(res.status).toBe(404)
    })

    it('POST /templates/:id/run returns 400 when claude not found', async () => {
      const enqueueFn = vi.fn(() => { throw new ClaudeNotFoundError('Claude CLI not found') })
      const ctx = makeContext(db, { queueManager: makeQueueManager({ enqueue: enqueueFn }) as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app).post('/api/projects/proj-1/templates').send({ name: 'Fail', commands: ['cmd'] })
      const id = createRes.body.template.id
      const res = await request(app).post(`/api/projects/proj-1/templates/${id}/run`)
      expect(res.status).toBe(400)
    })
  })
})
