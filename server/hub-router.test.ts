import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'path'
import fs from 'fs'

import { createHubRouter } from './hub-router'
import { initHubDb, addProject, removeProject as removeProjectFromHub, getHubSetting, setHubSetting } from './hub-db'
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
})
