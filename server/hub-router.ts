import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import type { WsMessage } from './types'
import type { ProjectRegistry } from './project-registry'
import { getHubSetting, setHubSetting, listProjects, listAgents, getAgent, addAgent, updateAgent } from './hub-db'
import { createSpecrailsTechClient } from './specrails-tech-client'
import { checkCoreCompat } from './core-compat'
import { getHubAnalytics, getHubTodayStats } from './hub-analytics'
import type { AnalyticsOpts, AnalyticsPeriod } from './types'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function deriveProjectName(projectPath: string): string {
  return path.basename(projectPath)
}

function hasSpecrails(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.claude', 'commands', 'sr'))
}

export function createHubRouter(
  registry: ProjectRegistry,
  broadcast: (msg: WsMessage) => void
): Router {
  const router = Router()

  // GET /api/hub/projects — list all registered projects
  router.get('/projects', (_req, res) => {
    const projects = listProjects(registry.hubDb)
    res.json({ projects })
  })

  // POST /api/hub/projects — register a new project by path
  router.post('/projects', (req, res) => {
    const { path: projectPath, name } = req.body ?? {}
    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ error: 'path is required' })
      return
    }

    const resolvedPath = path.resolve(projectPath)

    // Validate path exists
    if (!fs.existsSync(resolvedPath)) {
      res.status(400).json({ error: `Path does not exist: ${resolvedPath}` })
      return
    }

    const derivedName = (name && typeof name === 'string' && name.trim())
      ? name.trim()
      : deriveProjectName(resolvedPath)
    const slug = slugify(derivedName)
    const id = crypto.randomUUID()
    const specrailsInstalled = hasSpecrails(resolvedPath)

    try {
      const ctx = registry.addProject({ id, slug, name: derivedName, path: resolvedPath })
      broadcast({
        type: 'hub.project_added',
        project: ctx.project,
        timestamp: new Date().toISOString(),
      })
      res.status(201).json({ project: ctx.project, has_specrails: specrailsInstalled })
    } catch (err) {
      const message = (err as Error).message ?? ''
      // SQLite UNIQUE constraint violation means path or slug already registered
      if (message.includes('UNIQUE')) {
        res.status(409).json({ error: 'A project with this path is already registered' })
      } else {
        console.error('[hub] add project error:', err)
        res.status(500).json({ error: 'Failed to register project' })
      }
    }
  })

  // DELETE /api/hub/projects/:id — unregister a project
  router.delete('/projects/:id', (req, res) => {
    const { id } = req.params
    const ctx = registry.getContext(id)
    if (!ctx) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    registry.removeProject(id)
    broadcast({
      type: 'hub.project_removed',
      projectId: id,
      timestamp: new Date().toISOString(),
    })
    res.json({ ok: true })
  })

  // GET /api/hub/state — hub-level state summary
  router.get('/state', (_req, res) => {
    const projects = listProjects(registry.hubDb)
    const todayStats = getHubTodayStats(registry)
    res.json({
      projects,
      projectCount: projects.length,
      ...todayStats,
    })
  })

  // GET /api/hub/analytics?period= — cross-project aggregated analytics
  router.get('/analytics', (req, res) => {
    const period = (req.query.period as AnalyticsPeriod | undefined) ?? '7d'
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    const opts: AnalyticsOpts = { period, from, to }
    const result = getHubAnalytics(registry, opts)
    res.json(result)
  })

  // GET /api/hub/resolve?path=<cwd> — resolve a project from a filesystem path
  router.get('/resolve', (req, res) => {
    const queryPath = req.query.path as string | undefined
    if (!queryPath) {
      res.status(400).json({ error: 'path query parameter is required' })
      return
    }

    const resolvedPath = path.resolve(queryPath)
    const ctx = registry.getContextByPath(resolvedPath)
    if (!ctx) {
      res.status(404).json({ error: 'No project registered for this path' })
      return
    }

    registry.touchProject(ctx.project.id)
    res.json({ project: ctx.project })
  })

  // GET /api/hub/settings — get hub-level settings
  router.get('/settings', (_req, res) => {
    const port = getHubSetting(registry.hubDb, 'port') ?? '4200'
    const specrailsTechUrl =
      getHubSetting(registry.hubDb, 'specrails_tech_url') ??
      process.env.SPECRAILS_TECH_URL ??
      'http://localhost:3000'
    res.json({ port: parseInt(port, 10), specrailsTechUrl })
  })

  // PUT /api/hub/settings — update hub-level settings
  router.put('/settings', (req, res) => {
    const { port, specrailsTechUrl } = req.body ?? {}
    if (port !== undefined) {
      setHubSetting(registry.hubDb, 'port', String(port))
    }
    if (specrailsTechUrl !== undefined && typeof specrailsTechUrl === 'string') {
      setHubSetting(registry.hubDb, 'specrails_tech_url', specrailsTechUrl.trim())
    }
    res.json({ ok: true })
  })

  // ─── Agent routes ────────────────────────────────────────────────────────────

  // GET /api/hub/agents — list all registered agents
  router.get('/agents', (_req, res) => {
    res.json({ agents: listAgents(registry.hubDb) })
  })

  // GET /api/hub/agents/:id — get agent by ID
  router.get('/agents/:id', (req, res) => {
    const agent = getAgent(registry.hubDb, req.params.id)
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    res.json({ agent })
  })

  // POST /api/hub/agents — register a new agent
  router.post('/agents', (req, res) => {
    const { slug, name, role, config } = req.body ?? {}
    if (!slug || typeof slug !== 'string') {
      res.status(400).json({ error: 'slug is required' })
      return
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const id = crypto.randomUUID()
    try {
      const agent = addAgent(registry.hubDb, { id, slug, name, role, config })
      res.status(201).json({ agent })
    } catch (err) {
      const message = (err as Error).message ?? ''
      if (message.includes('UNIQUE')) {
        res.status(409).json({ error: 'An agent with this slug already exists' })
      } else {
        console.error('[hub] add agent error:', err)
        res.status(500).json({ error: 'Failed to register agent' })
      }
    }
  })

  // PATCH /api/hub/agents/:id — update agent fields
  router.patch('/agents/:id', (req, res) => {
    const agent = getAgent(registry.hubDb, req.params.id)
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    const { name, role, status, current_job_id, last_heartbeat_at, config } = req.body ?? {}
    const updates: Parameters<typeof updateAgent>[2] = {}
    if (name !== undefined) updates.name = name
    if (role !== undefined) updates.role = role
    if (status !== undefined) updates.status = status
    if (current_job_id !== undefined) updates.current_job_id = current_job_id
    if (last_heartbeat_at !== undefined) updates.last_heartbeat_at = last_heartbeat_at
    if (config !== undefined) updates.config = config
    const updated = updateAgent(registry.hubDb, req.params.id, updates)
    res.json({ agent: updated })
  })

  // GET /api/hub/core-compat — compatibility status between hub and specrails-core
  router.get('/core-compat', async (_req, res) => {
    const result = await checkCoreCompat()
    res.json(result)
  })


  // ─── specrails-tech proxy routes ────────────────────────────────────────────

  function getSpecrailsTechClient() {
    const url =
      getHubSetting(registry.hubDb, 'specrails_tech_url') ??
      process.env.SPECRAILS_TECH_URL ??
      'http://localhost:3000'
    return createSpecrailsTechClient(url)
  }

  // GET /api/hub/specrails-tech/status — health + connected flag
  router.get('/specrails-tech/status', async (_req, res) => {
    const client = getSpecrailsTechClient()
    const result = await client.health()
    if (!result.connected) {
      res.json({ connected: false, error: result.error })
      return
    }
    res.json({ connected: true, data: result.data })
  })

  // GET /api/hub/specrails-tech/agents — list agents
  router.get('/specrails-tech/agents', async (_req, res) => {
    const client = getSpecrailsTechClient()
    const result = await client.listAgents()
    if (!result.connected) {
      res.json({ connected: false, error: result.error, data: [] })
      return
    }
    res.json({ connected: true, data: result.data })
  })

  // GET /api/hub/specrails-tech/agents/:slug — agent detail
  router.get('/specrails-tech/agents/:slug', async (req, res) => {
    const client = getSpecrailsTechClient()
    const result = await client.getAgent(req.params.slug)
    if (!result.connected) {
      res.status(503).json({ connected: false, error: result.error })
      return
    }
    res.json({ connected: true, data: result.data })
  })

  // GET /api/hub/specrails-tech/docs — list docs
  router.get('/specrails-tech/docs', async (_req, res) => {
    const client = getSpecrailsTechClient()
    const result = await client.listDocs()
    if (!result.connected) {
      res.json({ connected: false, error: result.error, data: [] })
      return
    }
    res.json({ connected: true, data: result.data })
  })

  // GET /api/hub/specrails-tech/docs/:page — doc page detail
  router.get('/specrails-tech/docs/:page', async (req, res) => {
    const client = getSpecrailsTechClient()
    const result = await client.getDoc(req.params.page)
    if (!result.connected) {
      res.status(503).json({ connected: false, error: result.error })
      return
    }
    res.json({ connected: true, data: result.data })
  })

  return router
}
