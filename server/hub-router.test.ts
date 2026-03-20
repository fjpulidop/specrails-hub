import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'path'
import fs from 'fs'

import { createHubRouter } from './hub-router'
import { initHubDb, addProject, removeProject as removeProjectFromHub, getHubSetting, setHubSetting, addAgent, getAgent } from './hub-db'
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
        setupManager: {} as any,
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
        setupManager: {} as any,
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

  // ─── GET /search ────────────────────────────────────────────────────────────

  describe('GET /api/hub/search', () => {
    it('returns empty result for missing query', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/search')
      expect(res.status).toBe(200)
      expect(res.body.groups).toEqual([])
      expect(res.body.total).toBe(0)
    })

    it('returns 400 for single-char query', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/hub/search?q=x')
      expect(res.status).toBe(400)
    })

    it('finds jobs matching the query', async () => {
      const { app, contexts } = createApp()
      const db = initDb(':memory:')
      const today = new Date().toISOString().slice(0, 10)
      db.prepare(`
        INSERT INTO jobs (id, command, started_at, status)
        VALUES ('j1', 'sr:implement', ?, 'completed')
      `).run(`${today}T10:00:00.000Z`)

      contexts.set('p1', {
        project: { id: 'p1', name: 'MyProject', slug: 'my', path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
        db,
        queueManager: {} as any, chatManager: {} as any, setupManager: {} as any, proposalManager: {} as any, broadcast: vi.fn(),
      })

      const res = await request(app).get('/api/hub/search?q=implement')
      expect(res.status).toBe(200)
      expect(res.body.total).toBeGreaterThan(0)
      expect(res.body.groups[0].projectName).toBe('MyProject')
      expect(res.body.groups[0].jobs).toHaveLength(1)
    })

    it('returns no groups when nothing matches', async () => {
      const { app, contexts } = createApp()
      const db = initDb(':memory:')
      const today = new Date().toISOString().slice(0, 10)
      db.prepare(`
        INSERT INTO jobs (id, command, started_at, status)
        VALUES ('j1', 'implement', ?, 'completed')
      `).run(`${today}T10:00:00.000Z`)

      contexts.set('p1', {
        project: { id: 'p1', name: 'P', slug: 'p', path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
        db,
        queueManager: {} as any, chatManager: {} as any, setupManager: {} as any, proposalManager: {} as any, broadcast: vi.fn(),
      })

      const res = await request(app).get('/api/hub/search?q=zzzNOTHING')
      expect(res.status).toBe(200)
      expect(res.body.groups).toHaveLength(0)
      expect(res.body.total).toBe(0)
    })
  })
})
