import { Router, Request, Response } from 'express'
import type { ProjectContext } from './project-registry'
import { getConnectionPublic } from './jira/jira-db'
import { isJiraEnabled } from './feature-flags'
import type { OutboxState, SpecLogicalState } from './jira/types'

// req.projectCtx is declared in project-router / rails-router.

/**
 * Per-project Jira router, mounted at /api/projects/:projectId/jira. Gated by
 * SPECRAILS_JIRA_SECTION; 404s entirely when the flag is off. Endpoints back the
 * step-by-step setup wizard (test → pick project → optional status map → connect)
 * and the sync/outbox management surfaces. The token is never returned to the
 * client (connection responses carry `hasToken` only).
 */
export function createJiraRouter(): Router {
  const router = Router({ mergeParams: true })

  function ctx(req: Request): ProjectContext {
    return req.projectCtx!
  }

  // Feature-flag gate for every route under /jira.
  router.use((_req: Request, res: Response, next) => {
    if (!isJiraEnabled()) {
      res.status(404).json({ error: 'Jira integration disabled' })
      return
    }
    next()
  })

  // ─── Connection ──────────────────────────────────────────────────────────────

  // GET /connection — current connection (token redacted) or { connected: false }.
  router.get('/connection', (req: Request, res: Response) => {
    const c = ctx(req)
    const conn = getConnectionPublic(c.db, c.project.id)
    if (!conn) {
      res.json({ connected: false })
      return
    }
    res.json({ connected: true, connection: conn, outbox: c.jiraSyncManager.outboxCounts() })
  })

  // POST /test — wizard step 1: validate credentials without saving.
  router.post('/test', async (req: Request, res: Response) => {
    const { baseUrl, accountEmail, token } = req.body ?? {}
    if (!isNonEmptyString(baseUrl) || !isNonEmptyString(token)) {
      res.status(400).json({ error: 'baseUrl and token are required' })
      return
    }
    const result = await ctx(req).jiraSyncManager.probeCredentials({
      baseUrl: baseUrl.trim(),
      accountEmail: isNonEmptyString(accountEmail) ? accountEmail.trim() : null,
      token,
    })
    if (!result.ok) {
      res.status(result.status === 401 ? 401 : 400).json({ error: result.error })
      return
    }
    res.json(result)
  })

  // POST /discover-projects — wizard step 2: list visible projects.
  router.post('/discover-projects', async (req: Request, res: Response) => {
    const { baseUrl, accountEmail, token, query } = req.body ?? {}
    if (!isNonEmptyString(baseUrl) || !isNonEmptyString(token)) {
      res.status(400).json({ error: 'baseUrl and token are required' })
      return
    }
    const result = await ctx(req).jiraSyncManager.discoverProjects({
      baseUrl: baseUrl.trim(),
      accountEmail: isNonEmptyString(accountEmail) ? accountEmail.trim() : null,
      token,
      query: isNonEmptyString(query) ? query.trim() : undefined,
    })
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ projects: result.projects })
  })

  // POST /discover-statuses — wizard step 3 (optional): the project's statuses.
  router.post('/discover-statuses', async (req: Request, res: Response) => {
    const { baseUrl, accountEmail, token, projectKey } = req.body ?? {}
    if (!isNonEmptyString(baseUrl) || !isNonEmptyString(token) || !isNonEmptyString(projectKey)) {
      res.status(400).json({ error: 'baseUrl, token and projectKey are required' })
      return
    }
    const result = await ctx(req).jiraSyncManager.discoverStatuses({
      baseUrl: baseUrl.trim(),
      accountEmail: isNonEmptyString(accountEmail) ? accountEmail.trim() : null,
      token,
      projectKey: projectKey.trim(),
    })
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ statuses: result.statuses })
  })

  // POST /connect — wizard final step: validate + persist + start sync.
  router.post('/connect', async (req: Request, res: Response) => {
    const c = ctx(req)
    const { baseUrl, accountEmail, token, jiraProjectKey, statusMap } = req.body ?? {}
    if (!isNonEmptyString(baseUrl) || !isNonEmptyString(token) || !isNonEmptyString(jiraProjectKey)) {
      res.status(400).json({ error: 'baseUrl, token and jiraProjectKey are required' })
      return
    }
    const cleanMap = sanitizeStatusMap(statusMap)
    const result = await c.jiraSyncManager.connect({
      baseUrl: baseUrl.trim(),
      accountEmail: isNonEmptyString(accountEmail) ? accountEmail.trim() : null,
      token,
      jiraProjectKey: jiraProjectKey.trim(),
      statusMap: cleanMap,
    })
    if (!result.ok) {
      res.status(result.status === 401 ? 401 : 400).json({ error: result.error })
      return
    }
    res.status(201).json({ connection: getConnectionPublic(c.db, c.project.id) })
  })

  // PATCH /connection — toggle enabled (hot-swap local↔Jira) or update status map.
  router.patch('/connection', (req: Request, res: Response) => {
    const c = ctx(req)
    const existing = getConnectionPublic(c.db, c.project.id)
    if (!existing) {
      res.status(404).json({ error: 'No Jira connection configured' })
      return
    }
    const { enabled } = req.body ?? {}
    if (typeof enabled === 'boolean') {
      c.jiraSyncManager.setEnabled(enabled)
    }
    res.json({ connection: getConnectionPublic(c.db, c.project.id) })
  })

  // DELETE /connection — remove the connection + restore local backlog config.
  router.delete('/connection', (req: Request, res: Response) => {
    const c = ctx(req)
    c.jiraSyncManager.disconnect()
    res.json({ connected: false })
  })

  // POST /resume — re-paste of a fresh token after a 401: drain the parked outbox.
  router.post('/resume', (req: Request, res: Response) => {
    ctx(req).jiraSyncManager.resumeAfterReauth()
    res.json({ ok: true })
  })

  // ─── Sync + outbox management ───────────────────────────────────────────────

  // POST /sync — trigger an immediate inbound poll.
  router.post('/sync', async (req: Request, res: Response) => {
    const result = await ctx(req).jiraSyncManager.pollOnce()
    res.json({ ok: true, upserted: result?.upserted ?? 0 })
  })

  // GET /outbox?state= — list outbox ops (defaults to all).
  router.get('/outbox', (req: Request, res: Response) => {
    const c = ctx(req)
    const state = req.query.state as string | undefined
    const valid: OutboxState[] = ['pending', 'inflight', 'done', 'dead']
    const filter = valid.includes(state as OutboxState) ? (state as OutboxState) : undefined
    res.json({ ops: c.jiraSyncManager.listOutbox(filter), counts: c.jiraSyncManager.outboxCounts() })
  })

  // POST /outbox/:id/retry — re-queue a dead-lettered op for a manual retry.
  router.post('/outbox/:id/retry', async (req: Request, res: Response) => {
    const c = ctx(req)
    const id = parseInt(req.params.id as string, 10)
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid op id' })
      return
    }
    const { retryDeadOutbox } = await import('./jira/jira-db')
    const ok = retryDeadOutbox(c.db, id)
    if (!ok) {
      res.status(404).json({ error: 'Op not found or not in dead state' })
      return
    }
    void c.jiraSyncManager.drainOnce().catch(() => undefined)
    res.json({ ok: true })
  })

  // POST /specs — Add Spec when the project source is Jira: create the issue in
  // Jira and materialize it locally. Keeps the generic local ticket-create path
  // untouched.
  router.post('/specs', async (req: Request, res: Response) => {
    const c = ctx(req)
    const { title, description, labels, priority, issueType } = req.body ?? {}
    if (!isNonEmptyString(title)) {
      res.status(400).json({ error: 'title is required' })
      return
    }
    const result = await c.jiraSyncManager.createSpec({
      title: title.trim(),
      description: isNonEmptyString(description) ? description : undefined,
      labels: Array.isArray(labels) ? labels.filter((l) => typeof l === 'string') : undefined,
      priority: isNonEmptyString(priority) ? priority : undefined,
      issueType: isNonEmptyString(issueType) ? issueType : undefined,
    })
    if (!result.ok) {
      res.status(result.status === 401 ? 401 : 400).json({ error: result.error })
      return
    }
    res.status(201).json({ localId: result.localId, jiraKey: result.jiraKey })
  })

  // GET /links — the spec↔issue map (for the badge / diagnostics).
  router.get('/links', (req: Request, res: Response) => {
    res.json({ links: ctx(req).jiraSyncManager.listLinks() })
  })

  return router
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function sanitizeStatusMap(raw: unknown): Partial<Record<SpecLogicalState, string>> | null {
  if (!raw || typeof raw !== 'object') return null
  const states: SpecLogicalState[] = ['todo', 'in_progress', 'done', 'cancelled']
  const out: Partial<Record<SpecLogicalState, string>> = {}
  for (const s of states) {
    const v = (raw as Record<string, unknown>)[s]
    if (typeof v === 'string' && v.trim()) out[s] = v.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}
