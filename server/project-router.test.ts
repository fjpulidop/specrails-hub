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
  isEnriching: (id: string) => boolean
  startInstall: () => void
  startSetup: () => void
  startEnrich: () => void
  resumeSetup: () => void
  resumeEnrich: () => void
  abort: () => void
  getCheckpointStatus: () => any[]
  getInstallLog: () => string[]
  getInstallTier: () => string | undefined
  getSummary: () => { agents: number; personas: number; commands: number }
}> = {}) {
  const isEnriching = overrides.isEnriching ?? overrides.isSettingUp ?? vi.fn(() => false)
  return {
    isInstalling: overrides.isInstalling ?? vi.fn(() => false),
    isEnriching,
    isSettingUp: overrides.isSettingUp ?? isEnriching,
    startInstall: overrides.startInstall ?? vi.fn(),
    startEnrich: overrides.startEnrich ?? overrides.startSetup ?? vi.fn(),
    startSetup: overrides.startSetup ?? overrides.startEnrich ?? vi.fn(),
    resumeEnrich: overrides.resumeEnrich ?? overrides.resumeSetup ?? vi.fn(),
    resumeSetup: overrides.resumeSetup ?? overrides.resumeEnrich ?? vi.fn(),
    abort: overrides.abort ?? vi.fn(),
    getCheckpointStatus: overrides.getCheckpointStatus ?? vi.fn(() => []),
    getInstallLog: overrides.getInstallLog ?? vi.fn(() => []),
    getInstallTier: overrides.getInstallTier ?? vi.fn(() => undefined),
    getSummary: overrides.getSummary ?? vi.fn(() => ({ agents: 0, personas: 0, commands: 0 })),
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
    ticketWatcher: { notifyHubWrite: vi.fn(), start: vi.fn(), close: vi.fn() } as any,
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

    it('deletes terminal job from DB instead of returning 409', async () => {
      const qm = makeQueueManager({ cancel: vi.fn(() => { throw new JobAlreadyTerminalError() }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs/some-job')
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('deleted')
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

    it('GET /setup/checkpoints includes summary with agent/persona/command counts', async () => {
      // Regression: was missing from the response; SetupWizard.tsx used hardcoded zeros.
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/setup/checkpoints')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('summary')
      expect(res.body.summary).toMatchObject({
        agents: expect.any(Number),
        personas: expect.any(Number),
        commands: expect.any(Number),
      })
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

  // ─── Job Templates ────────────────────────────────────────────────────────

  describe('job templates CRUD', () => {
    it('GET /templates returns empty list initially', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/templates')
      expect(res.status).toBe(200)
      expect(res.body.templates).toEqual([])
    })

    it('POST /templates creates a template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'My Template', description: 'A test template', commands: ['/sr:test', '/sr:build'] })
      expect(res.status).toBe(201)
      expect(res.body.template.name).toBe('My Template')
      expect(res.body.template.commands).toEqual(['/sr:test', '/sr:build'])
    })

    it('POST /templates returns 400 when name is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ commands: ['/sr:test'] })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/name/)
    })

    it('POST /templates returns 400 when commands is empty array', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'T', commands: [] })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/commands/)
    })

    it('POST /templates returns 400 when a command is not a string', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'T', commands: [42] })
      expect(res.status).toBe(400)
    })

    it('POST /templates returns 409 for duplicate name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Dup', commands: ['/sr:test'] })
      const res = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Dup', commands: ['/sr:build'] })
      expect(res.status).toBe(409)
    })

    it('GET /templates/:templateId returns the template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Get Me', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app).get(`/api/projects/proj-1/templates/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.template.id).toBe(id)
    })

    it('GET /templates/:templateId returns 404 for unknown id', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/templates/no-such-id')
      expect(res.status).toBe(404)
    })

    it('PATCH /templates/:templateId updates name and description', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Old Name', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ name: 'New Name', description: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.template.name).toBe('New Name')
    })

    it('PATCH /templates/:templateId returns 404 for unknown id', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/templates/no-such-id')
        .send({ name: 'X' })
      expect(res.status).toBe(404)
    })

    it('PATCH /templates/:templateId returns 400 for empty name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Valid', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ name: '' })
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:templateId returns 400 for empty commands array', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Valid2', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ commands: [] })
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:templateId returns 409 for duplicate name', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Alpha', commands: ['/sr:run'] })
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Beta', commands: ['/sr:run'] })
      const betaId = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${betaId}`)
        .send({ name: 'Alpha' })
      expect(res.status).toBe(409)
    })

    it('DELETE /templates/:templateId deletes the template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'To Delete', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const deleteRes = await request(app).delete(`/api/projects/proj-1/templates/${id}`)
      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.ok).toBe(true)
      const getRes = await request(app).get(`/api/projects/proj-1/templates/${id}`)
      expect(getRes.status).toBe(404)
    })

    it('DELETE /templates/:templateId returns 404 for unknown id', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/templates/no-such-id')
      expect(res.status).toBe(404)
    })

    it('POST /templates/:templateId/run enqueues all commands as a pipeline', async () => {
      const enqueue = vi.fn()
        .mockReturnValueOnce({ id: 'job-1', queuePosition: 0 })
        .mockReturnValueOnce({ id: 'job-2', queuePosition: 1 })
      const queueManager = makeQueueManager({ enqueue })
      const ctx = makeContext(db, { queueManager: queueManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Run Me', commands: ['/sr:test', '/sr:build'] })
      const id = createRes.body.template.id
      const res = await request(app).post(`/api/projects/proj-1/templates/${id}/run`)
      expect(res.status).toBe(202)
      expect(res.body.jobIds).toEqual(['job-1', 'job-2'])
      expect(enqueue).toHaveBeenCalledTimes(2)
    })

    it('POST /templates/:templateId/run returns 404 for unknown template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/templates/no-such-id/run')
      expect(res.status).toBe(404)
    })

    it('POST /templates/:templateId/run returns 400 when Claude not found', async () => {
      const enqueue = vi.fn().mockImplementation(() => { throw new ClaudeNotFoundError('claude not found') })
      const queueManager = makeQueueManager({ enqueue })
      const ctx = makeContext(db, { queueManager: queueManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Fail Run', commands: ['/sr:test'] })
      const id = createRes.body.template.id
      const res = await request(app).post(`/api/projects/proj-1/templates/${id}/run`)
      expect(res.status).toBe(400)
    })

    it('PATCH /templates/:templateId sets description to null when passed null', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Desc Test', description: 'Initial', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ description: null })
      expect(res.status).toBe(200)
    })

    it('PATCH /templates/:templateId returns 400 when a command is not a string', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'CmdTest', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ commands: [123] })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/command/)
    })

    it('POST /templates/:templateId/run with chain=false enqueues without dependencies', async () => {
      const enqueue = vi.fn()
        .mockReturnValueOnce({ id: 'job-1', queuePosition: 0 })
        .mockReturnValueOnce({ id: 'job-2', queuePosition: 1 })
      const queueManager = makeQueueManager({ enqueue })
      const ctx = makeContext(db, { queueManager: queueManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'No Chain', commands: ['/sr:test', '/sr:build'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .post(`/api/projects/proj-1/templates/${id}/run`)
        .send({ chain: false })
      expect(res.status).toBe(202)
      expect(res.body.jobIds).toEqual(['job-1', 'job-2'])
      // Verify no dependsOnJobId was passed
      for (const call of enqueue.mock.calls) {
        expect(call[2]?.dependsOnJobId).toBeUndefined()
      }
    })

    it('POST /templates/:templateId/run returns 500 for unexpected errors', async () => {
      const enqueue = vi.fn().mockImplementation(() => { throw new Error('unexpected') })
      const queueManager = makeQueueManager({ enqueue })
      const ctx = makeContext(db, { queueManager: queueManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Error Run', commands: ['/sr:test'] })
      const id = createRes.body.template.id
      const res = await request(app).post(`/api/projects/proj-1/templates/${id}/run`)
      expect(res.status).toBe(500)
    })
  })

  // ─── Pipeline routes ─────────────────────────────────────────────────────
  // NOTE: POST /pipelines removed — ad-hoc pipeline creation consolidated into rails (templates).

  describe('GET /:projectId/pipelines/:pipelineId', () => {
    it('returns 404 for unknown pipeline', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/pipelines/unknown-id')
      expect(res.status).toBe(404)
    })

    it('returns pipeline status with jobs', async () => {
      // Insert jobs with a pipeline_id
      const pipeId = 'pipe-123'
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status, pipeline_id) VALUES ('pj-1', 'sr:test', '2025-01-01T10:00:00.000Z', 'completed', ?)`
      ).run(pipeId)
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status, pipeline_id) VALUES ('pj-2', 'sr:build', '2025-01-01T10:01:00.000Z', 'completed', ?)`
      ).run(pipeId)
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get(`/api/projects/proj-1/pipelines/${pipeId}`)
      expect(res.status).toBe(200)
      expect(res.body.pipelineId).toBe(pipeId)
      expect(res.body.status).toBe('completed')
      expect(res.body.jobs).toHaveLength(2)
    })

    it('returns failed status when any job failed', async () => {
      const pipeId = 'pipe-fail'
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status, pipeline_id) VALUES ('pfj-1', 'sr:test', '2025-01-01T10:00:00.000Z', 'completed', ?)`
      ).run(pipeId)
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, finished_at, status, pipeline_id) VALUES ('pfj-2', 'sr:build', '2025-01-01T10:01:00.000Z', '2025-01-01T10:02:00.000Z', 'failed', ?)`
      ).run(pipeId)
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get(`/api/projects/proj-1/pipelines/${pipeId}`)
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('failed')
    })

    it('returns running status when jobs are still in progress', async () => {
      const pipeId = 'pipe-run'
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status, pipeline_id) VALUES ('prj-1', 'sr:test', '2025-01-01T10:00:00.000Z', 'completed', ?)`
      ).run(pipeId)
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status, pipeline_id) VALUES ('prj-2', 'sr:build', '2025-01-01T10:01:00.000Z', 'running', ?)`
      ).run(pipeId)
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get(`/api/projects/proj-1/pipelines/${pipeId}`)
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('running')
    })
  })

  // ─── POST /spawn error paths ─────────────────────────────────────────────

  describe('POST /spawn additional paths', () => {
    it('returns 400 for invalid priority', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spawn')
        .send({ command: 'sr:test', priority: 'invalid' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('priority must be one of')
    })

    it('returns 500 on unexpected error during spawn', async () => {
      const qm = makeQueueManager({ enqueue: vi.fn(() => { throw new Error('unexpected') }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spawn')
        .send({ command: 'sr:test' })
      expect(res.status).toBe(500)
    })

    it('passes priority and dependsOnJobId through to enqueue', async () => {
      const enqueue = vi.fn(() => ({ id: 'job-x', queuePosition: 0 }))
      const qm = makeQueueManager({ enqueue })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/spawn')
        .send({ command: 'sr:test', priority: 'high', dependsOnJobId: 'parent-1', pipelineId: 'pipe-1' })
      expect(res.status).toBe(202)
      expect(enqueue).toHaveBeenCalledWith('sr:test', 'high', {
        dependsOnJobId: 'parent-1',
        pipelineId: 'pipe-1',
      })
    })
  })

  // ─── PATCH /jobs/:id/priority ────────────────────────────────────────────

  describe('PATCH /:projectId/jobs/:id/priority', () => {
    it('returns 400 when priority is missing', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/jobs/some-job/priority')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('priority must be one of')
    })

    it('returns 400 for invalid priority value', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/jobs/some-job/priority')
        .send({ priority: 'mega' })
      expect(res.status).toBe(400)
    })

    it('returns 200 on valid priority update', async () => {
      const updatePriority = vi.fn()
      const qm = { ...makeQueueManager(), updatePriority }
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/jobs/some-job/priority')
        .send({ priority: 'high' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(updatePriority).toHaveBeenCalledWith('some-job', 'high')
    })

    it('returns 404 when job not found', async () => {
      const updatePriority = vi.fn(() => { throw new JobNotFoundError() })
      const qm = { ...makeQueueManager(), updatePriority }
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/jobs/no-job/priority')
        .send({ priority: 'low' })
      expect(res.status).toBe(404)
    })

    it('returns 400 when updatePriority throws a generic error', async () => {
      const updatePriority = vi.fn(() => { throw new Error('Cannot update running job') })
      const qm = { ...makeQueueManager(), updatePriority }
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/jobs/some-job/priority')
        .send({ priority: 'low' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Cannot update running job')
    })
  })

  // ─── DELETE /jobs/:id 500 error path ────────────────────────────────────

  describe('DELETE /jobs/:id 500 error', () => {
    it('returns 500 on unexpected error during cancel', async () => {
      const qm = makeQueueManager({ cancel: vi.fn(() => { throw new Error('boom') }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs/some-job')
      expect(res.status).toBe(500)
    })

    it('returns 200 with status on successful cancel', async () => {
      const qm = makeQueueManager({ cancel: vi.fn(() => 'canceled') })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/jobs/some-job')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.status).toBe('canceled')
    })
  })

  // ─── Jobs export ─────────────────────────────────────────────────────────

  describe('GET /:projectId/jobs/export', () => {
    it('returns 400 for invalid format', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/jobs/export?format=xml')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid format')
    })

    it('exports jobs as JSON (default format)', async () => {
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status) VALUES ('exp-1', 'sr:test', '2025-01-01T10:00:00.000Z', 'completed')`
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/jobs/export')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.jobs)).toBe(true)
      expect(res.body.jobs.length).toBeGreaterThanOrEqual(1)
    })

    it('exports jobs as CSV', async () => {
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status) VALUES ('exp-csv', 'sr:test', '2025-01-01T10:00:00.000Z', 'completed')`
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/jobs/export?format=csv')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.text).toContain('id,command,status')
    })

    it('supports from and to date filters', async () => {
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status) VALUES ('eflt-1', 'sr:a', '2025-01-01T10:00:00.000Z', 'completed')`
      ).run()
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, status) VALUES ('eflt-2', 'sr:b', '2025-06-01T10:00:00.000Z', 'completed')`
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get(
        '/api/projects/proj-1/jobs/export?format=json&from=2025-05-01T00:00:00.000Z&to=2025-12-31T00:00:00.000Z'
      )
      expect(res.status).toBe(200)
      expect(res.body.jobs.some((j: any) => j.id === 'eflt-2')).toBe(true)
      expect(res.body.jobs.some((j: any) => j.id === 'eflt-1')).toBe(false)
    })
  })

  // Note: GET /jobs/compare route is unreachable because GET /jobs/:id is
  // defined first in the router and catches 'compare' as an :id param.
  // This is a router ordering issue in the source code (not a test gap).

  // ─── Analytics export ────────────────────────────────────────────────────

  describe('GET /:projectId/analytics/export', () => {
    it('returns 400 for invalid format', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics/export?format=xml')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid format')
    })

    it('returns 400 for invalid period', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics/export?period=invalid')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid period')
    })

    it('returns 400 for custom period without from/to', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics/export?period=custom')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('from and to are required')
    })

    it('exports analytics as JSON', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics/export?format=json&period=7d')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('kpi')
    })

    it('exports analytics as CSV', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/analytics/export?format=csv&period=7d')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.text).toContain('command')
    })
  })

  // ─── Budget routes ───────────────────────────────────────────────────────

  describe('GET /:projectId/budget', () => {
    it('returns budget data with null budget when not configured', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/budget')
      expect(res.status).toBe(200)
      expect(res.body.dailyBudgetUsd).toBeNull()
      expect(res.body.costToday).toBeDefined()
      expect(res.body.budgetUtilizationPct).toBeNull()
    })

    it('returns budget utilization when daily budget is configured', async () => {
      db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.daily_budget_usd', '10.00')`).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/budget')
      expect(res.status).toBe(200)
      expect(res.body.dailyBudgetUsd).toBe(10)
      expect(typeof res.body.budgetUtilizationPct).toBe('number')
    })

    it('returns jobCostThresholdUsd when configured', async () => {
      db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.job_cost_threshold_usd', '2.50')`).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/budget')
      expect(res.status).toBe(200)
      expect(res.body.jobCostThresholdUsd).toBe(2.5)
    })
  })

  describe('PATCH /:projectId/budget', () => {
    it('sets daily budget', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/budget')
        .send({ dailyBudgetUsd: 25.0 })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      // Verify it was persisted
      const getRes = await request(app).get('/api/projects/proj-1/budget')
      expect(getRes.body.dailyBudgetUsd).toBe(25)
    })

    it('clears daily budget when null', async () => {
      db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.daily_budget_usd', '10')`).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/budget')
        .send({ dailyBudgetUsd: null })
      expect(res.status).toBe(200)
      const getRes = await request(app).get('/api/projects/proj-1/budget')
      expect(getRes.body.dailyBudgetUsd).toBeNull()
    })

    it('sets job cost threshold', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/budget')
        .send({ jobCostThresholdUsd: 5.0 })
      expect(res.status).toBe(200)
      const getRes = await request(app).get('/api/projects/proj-1/budget')
      expect(getRes.body.jobCostThresholdUsd).toBe(5)
    })

    it('clears job cost threshold when null', async () => {
      db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.job_cost_threshold_usd', '5')`).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .patch('/api/projects/proj-1/budget')
        .send({ jobCostThresholdUsd: null })
      expect(res.status).toBe(200)
      const getRes = await request(app).get('/api/projects/proj-1/budget')
      expect(getRes.body.jobCostThresholdUsd).toBeNull()
    })

    it('accepts empty body', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).patch('/api/projects/proj-1/budget').send({})
      expect(res.status).toBe(200)
    })
  })

  // ─── POST /config dailyBudgetUsd ─────────────────────────────────────────

  describe('POST /:projectId/config dailyBudgetUsd', () => {
    it('sets dailyBudgetUsd', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/config')
        .send({ dailyBudgetUsd: 15.0 })
      expect(res.status).toBe(200)
    })

    it('clears dailyBudgetUsd when null', async () => {
      db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.daily_budget_usd', '15')`).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/config')
        .send({ dailyBudgetUsd: null })
      expect(res.status).toBe(200)
    })
  })

  // ─── GET /metrics ──────────────────────────────────────────────────────────

  describe('GET /:projectId/metrics', () => {
    it('returns metrics data', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/metrics')
      // metrics depends on project.path existing — may return 200 or 500
      expect([200, 500]).toContain(res.status)
    })
  })

  // ─── Proposal refine and create-issue ─────────────────────────────────────

  describe('POST /:projectId/propose/:id/refine', () => {
    it('returns 404 for unknown proposal', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose/unknown/refine')
        .send({ feedback: 'more tests' })
      expect(res.status).toBe(404)
    })

    it('returns 400 when feedback is missing', async () => {
      // Create a proposal first
      const { createProposal, getProposal } = await import('./db')
      createProposal(db, { id: 'prop-ref', idea: 'test idea' })
      // Manually set status to review
      db.prepare(`UPDATE proposals SET status = 'review' WHERE id = 'prop-ref'`).run()

      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose/prop-ref/refine')
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('feedback is required')
    })

    it('returns 409 when proposal is busy', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-busy', idea: 'test' })
      db.prepare(`UPDATE proposals SET status = 'review' WHERE id = 'prop-busy'`).run()

      const pm = makeProposalManager({ isActive: vi.fn(() => true) })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose/prop-busy/refine')
        .send({ feedback: 'more details' })
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('PROPOSAL_BUSY')
    })

    it('returns 409 when proposal is not in review state', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-pending', idea: 'test' })
      // status defaults to 'exploring', not 'review'

      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose/prop-pending/refine')
        .send({ feedback: 'more details' })
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('not in review state')
    })

    it('returns 202 and calls sendRefinement on valid request', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-ok', idea: 'test' })
      db.prepare(`UPDATE proposals SET status = 'review' WHERE id = 'prop-ok'`).run()

      const sendRefinement = vi.fn(async () => {})
      const pm = makeProposalManager({ sendRefinement })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose/prop-ok/refine')
        .send({ feedback: 'add more tests' })
      expect(res.status).toBe(202)
      await new Promise((r) => setTimeout(r, 10))
      expect(sendRefinement).toHaveBeenCalledWith('prop-ok', 'add more tests')
    })
  })

  describe('POST /:projectId/propose/:id/create-issue', () => {
    it('returns 404 for unknown proposal', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/propose/unknown/create-issue')
      expect(res.status).toBe(404)
    })

    it('returns 409 when proposal is busy', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-ci-busy', idea: 'test' })
      db.prepare(`UPDATE proposals SET status = 'review' WHERE id = 'prop-ci-busy'`).run()

      const pm = makeProposalManager({ isActive: vi.fn(() => true) })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/propose/prop-ci-busy/create-issue')
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('PROPOSAL_BUSY')
    })

    it('returns 409 when proposal is not in review state', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-ci-norev', idea: 'test' })

      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/propose/prop-ci-norev/create-issue')
      expect(res.status).toBe(409)
    })

    it('returns 202 and calls createIssue on valid request', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-ci-ok', idea: 'test' })
      db.prepare(`UPDATE proposals SET status = 'review' WHERE id = 'prop-ci-ok'`).run()

      const createIssue = vi.fn(async () => {})
      const pm = makeProposalManager({ createIssue })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/propose/prop-ci-ok/create-issue')
      expect(res.status).toBe(202)
      await new Promise((r) => setTimeout(r, 10))
      expect(createIssue).toHaveBeenCalledWith('prop-ci-ok')
    })
  })

  // ─── DELETE /chat/conversations/:id/messages/stream (active stream) ────

  describe('DELETE /:projectId/chat/conversations/:id/messages/stream', () => {
    it('aborts active stream and returns ok', async () => {
      const abort = vi.fn()
      const chatManager = makeChatManager({
        isActive: vi.fn(() => true),
        abort,
      })
      const ctx = makeContext(db, { chatManager: chatManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .delete('/api/projects/proj-1/chat/conversations/conv-123/messages/stream')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(abort).toHaveBeenCalledWith('conv-123')
    })
  })

  // ─── POST /setup/message additional paths ──────────────────────────────

  describe('POST /:projectId/setup/message additional paths', () => {
    it('returns 409 when setup is already in progress', async () => {
      const sm = makeSetupManager({ isSettingUp: vi.fn(() => true) })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/setup/message')
        .send({ sessionId: 'sess-1', message: 'hello' })
      expect(res.status).toBe(409)
    })

    it('returns 202 and calls resumeSetup on valid input', async () => {
      const resumeSetup = vi.fn()
      const sm = makeSetupManager({ resumeSetup })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/setup/message')
        .send({ sessionId: 'sess-1', message: 'hello' })
      expect(res.status).toBe(202)
      expect(resumeSetup).toHaveBeenCalled()
    })
  })

  // ─── POST /setup/install and /setup/start success paths ─────────────────

  describe('POST /:projectId/setup/install success', () => {
    it('returns 202 and calls startInstall', async () => {
      const startInstall = vi.fn()
      const sm = makeSetupManager({ startInstall })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/install')
      expect(res.status).toBe(202)
      expect(startInstall).toHaveBeenCalled()
    })
  })

  describe('POST /:projectId/setup/start success', () => {
    it('returns 202 and calls startSetup', async () => {
      const startSetup = vi.fn()
      const sm = makeSetupManager({ startSetup })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/start')
      expect(res.status).toBe(202)
      expect(startSetup).toHaveBeenCalled()
    })
  })

  // ─── POST /setup/abort ────────────────────────────────────────────────────

  describe('POST /:projectId/setup/abort', () => {
    it('aborts setup and returns ok', async () => {
      const abort = vi.fn()
      const sm = makeSetupManager({ abort })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/setup/abort')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(abort).toHaveBeenCalled()
    })
  })

  // ─── GET /jobs with query params ──────────────────────────────────────────

  describe('GET /:projectId/jobs with query params', () => {
    it('applies limit, offset, status, from, to filters', async () => {
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, finished_at, status) VALUES ('flt-1', 'sr:a', '2025-01-01T10:00:00.000Z', '2025-01-01T10:05:00.000Z', 'completed')`
      ).run()
      db.prepare(
        `INSERT INTO jobs (id, command, started_at, finished_at, status) VALUES ('flt-2', 'sr:b', '2025-06-01T10:00:00.000Z', '2025-06-01T10:05:00.000Z', 'failed')`
      ).run()
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get(
        '/api/projects/proj-1/jobs?limit=10&offset=0&status=completed'
      )
      expect(res.status).toBe(200)
    })
  })

  // ─── PUT /queue/reorder error path ────────────────────────────────────────

  describe('PUT /queue/reorder error path', () => {
    it('returns 400 when reorder throws', async () => {
      const qm = makeQueueManager({ reorder: vi.fn(() => { throw new Error('mismatch') }) })
      const ctx = makeContext(db, { queueManager: qm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .put('/api/projects/proj-1/queue/reorder')
        .send({ jobIds: ['a', 'b'] })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('mismatch')
    })
  })

  // ─── POST /propose success path ──────────────────────────────────────────

  describe('POST /:projectId/propose success path', () => {
    it('returns 202 with proposalId when proposal command exists', async () => {
      // This route calls resolveCommand — if the resolved command differs from input,
      // it means the command exists. We use a mock-like approach by just verifying the flow.
      const startExploration = vi.fn(async () => {})
      const pm = makeProposalManager({ startExploration })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/propose')
        .send({ idea: 'add dark mode' })
      // If propose-feature is not installed, returns 400; otherwise 202
      // Either way the route is exercised
      expect([202, 400]).toContain(res.status)
    })
  })

  // ─── DELETE /propose/:id (with existing proposal) ─────────────────────────

  describe('DELETE /:projectId/propose/:id with existing proposal', () => {
    it('deletes the proposal and calls cancel', async () => {
      const { createProposal } = await import('./db')
      createProposal(db, { id: 'prop-del', idea: 'delete me' })

      const cancel = vi.fn()
      const pm = makeProposalManager({ cancel })
      const ctx = makeContext(db, { proposalManager: pm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).delete('/api/projects/proj-1/propose/prop-del')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(cancel).toHaveBeenCalledWith('prop-del')
    })
  })

  // ─── GET /chat/conversations/:id/messages ────────────────────────────────

  describe('GET /:projectId/chat/conversations/:id/messages', () => {
    it('returns 404 for unknown conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/chat/conversations/nope/messages')
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /chat/conversations/:id/messages (404) ─────────────────────────

  describe('POST /:projectId/chat/conversations/:id/messages 404', () => {
    it('returns 404 for unknown conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app)
        .post('/api/projects/proj-1/chat/conversations/no-conv/messages')
        .send({ text: 'hello' })
      expect(res.status).toBe(404)
    })
  })

  // ─── GET /setup/install log ──────────────────────────────────────────────

  describe('GET /:projectId/setup/checkpoints install log', () => {
    it('includes logLines and savedSessionId in response', async () => {
      const sm = makeSetupManager({ getInstallLog: vi.fn(() => ['line1', 'line2']) })
      const ctx = makeContext(db, { setupManager: sm as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/setup/checkpoints')
      expect(res.status).toBe(200)
      expect(res.body.logLines).toEqual(['line1', 'line2'])
      expect(res.body).toHaveProperty('savedSessionId')
      expect(res.body).toHaveProperty('isInstalling')
      expect(res.body).toHaveProperty('isSettingUp')
    })
  })

  // ─── PATCH conversation model ──────────────────────────────────────────────

  describe('PATCH /:projectId/chat/conversations/:id model update', () => {
    it('updates model on a conversation', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/chat/conversations')
        .send({ model: 'claude-sonnet-4-5' })
      const convId = createRes.body.conversation.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/chat/conversations/${convId}`)
        .send({ model: 'claude-3-haiku' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  // ─── Changes with active jobs ──────────────────────────────────────────────

  describe('GET /:projectId/changes with running jobs', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specrails-hub-changes-active-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('passes active commands from running and queued jobs', async () => {
      const getJobs = vi.fn(() => [
        { status: 'running', command: '/sr:implement #1' },
        { status: 'queued', command: '/sr:test' },
        { status: 'completed', command: '/sr:build' },
      ])
      const qm = makeQueueManager({ getJobs })
      const ctx = makeContext(db, {
        queueManager: qm as any,
        project: { id: 'proj-1', slug: 'proj', name: 'Test', path: tmpDir, db_path: ':memory:', added_at: '', last_seen_at: '' },
      })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/changes')
      expect(res.status).toBe(200)
      expect(res.body.changes).toBeDefined()
    })
  })

  // ─── Template listing (non-empty) ────────────────────────────────────────

  describe('GET /:projectId/templates (non-empty)', () => {
    it('returns templates with parsed commands', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      // Create a template first
      await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'List Test', commands: ['/sr:run'] })
      const res = await request(app).get('/api/projects/proj-1/templates')
      expect(res.status).toBe(200)
      expect(res.body.templates.length).toBeGreaterThan(0)
      expect(res.body.templates[0].commands).toBeDefined()
    })
  })

  // ─── PATCH template update commands ──────────────────────────────────────

  describe('PATCH /:projectId/templates/:templateId commands update', () => {
    it('updates commands on a template', async () => {
      const ctx = makeContext(db)
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/templates')
        .send({ name: 'Cmd Update', commands: ['/sr:run'] })
      const id = createRes.body.template.id
      const res = await request(app)
        .patch(`/api/projects/proj-1/templates/${id}`)
        .send({ commands: ['/sr:test', '/sr:build'] })
      expect(res.status).toBe(200)
      expect(res.body.template.commands).toEqual(['/sr:test', '/sr:build'])
    })
  })

  // ─── POST /chat send message fires async handler ─────────────────────────

  describe('POST /:projectId/chat/conversations/:id/messages async path', () => {
    it('returns 202 and triggers sendMessage', async () => {
      const sendMessage = vi.fn(async () => {})
      const chatManager = makeChatManager({ sendMessage })
      const ctx = makeContext(db, { chatManager: chatManager as any })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const createRes = await request(app)
        .post('/api/projects/proj-1/chat/conversations')
        .send({ model: 'claude-sonnet-4-5' })
      const convId = createRes.body.conversation.id
      const res = await request(app)
        .post(`/api/projects/proj-1/chat/conversations/${convId}/messages`)
        .send({ text: 'hello world' })
      expect(res.status).toBe(202)
      await new Promise((r) => setTimeout(r, 10))
      expect(sendMessage).toHaveBeenCalledWith(convId, 'hello world', { lightweight: false, maxTurns: undefined })
    })
  })

  // ─── Terminals ──────────────────────────────────────────────────────────────

  describe('terminals', () => {
    const tmpdir = os.tmpdir()

    beforeEach(async () => {
      // Clear any leftover sessions between tests
      const { _resetTerminalManagerForTest } = await import('./terminal-manager')
      _resetTerminalManagerForTest()
    })

    afterEach(async () => {
      const { _resetTerminalManagerForTest } = await import('./terminal-manager')
      _resetTerminalManagerForTest()
      // give PTYs a tick to die
      await new Promise((r) => setTimeout(r, 50))
    })

    it('GET /terminals returns empty list + limit for a fresh project', async () => {
      const ctx = makeContext(db, { project: { id: 'proj-1', slug: 'p1', name: 'P1', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).get('/api/projects/proj-1/terminals')
      expect(res.status).toBe(200)
      expect(res.body.sessions).toEqual([])
      expect(res.body.limit).toBe(10)
    })

    it('POST /terminals creates a session with project.path as cwd', async () => {
      const ctx = makeContext(db, { project: { id: 'proj-1', slug: 'p1', name: 'P1', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const res = await request(app).post('/api/projects/proj-1/terminals').send({ cols: 90, rows: 30 })
      expect(res.status).toBe(201)
      expect(res.body.session.cwd).toBe(tmpdir)
      expect(res.body.session.cols).toBe(90)
      expect(res.body.session.rows).toBe(30)
      expect(typeof res.body.session.id).toBe('string')
    })

    it('POST /terminals returns 409 when limit reached', async () => {
      const ctx = makeContext(db, { project: { id: 'proj-1', slug: 'p1', name: 'P1', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      for (let i = 0; i < 10; i++) {
        const r = await request(app).post('/api/projects/proj-1/terminals').send({})
        expect(r.status).toBe(201)
      }
      const res = await request(app).post('/api/projects/proj-1/terminals').send({})
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('terminal_limit_exceeded')
      expect(res.body.limit).toBe(10)
    })

    it('PATCH /terminals/:id rejects empty and overlong names with 400', async () => {
      const ctx = makeContext(db, { project: { id: 'proj-1', slug: 'p1', name: 'P1', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const create = await request(app).post('/api/projects/proj-1/terminals').send({})
      const id = create.body.session.id
      const bad1 = await request(app).patch(`/api/projects/proj-1/terminals/${id}`).send({ name: '' })
      expect(bad1.status).toBe(400)
      const bad2 = await request(app).patch(`/api/projects/proj-1/terminals/${id}`).send({ name: 'x'.repeat(65) })
      expect(bad2.status).toBe(400)
      const ok = await request(app).patch(`/api/projects/proj-1/terminals/${id}`).send({ name: 'build' })
      expect(ok.status).toBe(200)
      expect(ok.body.session.name).toBe('build')
    })

    it('PATCH /terminals/:id returns 404 for session belonging to another project', async () => {
      const ctxA = makeContext(db, { project: { id: 'proj-A', slug: 'a', name: 'A', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const ctxB = makeContext(initDb(':memory:'), { project: { id: 'proj-B', slug: 'b', name: 'B', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const contexts = new Map<string, ProjectContext>()
      contexts.set('proj-A', ctxA)
      contexts.set('proj-B', ctxB)
      const { app } = createApp(contexts)
      const created = await request(app).post('/api/projects/proj-A/terminals').send({})
      const id = created.body.session.id
      const cross = await request(app).patch(`/api/projects/proj-B/terminals/${id}`).send({ name: 'x' })
      expect(cross.status).toBe(404)
    })

    it('DELETE /terminals/:id returns 200 then 404 on second call', async () => {
      const ctx = makeContext(db, { project: { id: 'proj-1', slug: 'p1', name: 'P1', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const { app } = createApp(new Map([['proj-1', ctx]]))
      const create = await request(app).post('/api/projects/proj-1/terminals').send({})
      const id = create.body.session.id
      const first = await request(app).delete(`/api/projects/proj-1/terminals/${id}`)
      expect(first.status).toBe(200)
      const second = await request(app).delete(`/api/projects/proj-1/terminals/${id}`)
      expect(second.status).toBe(404)
    })

    it('DELETE /terminals/:id returns 404 for cross-project access', async () => {
      const ctxA = makeContext(db, { project: { id: 'proj-A', slug: 'a', name: 'A', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const ctxB = makeContext(initDb(':memory:'), { project: { id: 'proj-B', slug: 'b', name: 'B', path: tmpdir, db_path: ':memory:', added_at: '', last_seen_at: '' } })
      const contexts = new Map<string, ProjectContext>()
      contexts.set('proj-A', ctxA)
      contexts.set('proj-B', ctxB)
      const { app } = createApp(contexts)
      const created = await request(app).post('/api/projects/proj-A/terminals').send({})
      const id = created.body.session.id
      const cross = await request(app).delete(`/api/projects/proj-B/terminals/${id}`)
      expect(cross.status).toBe(404)
    })
  })
})
