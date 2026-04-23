import fs from 'fs'
import path from 'path'
import { Router, Request, Response } from 'express'
import type { ProjectContext } from './project-registry'
import {
  createProfile,
  deleteProfile,
  duplicateProfile,
  getProfile,
  getUserPreferred,
  listProfiles,
  renameProfile,
  resolveProfile,
  setUserPreferred,
  updateProfile,
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileValidationError,
  type Profile,
} from './profile-manager'

// Request augmentation declared in project-router.ts
declare module 'express-serve-static-core' {
  interface Request {
    projectCtx?: ProjectContext
  }
}

const AGENTS_SECTION_ENABLED = process.env.SPECRAILS_AGENTS_SECTION !== 'false'

function handleError(res: Response, err: unknown): void {
  if (err instanceof ProfileValidationError) {
    res.status(400).json({ error: err.message, details: err.errors })
    return
  }
  if (err instanceof ProfileConflictError) {
    res.status(409).json({ error: err.message })
    return
  }
  if (err instanceof ProfileNotFoundError) {
    res.status(404).json({ error: err.message })
    return
  }
  const message = err instanceof Error ? err.message : 'unknown error'
  res.status(500).json({ error: message })
}

export function createProfilesRouter(): Router {
  const router = Router({ mergeParams: true })

  function ctx(req: Request): ProjectContext {
    return req.projectCtx!
  }

  // Feature-flag gate
  router.use((_req, res, next) => {
    if (!AGENTS_SECTION_ENABLED) {
      res.status(404).json({ error: 'Agents section disabled on this server' })
      return
    }
    next()
  })

  // GET /api/projects/:projectId/profiles/core-version
  // Report the project's installed specrails-core version for the upgrade banner.
  router.get('/core-version', (req, res) => {
    try {
      const { project } = ctx(req)
      const candidates = [
        path.join(project.path, '.specrails', 'specrails-version'),
        path.join(project.path, '.specrails-version'),
      ]
      let version: string | null = null
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            version = fs.readFileSync(p, 'utf8').trim()
          } catch {
            // ignore
          }
          if (version) break
        }
      }
      // Minimum version required for profile-aware implement
      const REQUIRED = '4.1.0'
      let profileAware = false
      if (version) {
        const [ma, mi, pa] = version.split('.').map((n) => parseInt(n, 10))
        const [rma, rmi, rpa] = REQUIRED.split('.').map((n) => parseInt(n, 10))
        if (!isNaN(ma) && !isNaN(mi) && !isNaN(pa)) {
          profileAware =
            ma > rma ||
            (ma === rma && mi > rmi) ||
            (ma === rma && mi === rmi && pa >= rpa)
        }
      }
      res.json({ version, required: REQUIRED, profileAware })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles/catalog
  // List all agents available in .claude/agents/ (upstream sr-* and custom custom-*)
  router.get('/catalog', (req, res) => {
    try {
      const { project } = ctx(req)
      const dir = path.join(project.path, '.claude', 'agents')
      if (!fs.existsSync(dir)) {
        res.json({ agents: [] })
        return
      }
      const agents: Array<{
        id: string
        kind: 'upstream' | 'custom'
        description?: string
        model?: string
      }> = []
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.md')) continue
        const id = file.slice(0, -'.md'.length)
        const kind: 'upstream' | 'custom' | null = id.startsWith('sr-')
          ? 'upstream'
          : id.startsWith('custom-')
            ? 'custom'
            : null
        if (!kind) continue
        let description: string | undefined
        let model: string | undefined
        try {
          const body = fs.readFileSync(path.join(dir, file), 'utf8')
          const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
          if (fm) {
            const descMatch = fm[1].match(/^description:\s*"([^"]*)"|^description:\s*(.+)$/m)
            if (descMatch) description = (descMatch[1] ?? descMatch[2] ?? '').trim()
            const modelMatch = fm[1].match(/^model:\s*(\S+)/m)
            if (modelMatch) model = modelMatch[1]
          }
        } catch {
          // ignore unreadable files
        }
        agents.push({ id, kind, description, model })
      }
      agents.sort((a, b) => a.id.localeCompare(b.id))
      res.json({ agents })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles/catalog/:agentId
  // Return the full .md body of a single agent file (read-only)
  router.get('/catalog/:agentId', (req, res) => {
    try {
      const { project } = ctx(req)
      const agentId = req.params.agentId
      if (!/^(sr|custom)-[a-z0-9][a-z0-9-]*$/.test(agentId)) {
        res.status(400).json({ error: 'invalid agent id' })
        return
      }
      const file = path.join(project.path, '.claude', 'agents', `${agentId}.md`)
      if (!fs.existsSync(file)) {
        res.status(404).json({ error: 'agent not found' })
        return
      }
      const body = fs.readFileSync(file, 'utf8')
      res.json({ id: agentId, body })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles
  router.get('/', (req, res) => {
    try {
      const { project } = ctx(req)
      res.json({ profiles: listProfiles(project.path) })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles/active
  router.get('/active', (req, res) => {
    try {
      const { project } = ctx(req)
      res.json({ preferred: getUserPreferred(project.path) })
    } catch (err) {
      handleError(res, err)
    }
  })

  // PUT /api/projects/:projectId/profiles/active
  router.put('/active', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      const name = (req.body?.profile ?? '').toString()
      if (!name) {
        res.status(400).json({ error: "body field 'profile' is required" })
        return
      }
      // Validate that the profile exists before setting preference.
      getProfile(project.path, name)
      setUserPreferred(project.path, name)
      broadcast({ type: 'profile.changed', projectId: project.id, name } as never)
      res.json({ ok: true })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles/resolve?profile=<name>
  router.get('/resolve', (req, res) => {
    try {
      const { project } = ctx(req)
      const explicit = typeof req.query.profile === 'string' ? req.query.profile : undefined
      const resolved = resolveProfile(project.path, explicit)
      if (!resolved) {
        res.json({ resolved: null })
        return
      }
      res.json({ resolved: { name: resolved.name, profile: resolved.profile } })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /api/projects/:projectId/profiles
  router.post('/', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      const body = req.body as Profile
      createProfile(project.path, body)
      broadcast({ type: 'profile.changed', projectId: project.id, name: body.name } as never)
      res.status(201).json({ profile: body })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /api/projects/:projectId/profiles/:name/duplicate
  router.post('/:name/duplicate', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      const newName = (req.body?.name ?? '').toString()
      if (!newName) {
        res.status(400).json({ error: "body field 'name' is required" })
        return
      }
      const copy = duplicateProfile(project.path, req.params.name, newName)
      broadcast({ type: 'profile.changed', projectId: project.id, name: newName } as never)
      res.status(201).json({ profile: copy })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /api/projects/:projectId/profiles/:name/rename
  router.post('/:name/rename', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      const newName = (req.body?.name ?? '').toString()
      if (!newName) {
        res.status(400).json({ error: "body field 'name' is required" })
        return
      }
      const renamed = renameProfile(project.path, req.params.name, newName)
      broadcast({ type: 'profile.changed', projectId: project.id, name: newName } as never)
      res.json({ profile: renamed })
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /api/projects/:projectId/profiles/:name
  router.get('/:name', (req, res) => {
    try {
      const { project } = ctx(req)
      res.json({ profile: getProfile(project.path, req.params.name) })
    } catch (err) {
      handleError(res, err)
    }
  })

  // PATCH /api/projects/:projectId/profiles/:name
  router.patch('/:name', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      const body = req.body as Profile
      if (body.name !== req.params.name) {
        res.status(400).json({ error: "body.name must match path parameter (use /rename to change name)" })
        return
      }
      updateProfile(project.path, body)
      broadcast({ type: 'profile.changed', projectId: project.id, name: body.name } as never)
      res.json({ profile: body })
    } catch (err) {
      handleError(res, err)
    }
  })

  // DELETE /api/projects/:projectId/profiles/:name
  router.delete('/:name', (req, res) => {
    try {
      const { project, broadcast } = ctx(req)
      deleteProfile(project.path, req.params.name)
      broadcast({ type: 'profile.changed', projectId: project.id, name: req.params.name, deleted: true } as never)
      res.json({ ok: true })
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
