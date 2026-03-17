import { Router, Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import type { AnalyticsOpts } from './types'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import {
  listJobs, getJob, getJobEvents, purgeJobs,
  createConversation, listConversations, getConversation,
  deleteConversation, updateConversation, getMessages,
  getStats,
  createProposal, getProposal, listProposals, deleteProposal,
} from './db'
import { ClaudeNotFoundError, JobNotFoundError, JobAlreadyTerminalError } from './queue-manager'
import { resolveCommand } from './command-resolver'
import { createHooksRouter, getPhaseStates } from './hooks'
import { getConfig, fetchIssues } from './config'
import { getAnalytics } from './analytics'
import type { ChatConversationRow } from './types'

// Extend Express Request to carry resolved ProjectContext
declare module 'express-serve-static-core' {
  interface Request {
    projectCtx?: ProjectContext
  }
}

export function createProjectRouter(registry: ProjectRegistry): Router {
  const router = Router({ mergeParams: true })

  // Middleware: resolve project from :projectId param
  router.use('/:projectId', (req: Request, res: Response, next: NextFunction) => {
    const { projectId } = req.params
    const ctx = registry.getContext(projectId)
    if (!ctx) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    registry.touchProject(projectId)
    req.projectCtx = ctx
    next()
  })

  // Helper to get ctx (always defined after middleware)
  function ctx(req: Request): ProjectContext {
    return req.projectCtx!
  }

  // ─── Hooks ──────────────────────────────────────────────────────────────────

  // Mount hooks router under each project
  router.use('/:projectId/hooks', (req: Request, res: Response, next: NextFunction) => {
    const projectCtx = ctx(req)
    const hooksRouter = createHooksRouter(
      projectCtx.broadcast,
      projectCtx.db,
      {
        get current() { return projectCtx.queueManager.getActiveJobId() },
        set current(_: string | null) { /* managed by QueueManager */ },
      }
    )
    hooksRouter(req, res, next)
  })

  // ─── Queue / Spawn routes ────────────────────────────────────────────────────

  router.post('/:projectId/spawn', (req: Request, res: Response) => {
    const { command } = req.body ?? {}
    if (!command || typeof command !== 'string' || !command.trim()) {
      res.status(400).json({ error: 'command is required' })
      return
    }
    try {
      const job = ctx(req).queueManager.enqueue(command)
      const position = job.queuePosition ?? 0
      res.status(202).json({ jobId: job.id, position })
    } catch (err) {
      if (err instanceof ClaudeNotFoundError) {
        res.status(400).json({ error: err.message })
      } else {
        console.error('[project-router] spawn error:', err)
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  })

  router.get('/:projectId/state', (req: Request, res: Response) => {
    const { queueManager, project } = ctx(req)
    res.json({
      projectName: project.name,
      projectId: project.id,
      phases: getPhaseStates(),
      busy: queueManager.getActiveJobId() !== null,
      currentJobId: queueManager.getActiveJobId(),
    })
  })

  router.delete('/:projectId/jobs/:id', (req: Request, res: Response) => {
    try {
      const result = ctx(req).queueManager.cancel(req.params.id)
      res.json({ ok: true, status: result })
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        res.status(404).json({ error: 'Job not found' })
      } else if (err instanceof JobAlreadyTerminalError) {
        res.status(409).json({ error: 'Job is already in terminal state' })
      } else {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  })

  router.post('/:projectId/queue/pause', (req: Request, res: Response) => {
    ctx(req).queueManager.pause()
    res.json({ ok: true, paused: true })
  })

  router.post('/:projectId/queue/resume', (req: Request, res: Response) => {
    ctx(req).queueManager.resume()
    res.json({ ok: true, paused: false })
  })

  router.put('/:projectId/queue/reorder', (req: Request, res: Response) => {
    const { jobIds } = req.body ?? {}
    if (!Array.isArray(jobIds)) {
      res.status(400).json({ error: 'jobIds must be an array' })
      return
    }
    try {
      ctx(req).queueManager.reorder(jobIds)
      res.json({ ok: true, queue: jobIds })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  router.get('/:projectId/queue', (req: Request, res: Response) => {
    const { queueManager } = ctx(req)
    res.json({
      jobs: queueManager.getJobs(),
      paused: queueManager.isPaused(),
      activeJobId: queueManager.getActiveJobId(),
    })
  })

  router.get('/:projectId/jobs', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200)
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0
    const status = req.query.status as string | undefined
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    const result = listJobs(ctx(req).db, { limit, offset, status, from, to })
    res.json(result)
  })

  router.get('/:projectId/jobs/:id', (req: Request, res: Response) => {
    const { db, queueManager } = ctx(req)
    const job = getJob(db, req.params.id)
    if (!job) { res.status(404).json({ error: 'Job not found' }); return }
    const events = getJobEvents(db, req.params.id)
    const phaseDefinitions = queueManager.phasesForCommand(job.command)
    res.json({ job, events, phaseDefinitions })
  })

  router.delete('/:projectId/jobs', (req: Request, res: Response) => {
    try {
      const { from, to } = req.body ?? {}
      const deleted = purgeJobs(ctx(req).db, { from, to })
      res.json({ ok: true, deleted })
    } catch (err) {
      console.error('[project-router] purge error:', err)
      res.status(500).json({ error: 'Failed to purge jobs' })
    }
  })

  router.get('/:projectId/stats', (req: Request, res: Response) => {
    res.json(getStats(ctx(req).db))
  })

  router.get('/:projectId/analytics', (req: Request, res: Response) => {
    const period = (req.query.period as string) || '7d'
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    const validPeriods = ['7d', '30d', '90d', 'all', 'custom']
    if (!validPeriods.includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be one of: 7d, 30d, 90d, all, custom' })
      return
    }
    if (period === 'custom' && (!from || !to)) {
      res.status(400).json({ error: 'from and to are required for custom period' })
      return
    }
    try {
      res.json(getAnalytics(ctx(req).db, { period: period as AnalyticsOpts['period'], from, to }))
    } catch (err) {
      console.error('[project-router] analytics error:', err)
      res.status(500).json({ error: 'Failed to compute analytics' })
    }
  })

  router.get('/:projectId/config', (req: Request, res: Response) => {
    const { project, db } = ctx(req)
    try {
      const config = getConfig(project.path, db, project.name)
      res.json(config)
    } catch (err) {
      console.error('[project-router] config error:', err)
      res.status(500).json({ error: 'Failed to read config' })
    }
  })

  router.post('/:projectId/config', (req: Request, res: Response) => {
    const { active, labelFilter } = req.body ?? {}
    const { db } = ctx(req)
    try {
      if (active !== undefined) {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.active_tracker', ?)`).run(active ?? '')
      }
      if (labelFilter !== undefined) {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.label_filter', ?)`).run(labelFilter ?? '')
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[project-router] config persist error:', err)
      res.status(500).json({ error: 'Failed to persist config' })
    }
  })

  router.get('/:projectId/issues', (req: Request, res: Response) => {
    const { project, db } = ctx(req)
    try {
      const config = getConfig(project.path, db, project.name)
      const tracker = config.issueTracker.active
      if (!tracker) {
        res.status(503).json({ error: 'No issue tracker configured', trackers: config.issueTracker })
        return
      }
      const search = req.query.search as string | undefined
      const label = req.query.label as string | undefined
      const issues = fetchIssues(tracker, { search, label, repo: config.project.repo, cwd: project.path })
      res.json(issues)
    } catch (err) {
      console.error('[project-router] issues error:', err)
      res.status(500).json({ error: 'Failed to fetch issues' })
    }
  })

  // ─── Chat routes ─────────────────────────────────────────────────────────────

  router.get('/:projectId/chat/conversations', (req: Request, res: Response) => {
    const conversations = listConversations(ctx(req).db)
    res.json({ conversations })
  })

  router.post('/:projectId/chat/conversations', (req: Request, res: Response) => {
    const { db } = ctx(req)
    const model = (req.body?.model as string | undefined) ?? 'claude-sonnet-4-5'
    const id = uuidv4()
    createConversation(db, { id, model })
    const conversation = getConversation(db, id) as ChatConversationRow
    res.status(201).json({ conversation })
  })

  router.get('/:projectId/chat/conversations/:id', (req: Request, res: Response) => {
    const { db } = ctx(req)
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const messages = getMessages(db, req.params.id)
    res.json({ conversation, messages })
  })

  router.delete('/:projectId/chat/conversations/:id', (req: Request, res: Response) => {
    const { db } = ctx(req)
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    deleteConversation(db, req.params.id)
    res.json({ ok: true })
  })

  router.patch('/:projectId/chat/conversations/:id', (req: Request, res: Response) => {
    const { db } = ctx(req)
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const { title, model } = req.body ?? {}
    const patch: { title?: string; model?: string } = {}
    if (title !== undefined) patch.title = title
    if (model !== undefined) patch.model = model
    updateConversation(db, req.params.id, patch)
    const updated = getConversation(db, req.params.id) as ChatConversationRow
    res.json({ ok: true, conversation: updated })
  })

  router.get('/:projectId/chat/conversations/:id/messages', (req: Request, res: Response) => {
    const { db } = ctx(req)
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const messages = getMessages(db, req.params.id)
    res.json({ messages })
  })

  router.post('/:projectId/chat/conversations/:id/messages', async (req: Request, res: Response) => {
    const { db, chatManager } = ctx(req)
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const text = req.body?.text as string | undefined
    if (!text || !text.trim()) { res.status(400).json({ error: 'text is required' }); return }
    if (chatManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'CONVERSATION_BUSY' }); return
    }
    res.status(202).json({ ok: true })
    chatManager.sendMessage(req.params.id, text.trim()).catch((err) => {
      console.error('[project-router] chat sendMessage error:', err)
    })
  })

  router.delete('/:projectId/chat/conversations/:id/messages/stream', (req: Request, res: Response) => {
    const { chatManager } = ctx(req)
    if (!chatManager.isActive(req.params.id)) {
      res.status(404).json({ error: 'No active stream for this conversation' }); return
    }
    chatManager.abort(req.params.id)
    res.json({ ok: true })
  })

  // ─── Setup routes ─────────────────────────────────────────────────────────────

  router.post('/:projectId/setup/install', (req: Request, res: Response) => {
    const { project, setupManager } = ctx(req)
    if (setupManager.isInstalling(project.id)) {
      res.status(409).json({ error: 'Install already in progress' }); return
    }
    res.status(202).json({ ok: true })
    setupManager.startInstall(project.id, project.path)
  })

  router.post('/:projectId/setup/start', (req: Request, res: Response) => {
    const { project, setupManager } = ctx(req)
    if (setupManager.isSettingUp(project.id)) {
      res.status(409).json({ error: 'Setup already in progress' }); return
    }
    res.status(202).json({ ok: true })
    setupManager.startSetup(project.id, project.path)
  })

  router.post('/:projectId/setup/message', (req: Request, res: Response) => {
    const { project, setupManager } = ctx(req)
    const { sessionId, message } = req.body ?? {}
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId is required' }); return
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required' }); return
    }
    if (setupManager.isSettingUp(project.id)) {
      res.status(409).json({ error: 'Setup already in progress' }); return
    }
    res.status(202).json({ ok: true })
    setupManager.resumeSetup(project.id, project.path, sessionId, message.trim())
  })

  router.get('/:projectId/setup/checkpoints', (req: Request, res: Response) => {
    const { project, setupManager } = ctx(req)
    const checkpoints = setupManager.getCheckpointStatus(project.id, project.path)
    res.json({
      checkpoints,
      isInstalling: setupManager.isInstalling(project.id),
      isSettingUp: setupManager.isSettingUp(project.id),
    })
  })

  router.post('/:projectId/setup/abort', (req: Request, res: Response) => {
    const { project, setupManager } = ctx(req)
    setupManager.abort(project.id)
    res.json({ ok: true })
  })

  // ─── Proposal routes ──────────────────────────────────────────────────────

  router.get('/:projectId/propose', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100)
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0
    const result = listProposals(ctx(req).db, { limit, offset })
    res.json(result)
  })

  router.post('/:projectId/propose', async (req: Request, res: Response) => {
    const { idea } = req.body ?? {}
    if (!idea || typeof idea !== 'string' || !idea.trim()) {
      res.status(400).json({ error: 'idea is required' }); return
    }
    // Pre-check: does the propose-feature command exist in this project?
    const testCmd = `/sr:propose-feature test`
    const resolved = resolveCommand(testCmd, ctx(req).project.path)
    if (resolved === testCmd) {
      res.status(400).json({ error: 'This project does not have the /sr:propose-feature command installed. Run "npx specrails" to update.' }); return
    }
    const id = uuidv4()
    createProposal(ctx(req).db, { id, idea: idea.trim() })
    res.status(202).json({ proposalId: id })
    ctx(req).proposalManager.startExploration(id, idea.trim()).catch((err) => {
      console.error('[project-router] proposal startExploration error:', err)
    })
  })

  router.get('/:projectId/propose/:id', (req: Request, res: Response) => {
    const proposal = getProposal(ctx(req).db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    res.json({ proposal })
  })

  router.post('/:projectId/propose/:id/refine', async (req: Request, res: Response) => {
    const proposal = getProposal(ctx(req).db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    const { feedback } = req.body ?? {}
    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      res.status(400).json({ error: 'feedback is required' }); return
    }
    if (ctx(req).proposalManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'PROPOSAL_BUSY' }); return
    }
    if (proposal.status !== 'review') {
      res.status(409).json({ error: 'Proposal is not in review state' }); return
    }
    res.status(202).json({ ok: true })
    ctx(req).proposalManager.sendRefinement(req.params.id, feedback.trim()).catch((err) => {
      console.error('[project-router] proposal sendRefinement error:', err)
    })
  })

  router.post('/:projectId/propose/:id/create-issue', async (req: Request, res: Response) => {
    const proposal = getProposal(ctx(req).db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    if (ctx(req).proposalManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'PROPOSAL_BUSY' }); return
    }
    if (proposal.status !== 'review') {
      res.status(409).json({ error: 'Proposal is not in review state' }); return
    }
    res.status(202).json({ ok: true })
    ctx(req).proposalManager.createIssue(req.params.id).catch((err) => {
      console.error('[project-router] proposal createIssue error:', err)
    })
  })

  router.delete('/:projectId/propose/:id', (req: Request, res: Response) => {
    const proposal = getProposal(ctx(req).db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    ctx(req).proposalManager.cancel(req.params.id)
    res.json({ ok: true })
  })

  return router
}
