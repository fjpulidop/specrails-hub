import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'path'
import fs from 'fs'

vi.mock('./core-compat', async (importActual) => {
  const actual = await importActual<typeof import('./core-compat')>()
  return {
    ...actual,
    checkCoreCompat: vi.fn().mockResolvedValue({ compatible: true, contractFound: false }),
    getCLIStatus: vi.fn().mockReturnValue({ provider: 'claude', version: '1.2.3' }),
    detectAvailableCLIs: vi.fn().mockReturnValue({ claude: true, codex: false }),
  }
})

const mockSpecrailsTechClient = {
  health: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  listDocs: vi.fn(),
  getDoc: vi.fn(),
}

vi.mock('./specrails-tech-client', () => ({
  createSpecrailsTechClient: vi.fn(() => mockSpecrailsTechClient),
}))

import { createHubRouter } from './hub-router'
import { initHubDb, addProject, removeProject as removeProjectFromHub, getHubSetting, setHubSetting, addAgent, getAgent, addWebhook } from './hub-db'
import { initDb } from './db'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import type { WsMessage } from './types'
import type { DbInstance } from './db'

function createMockRegistry(hubDb: DbInstance) {
  const contexts = new Map<string, any>()

  const registry = {
    hubDb,
    getContext: vi.fn((id: string) => contexts.get(id)),
    getContextByPath: vi.fn((projectPath: string) => {
      for (const ctx of contexts.values()) {
        if (ctx.project.path === projectPath) return ctx
      }
      return undefined
    }),
    addProject: vi.fn((opts: { id: string; slug: string; name: string; path: string }) => {
      const row = addProject(hubDb, opts)
      const ctx = {
        project: row,
        db: {} as any,
        queueManager: {} as any,
        chatManager: {} as any,
        setupManager: { isInstalling: vi.fn(() => false), isSettingUp: vi.fn(() => false) } as any,
        proposalManager: {} as any,
        broadcast: vi.fn(),
      }
      contexts.set(opts.id, ctx)
      return ctx
    }),
    removeProject: vi.fn((id: string) => {
      contexts.delete(id)
      removeProjectFromHub(hubDb, id)
    }),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => Array.from(contexts.values())),
  } as unknown as ProjectRegistry

  return { registry, contexts }
}

describe('hub-router', () => {
  let hubDb: DbInstance
  let existsSyncSpy: any

  beforeEach(() => {
    vi.restoreAllMocks()
    hubDb = initHubDb(':memory:')
    // Spy on fs.existsSync so the router's `fs.existsSync(resolvedPath)` is intercepted
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  function createApp() {
    const { registry, contexts } = createMockRegistry(hubDb)
    const broadcast = vi.fn()
    const router = createHubRouter(registry, broadcast)
    const app = express()
    app.use(express.json())
    app.use('/api/hub', router)
    return { app, registry, broadcast, contexts }
  }

  // ─── GET /projects ──────────────────────────────────────────────────────────

  describe('GET /api/hub/projects', () => {
    it('returns empty projects list', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/projects')
      expect(res.status).toBe(200)
      expect(res.body.projects).toEqual([])
      expect(res.body.setupProjectIds).toEqual([])
    })

    it('returns registered projects', async () => {
      addProject(hubDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/projects')
      expect(res.status).toBe(200)
      expect(res.body.projects).toHaveLength(1)
      expect(res.body.projects[0].slug).toBe('proj-1')
    })
  })

  // ─── POST /projects ────────────────────────────────────────────────────────

  describe('POST /api/hub/projects', () => {
    it('returns 400 when path is missing', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('path is required')
    })

    it('returns 400 when path is not a string', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({ path: 123 })
      expect(res.status).toBe(400)
    })

    it('returns 400 when path does not exist on filesystem', async () => {
      existsSyncSpy.mockReturnValue(false)
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({ path: '/nonexistent' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('does not exist')
    })

    it('creates project with derived name from path', async () => {
      const { app, broadcast } = createApp()
      const res = await request(app).post('/api/hub/projects').send({ path: '/home/user/my-project' })
      expect(res.status).toBe(201)
      expect(res.body.project).toBeDefined()
      expect(res.body.project.name).toBe('my-project')
      expect(broadcast).toHaveBeenCalled()
    })

    it('creates project with custom name', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({
        path: '/home/user/my-project',
        name: 'Custom Name',
      })
      expect(res.status).toBe(201)
      expect(res.body.project.name).toBe('Custom Name')
    })

    it('returns 409 when path is already registered', async () => {
      const { app } = createApp()
      await request(app).post('/api/hub/projects').send({ path: '/home/user/my-project' })
      const res = await request(app).post('/api/hub/projects').send({ path: '/home/user/my-project' })
      expect(res.status).toBe(409)
    })

    it('includes has_specrails in response', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({ path: '/home/user/proj' })
      expect(res.status).toBe(201)
      expect(res.body.has_specrails).toBeDefined()
    })

    it('broadcasts hub.project_added on success', async () => {
      const { app, broadcast } = createApp()
      await request(app).post('/api/hub/projects').send({ path: '/home/user/proj' })

      const addMsgs = broadcast.mock.calls
        .map((c: any) => c[0])
        .filter((m: any) => m.type === 'hub.project_added')
      expect(addMsgs).toHaveLength(1)
      expect(addMsgs[0].project).toBeDefined()
    })
  })

  // ─── DELETE /projects/:id ──────────────────────────────────────────────────

  describe('DELETE /api/hub/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const { app } = createApp()
      const res = await request(app).delete('/api/hub/projects/nonexistent')
      expect(res.status).toBe(404)
    })

    it('removes project and broadcasts hub.project_removed', async () => {
      const { app, broadcast } = createApp()
      const createRes = await request(app).post('/api/hub/projects').send({ path: '/home/user/proj' })
      const id = createRes.body.project.id

      const res = await request(app).delete(`/api/hub/projects/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      const removeMsgs = broadcast.mock.calls
        .map((c: any) => c[0])
        .filter((m: any) => m.type === 'hub.project_removed')
      expect(removeMsgs).toHaveLength(1)
      expect(removeMsgs[0].projectId).toBe(id)
    })
  })

  // ─── GET /state ─────────────────────────────────────────────────────────────

  describe('GET /api/hub/state', () => {
    it('returns state with project count', async () => {
      addProject(hubDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/state')
      expect(res.status).toBe(200)
      expect(res.body.projectCount).toBe(1)
      expect(res.body.projects).toHaveLength(1)
    })
  })

  // ─── GET /resolve ──────────────────────────────────────────────────────────

  describe('GET /api/hub/resolve', () => {
    it('returns 400 when path query is missing', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/resolve')
      expect(res.status).toBe(400)
    })

    it('returns 404 for unregistered path', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/resolve?path=/unknown')
      expect(res.status).toBe(404)
    })

    it('resolves registered project by path', async () => {
      const { app, registry } = createApp()
      // Create a project first
      await request(app).post('/api/hub/projects').send({ path: '/home/user/proj' })

      const res = await request(app).get('/api/hub/resolve?path=/home/user/proj')
      expect(res.status).toBe(200)
      expect(res.body.project).toBeDefined()
      expect(registry.touchProject).toHaveBeenCalled()
    })
  })

  // ─── GET /agents ────────────────────────────────────────────────────────────

  describe('GET /api/hub/agents', () => {
    it('returns empty agents list', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/agents')
      expect(res.status).toBe(200)
      expect(res.body.agents).toEqual([])
    })

    it('returns registered agents', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/agents')
      expect(res.status).toBe(200)
      expect(res.body.agents).toHaveLength(1)
      expect(res.body.agents[0].slug).toBe('my-agent')
    })
  })

  // ─── GET /agents/:id ────────────────────────────────────────────────────────

  describe('GET /api/hub/agents/:id', () => {
    it('returns 404 for non-existent agent', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/agents/nonexistent')
      expect(res.status).toBe(404)
    })

    it('returns agent by ID', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/agents/a1')
      expect(res.status).toBe(200)
      expect(res.body.agent.id).toBe('a1')
      expect(res.body.agent.status).toBe('idle')
    })
  })

  // ─── POST /agents ────────────────────────────────────────────────────────────

  describe('POST /api/hub/agents', () => {
    it('returns 400 when slug is missing', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/agents').send({ name: 'Foo' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('slug is required')
    })

    it('returns 400 when name is missing', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/agents').send({ slug: 'foo' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('name is required')
    })

    it('creates agent with required fields', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/agents').send({ slug: 'my-agent', name: 'My Agent' })
      expect(res.status).toBe(201)
      expect(res.body.agent.slug).toBe('my-agent')
      expect(res.body.agent.name).toBe('My Agent')
      expect(res.body.agent.status).toBe('idle')
    })

    it('creates agent with optional role and config', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/agents').send({
        slug: 'dev-agent',
        name: 'Dev Agent',
        role: 'developer',
        config: '{"key":"val"}',
      })
      expect(res.status).toBe(201)
      expect(res.body.agent.role).toBe('developer')
    })

    it('returns 409 when slug is already registered', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      const res = await request(app).post('/api/hub/agents').send({ slug: 'my-agent', name: 'Other' })
      expect(res.status).toBe(409)
    })
  })

  // ─── PATCH /agents/:id ──────────────────────────────────────────────────────

  describe('PATCH /api/hub/agents/:id', () => {
    it('returns 404 for non-existent agent', async () => {
      const { app } = createApp()
      const res = await request(app).patch('/api/hub/agents/missing').send({ status: 'busy' })
      expect(res.status).toBe(404)
    })

    it('updates agent status and current_job_id', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      const res = await request(app)
        .patch('/api/hub/agents/a1')
        .send({ status: 'busy', current_job_id: 'job-xyz' })
      expect(res.status).toBe(200)
      expect(res.body.agent.status).toBe('busy')
      expect(res.body.agent.current_job_id).toBe('job-xyz')
    })

    it('persists updates to the DB', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      await request(app).patch('/api/hub/agents/a1').send({ name: 'Renamed' })
      const row = getAgent(hubDb, 'a1')
      expect(row?.name).toBe('Renamed')
    })

    it('returns updated agent with no body changes', async () => {
      addAgent(hubDb, { id: 'a1', slug: 'my-agent', name: 'My Agent' })
      const { app } = createApp()
      const res = await request(app).patch('/api/hub/agents/a1').send({})
      expect(res.status).toBe(200)
      expect(res.body.agent.id).toBe('a1')
    })
  })

  // ─── GET /settings ─────────────────────────────────────────────────────────

  describe('GET /api/hub/settings', () => {
    it('returns default port 4200', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/settings')
      expect(res.status).toBe(200)
      expect(res.body.port).toBe(4200)
    })

    it('returns persisted port setting', async () => {
      setHubSetting(hubDb, 'port', '8080')
      const { app } = createApp()
      const res = await request(app).get('/api/hub/settings')
      expect(res.status).toBe(200)
      expect(res.body.port).toBe(8080)
    })
  })

  // ─── PUT /settings ─────────────────────────────────────────────────────────

  describe('PUT /api/hub/settings', () => {
    it('updates port setting', async () => {
      const { app } = createApp()
      const res = await request(app)
        .put('/api/hub/settings')
        .send({ port: 9090 })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(getHubSetting(hubDb, 'port')).toBe('9090')
    })

    it('returns ok even with empty body', async () => {
      const { app } = createApp()
      const res = await request(app).put('/api/hub/settings').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  // ─── GET /recent-jobs ───────────────────────────────────────────────────────

  describe('GET /api/hub/recent-jobs', () => {
    it('returns empty list when no projects have jobs', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/recent-jobs')
      expect(res.status).toBe(200)
      expect(res.body.jobs).toEqual([])
    })

    it('returns jobs from project contexts', async () => {
      const { app, contexts } = createApp()
      const today = new Date().toISOString().slice(0, 10)
      const db = initDb(':memory:')
      db.prepare(`
        INSERT INTO jobs (id, command, started_at, status, total_cost_usd)
        VALUES (?, 'implement', ?, 'completed', 0.01)
      `).run('job-1', `${today}T10:00:00.000Z`)

      contexts.set('p1', {
        project: { id: 'p1', name: 'TestProj', slug: 'testproj', path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
        db,
        queueManager: {} as any,
        chatManager: {} as any,
        setupManager: { isInstalling: vi.fn(() => false), isSettingUp: vi.fn(() => false) } as any,
        proposalManager: {} as any,
        broadcast: vi.fn(),
      })

      const res = await request(app).get('/api/hub/recent-jobs')
      expect(res.status).toBe(200)
      expect(res.body.jobs).toHaveLength(1)
      expect(res.body.jobs[0].projectId).toBe('p1')
      expect(res.body.jobs[0].projectName).toBe('TestProj')
    })

    it('respects limit query param', async () => {
      const { app, contexts } = createApp()
      const today = new Date().toISOString().slice(0, 10)
      const db = initDb(':memory:')
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO jobs (id, command, started_at, status)
          VALUES (?, 'implement', ?, 'completed')
        `).run(`job-${i}`, `${today}T0${i}:00:00.000Z`)
      }
      contexts.set('p1', {
        project: { id: 'p1', name: 'P', slug: 'p', path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
        db,
        queueManager: {} as any, chatManager: {} as any, setupManager: {} as any, proposalManager: {} as any, broadcast: vi.fn(),
      })

      const res = await request(app).get('/api/hub/recent-jobs?limit=3')
      expect(res.status).toBe(200)
      expect(res.body.jobs).toHaveLength(3)
    })
  })

  // ─── GET /api/hub/cli-status ────────────────────────────────────────────────

  describe('GET /api/hub/cli-status', () => {
    it('returns provider and version from getCLIStatus', async () => {
      const { app } = createApp()

      const res = await request(app).get('/api/hub/cli-status')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('claude')
      expect(res.body.version).toBe('1.2.3')
    })
  })

  // ─── GET /api/hub/available-providers ───────────────────────────────────────

  describe('GET /api/hub/available-providers', () => {
    it('returns available CLI providers (codex forced to false — coming soon)', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/available-providers')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('claude')
      expect(res.body).toHaveProperty('codex')
      expect(res.body.codex).toBe(false)
    })
  })

  // ─── POST /projects — provider validation ───────────────────────────────────

  describe('POST /api/hub/projects — provider field', () => {
    it('returns 400 for invalid provider value', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({
        path: '/home/user/proj',
        provider: 'gemini',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('provider')
    })

    it('rejects codex provider with 400 (coming soon — in lab)', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({
        path: '/home/user/proj-codex',
        provider: 'codex',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/coming soon|lab/i)
    })

    it('returns 400 when path is a system-critical directory', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/projects').send({ path: '/etc' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('system')
    })
  })

  // ─── GET /api/hub/analytics ──────────────────────────────────────────────────

  describe('GET /api/hub/analytics', () => {
    it('returns analytics data with default period', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/analytics')
      expect(res.status).toBe(200)
    })

    it('accepts period query param', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/analytics?period=30d')
      expect(res.status).toBe(200)
    })

    it('accepts from and to query params', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/analytics?period=custom&from=2026-01-01&to=2026-03-01')
      expect(res.status).toBe(200)
    })
  })

  // ─── GET /api/hub/core-compat ───────────────────────────────────────────────

  describe('GET /api/hub/core-compat', () => {
    it('returns compatibility result', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/core-compat')
      expect(res.status).toBe(200)
      expect(res.body.compatible).toBe(true)
    })
  })

  // ─── PUT /api/hub/settings — additional fields ──────────────────────────────

  describe('PUT /api/hub/settings — extended fields', () => {
    it('updates specrailsTechUrl', async () => {
      const { app } = createApp()
      const res = await request(app)
        .put('/api/hub/settings')
        .send({ specrailsTechUrl: 'http://my-specrails.internal' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(getHubSetting(hubDb, 'specrails_tech_url')).toBe('http://my-specrails.internal')
    })

    it('ignores non-string specrailsTechUrl', async () => {
      const { app } = createApp()
      const res = await request(app)
        .put('/api/hub/settings')
        .send({ specrailsTechUrl: 42 })
      expect(res.status).toBe(200)
      // Should not have been saved
      expect(getHubSetting(hubDb, 'specrails_tech_url')).toBeUndefined()
    })

    it('sets costAlertThresholdUsd', async () => {
      const { app } = createApp()
      const res = await request(app)
        .put('/api/hub/settings')
        .send({ costAlertThresholdUsd: 5.0 })
      expect(res.status).toBe(200)
      expect(getHubSetting(hubDb, 'cost_alert_threshold_usd')).toBe('5')
    })

    it('clears costAlertThresholdUsd when null', async () => {
      setHubSetting(hubDb, 'cost_alert_threshold_usd', '5')
      const { app } = createApp()
      const res = await request(app)
        .put('/api/hub/settings')
        .send({ costAlertThresholdUsd: null })
      expect(res.status).toBe(200)
      expect(getHubSetting(hubDb, 'cost_alert_threshold_usd')).toBeUndefined()
    })

    it('returns costAlertThresholdUsd from GET /settings', async () => {
      setHubSetting(hubDb, 'cost_alert_threshold_usd', '10.5')
      const { app } = createApp()
      const res = await request(app).get('/api/hub/settings')
      expect(res.status).toBe(200)
      expect(res.body.costAlertThresholdUsd).toBe(10.5)
    })

    it('returns null costAlertThresholdUsd when not set', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/settings')
      expect(res.status).toBe(200)
      expect(res.body.costAlertThresholdUsd).toBeNull()
    })
  })

  // ─── specrails-tech proxy routes ────────────────────────────────────────────

  describe('GET /api/hub/specrails-tech/status', () => {
    it('returns connected:true when service is reachable', async () => {
      mockSpecrailsTechClient.health.mockResolvedValue({ connected: true, data: { status: 'ok' } })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/status')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(true)
      expect(res.body.data.status).toBe('ok')
    })

    it('returns connected:false when service is unreachable', async () => {
      mockSpecrailsTechClient.health.mockResolvedValue({ connected: false, error: 'ECONNREFUSED' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/status')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(false)
      expect(res.body.error).toBeDefined()
    })
  })

  describe('GET /api/hub/specrails-tech/agents', () => {
    it('returns agents list when connected', async () => {
      mockSpecrailsTechClient.listAgents.mockResolvedValue({ connected: true, data: [{ slug: 'cto' }] })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/agents')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns empty data when disconnected', async () => {
      mockSpecrailsTechClient.listAgents.mockResolvedValue({ connected: false, error: 'offline' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/agents')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(false)
      expect(res.body.data).toEqual([])
    })
  })

  describe('GET /api/hub/specrails-tech/agents/:slug', () => {
    it('returns agent detail when connected', async () => {
      mockSpecrailsTechClient.getAgent.mockResolvedValue({ connected: true, data: { slug: 'cto', name: 'CTO' } })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/agents/cto')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(true)
      expect(res.body.data.slug).toBe('cto')
    })

    it('returns 503 when disconnected', async () => {
      mockSpecrailsTechClient.getAgent.mockResolvedValue({ connected: false, error: 'offline' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/agents/cto')
      expect(res.status).toBe(503)
      expect(res.body.connected).toBe(false)
    })
  })

  describe('GET /api/hub/specrails-tech/docs', () => {
    it('returns docs list when connected', async () => {
      mockSpecrailsTechClient.listDocs.mockResolvedValue({ connected: true, data: [{ page: 'intro' }] })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/docs')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns empty data when disconnected', async () => {
      mockSpecrailsTechClient.listDocs.mockResolvedValue({ connected: false, error: 'offline' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/docs')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })
  })

  describe('GET /api/hub/specrails-tech/docs/:page', () => {
    it('returns doc detail when connected', async () => {
      mockSpecrailsTechClient.getDoc.mockResolvedValue({ connected: true, data: { page: 'intro', content: '...' } })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/docs/intro')
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(true)
      expect(res.body.data.page).toBe('intro')
    })

    it('returns 503 when disconnected', async () => {
      mockSpecrailsTechClient.getDoc.mockResolvedValue({ connected: false, error: 'offline' })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/specrails-tech/docs/intro')
      expect(res.status).toBe(503)
    })
  })

  // ─── PATCH /agents/:id — extended fields ────────────────────────────────────

  describe('PATCH /api/hub/agents/:id — extended fields', () => {
    it('updates last_heartbeat_at and config', async () => {
      addAgent(hubDb, { id: 'a2', slug: 'extended-agent', name: 'Extended' })
      const { app } = createApp()
      const heartbeat = new Date().toISOString()
      const res = await request(app)
        .patch('/api/hub/agents/a2')
        .send({ last_heartbeat_at: heartbeat, config: '{"model":"claude"}' })
      expect(res.status).toBe(200)
      expect(res.body.agent.last_heartbeat_at).toBe(heartbeat)
    })
  })

  // ─── Webhook routes ──────────────────────────────────────────────────────────

  describe('GET /api/hub/webhooks', () => {
    it('returns empty list when no webhooks exist', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/webhooks')
      expect(res.status).toBe(200)
      expect(res.body.webhooks).toEqual([])
    })

    it('returns list of webhooks', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app).get('/api/hub/webhooks')
      expect(res.status).toBe(200)
      expect(res.body.webhooks).toHaveLength(1)
      expect(res.body.webhooks[0].url).toBe('https://example.com/hook')
    })
  })

  describe('POST /api/hub/webhooks', () => {
    it('returns 400 when url is missing', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/webhooks').send({ events: ['job.completed'] })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('url is required')
    })

    it('returns 400 when url is not a string', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/webhooks').send({ url: 123 })
      expect(res.status).toBe(400)
    })

    it('returns 400 when all provided events are invalid', async () => {
      const { app } = createApp()
      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook', events: ['invalid.event'] })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('valid event')
    })

    it('creates webhook with default events when events not provided', async () => {
      const { app } = createApp()
      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook' })
      expect(res.status).toBe(201)
      expect(res.body.webhook.url).toBe('https://example.com/hook')
      const events = JSON.parse(res.body.webhook.events)
      expect(events).toContain('job.completed')
      expect(events).toContain('job.failed')
    })

    it('creates webhook with custom events', async () => {
      const { app } = createApp()
      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook', events: ['job.completed', 'daily_budget_exceeded'] })
      expect(res.status).toBe(201)
      const events = JSON.parse(res.body.webhook.events)
      expect(events).toContain('job.completed')
      expect(events).toContain('daily_budget_exceeded')
    })

    it('creates webhook with secret', async () => {
      const { app } = createApp()
      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook', secret: 'mysecret' })
      expect(res.status).toBe(201)
      expect(res.body.webhook.secret).toBe('mysecret')
    })

    it('returns 400 when projectId does not match a registered project', async () => {
      const { app } = createApp()
      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook', projectId: 'nonexistent-project' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('project not found')
    })

    it('creates project-scoped webhook when projectId is valid', async () => {
      const { app } = createApp()
      const createRes = await request(app).post('/api/hub/projects').send({ path: '/home/user/myproj' })
      const projectId = createRes.body.project.id

      const res = await request(app)
        .post('/api/hub/webhooks')
        .send({ url: 'https://example.com/hook', projectId })
      expect(res.status).toBe(201)
      expect(res.body.webhook.project_id).toBe(projectId)
    })
  })

  describe('PATCH /api/hub/webhooks/:id', () => {
    it('returns 404 for non-existent webhook', async () => {
      const { app } = createApp()
      const res = await request(app).patch('/api/hub/webhooks/nonexistent').send({ enabled: false })
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Webhook not found')
    })

    it('updates webhook url', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://old.example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app)
        .patch('/api/hub/webhooks/wh-1')
        .send({ url: 'https://new.example.com/hook' })
      expect(res.status).toBe(200)
      expect(res.body.webhook.url).toBe('https://new.example.com/hook')
    })

    it('updates webhook enabled flag', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app).patch('/api/hub/webhooks/wh-1').send({ enabled: false })
      expect(res.status).toBe(200)
      expect(res.body.webhook.enabled).toBe(0)
    })

    it('updates webhook events', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app)
        .patch('/api/hub/webhooks/wh-1')
        .send({ events: ['job.failed', 'daily_budget_exceeded'] })
      expect(res.status).toBe(200)
      const events = JSON.parse(res.body.webhook.events)
      expect(events).toContain('job.failed')
    })

    it('updates webhook secret', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app).patch('/api/hub/webhooks/wh-1').send({ secret: 'new-secret' })
      expect(res.status).toBe(200)
      expect(res.body.webhook.secret).toBe('new-secret')
    })
  })

  describe('DELETE /api/hub/webhooks/:id', () => {
    it('returns 404 for non-existent webhook', async () => {
      const { app } = createApp()
      const res = await request(app).delete('/api/hub/webhooks/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Webhook not found')
    })

    it('deletes existing webhook', async () => {
      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const deleteRes = await request(app).delete('/api/hub/webhooks/wh-1')
      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.ok).toBe(true)

      const listRes = await request(app).get('/api/hub/webhooks')
      expect(listRes.body.webhooks).toHaveLength(0)
    })
  })

  describe('POST /api/hub/webhooks/:id/test', () => {
    it('returns 404 for non-existent webhook', async () => {
      const { app } = createApp()
      const res = await request(app).post('/api/hub/webhooks/nonexistent/test')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Webhook not found')
    })

    it('queues a test ping and returns ok', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      addWebhook(hubDb, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', events: ['job.completed'] })
      const { app } = createApp()
      const res = await request(app).post('/api/hub/webhooks/wh-1/test')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.message).toContain('queued')

      vi.unstubAllGlobals()
    })
  })

})
