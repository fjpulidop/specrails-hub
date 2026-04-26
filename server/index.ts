// Note: the pkg-binary native-addon hijacks (better_sqlite3.node, node-pty, pty.node)
// used to live here but had to move to an esbuild `banner.js` in scripts/build-sidecar.mjs
// so they run BEFORE esbuild's top-of-bundle `require('node-pty')` statement.
// See the banner in that script for the actual patches.

import http from 'http'
import path from 'path'
import fs from 'fs'
import os from 'os'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import type { WsMessage } from './types'
import { ProjectRegistry } from './project-registry'
import { createHubRouter } from './hub-router'
import { createProjectRouter } from './project-router'
import { createHooksRouter, getPhaseStates, getPhaseDefinitions } from './hooks'
import { createDocsRouter } from './docs-router'
import { requireAuth, loadOrGenerateToken, tokenFromUpgradeRequest } from './auth'
import { QueueManager, ClaudeNotFoundError, JobNotFoundError, JobAlreadyTerminalError } from './queue-manager'
import { initDb, type DbInstance, listJobs, getJob, getJobEvents, getStats, purgeJobs,
  createConversation, listConversations, getConversation,
  deleteConversation, updateConversation, addMessage, getMessages,
  createProposal, getProposal, listProposals, deleteProposal } from './db'
import { ChatManager } from './chat-manager'
import { ProposalManager } from './proposal-manager'
import type { ChatConversationRow } from './types'
import { getConfig, fetchIssues } from './config'
import { getAnalytics } from './analytics'
import { resolveCommand } from './command-resolver'
import { newId as uuidv4 } from './ids'
import { getTerminalManager } from './terminal-manager'
import { createTelemetryRouter } from './telemetry-receiver'
import { runCompactionForAll } from './telemetry-compactor'

const TERMINAL_PANEL_ENABLED = process.env.SPECRAILS_TERMINAL_PANEL !== 'false'

// Read package.json version once at startup
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PKG_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../package.json') as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

// ─── Desktop app watchdog ─────────────────────────────────────────────────────

// When running as a Tauri sidecar, the parent Tauri process passes its PID via
// --parent-pid=<pid>. We poll every 3 seconds and exit if the parent is gone,
// preventing orphaned server processes after an app crash.
const parentPidArg = process.argv.find((a) => a.startsWith('--parent-pid='))
if (parentPidArg) {
  const parentPid = parseInt(parentPidArg.split('=')[1], 10)
  if (!isNaN(parentPid)) {
    setInterval(() => {
      try {
        // signal 0 = existence check only, does not actually send a signal
        process.kill(parentPid, 0)
      } catch {
        // Parent process is gone — terminate cleanly
        process.exit(0)
      }
    }, 3000)
  }
}

// ─── Mode detection ───────────────────────────────────────────────────────────

// Hub mode is the default. Use --legacy or SPECRAILS_LEGACY=1 for single-project mode.
const isHubMode = !process.argv.includes('--legacy') && process.env.SPECRAILS_LEGACY !== '1'

// ─── Resolve project name (legacy single-project mode) ────────────────────────

function resolveProjectName(): string {
  if (process.env.SPECRAILS_PROJECT_NAME) {
    return process.env.SPECRAILS_PROJECT_NAME
  }
  const cwd = process.cwd()
  const parentDir = path.basename(path.resolve(cwd, '../..'))
  const immediateParent = path.basename(path.resolve(cwd, '..'))
  if (immediateParent === 'specrails') {
    return parentDir
  }
  return path.basename(cwd)
}

// ─── Parse CLI args ───────────────────────────────────────────────────────────

let projectName = resolveProjectName()
let port = 4200

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--project' && process.argv[i + 1]) {
    projectName = process.argv[++i]
  } else if (process.argv[i] === '--port' && process.argv[i + 1]) {
    port = parseInt(process.argv[++i], 10)
  }
}

// ─── PID file management ──────────────────────────────────────────────────────

const PID_DIR = path.join(os.homedir(), '.specrails')
const PID_FILE = path.join(PID_DIR, 'manager.pid')

function writePidFile(): void {
  try {
    fs.mkdirSync(PID_DIR, { recursive: true })
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8')
  } catch {
    // Non-fatal
  }
}

function removePidFile(): void {
  try {
    fs.unlinkSync(PID_FILE)
  } catch {
    // Non-fatal
  }
}

// ─── Express + WebSocket setup ────────────────────────────────────────────────

const app = express()

// ─── CORS — allow only localhost origins (CRIT-02) ────────────────────────────

// Tauri's desktop WebView exposes two different origin formats:
//   - macOS / Linux: tauri://localhost
//   - Windows WebView2: http://tauri.localhost (virtual-host mapping on the
//     custom scheme; shows up as a regular http origin from the fetch layer)
const ALLOWED_ORIGIN_PATTERN = /^(https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?|tauri:\/\/localhost)$/

function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  return origin === undefined || ALLOWED_ORIGIN_PATTERN.test(origin)
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers['origin']
  if (origin) {
    if (ALLOWED_ORIGIN_PATTERN.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    } else {
      // Non-localhost origin — reject with 403
      res.status(403).json({ error: 'Forbidden: cross-origin requests not allowed' })
      return
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Hub-Token')
  res.setHeader('Access-Control-Max-Age', '600')

  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
}

app.use(corsMiddleware)

// ─── Body size limit (MED-02) ─────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }))

const server = http.createServer(app)
const wsServerOptions = {
  noServer: true,
  handleProtocols: (protocols: Set<string>) => {
    if (protocols.has('specrails-hub')) return 'specrails-hub'

    // Backward compatibility for clients that only offer the auth carrier.
    for (const protocol of protocols) {
      if (protocol.startsWith('hub-token.')) return protocol
    }
    return false
  },
} satisfies ConstructorParameters<typeof WebSocketServer>[0]

const wss = new WebSocketServer(wsServerOptions)
const terminalWss = new WebSocketServer(wsServerOptions)
const clients = new Set<WebSocket>()

const TERMINAL_WS_RE = /^\/ws\/terminal\/([0-9a-f-]+)$/i

function rejectUpgrade(socket: { write: (s: string) => void; destroy: () => void }, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function authorizeUpgrade(request: http.IncomingMessage): 'ok' | 'forbidden' | 'unauthorized' {
  const origin = request.headers.origin
  if (!isAllowedBrowserOrigin(origin)) return 'forbidden'

  const provided = tokenFromUpgradeRequest(request)
  if (!provided || provided !== loadOrGenerateToken()) return 'unauthorized'

  return 'ok'
}

function broadcast(msg: WsMessage): void {
  const data = JSON.stringify(msg)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

// ─── Health endpoint state (populated in mode blocks) ─────────────────────────

let _getProjectCount: () => number = () => 0
let _legacyDb: DbInstance | null = null

server.on('upgrade', (request, socket, head) => {
  const urlStr = request.url ?? '/'
  const auth = authorizeUpgrade(request)
  if (auth === 'forbidden') return rejectUpgrade(socket, 403, 'Forbidden')
  if (auth === 'unauthorized') return rejectUpgrade(socket, 401, 'Unauthorized')

  // Terminal PTY WebSocket endpoint: /ws/terminal/:id?projectId=...
  const pathOnly = urlStr.split('?')[0]
  const termMatch = pathOnly.match(TERMINAL_WS_RE)
  if (termMatch) {
    if (!TERMINAL_PANEL_ENABLED) return rejectUpgrade(socket, 404, 'Not Found')
    let parsed: URL
    try { parsed = new URL(urlStr, 'http://localhost') } catch { return rejectUpgrade(socket, 400, 'Bad Request') }
    const projectId = parsed.searchParams.get('projectId')
    const sessionId = termMatch[1]
    const tm = getTerminalManager()
    const session = tm.getUnsafe(sessionId)
    if (!session) return rejectUpgrade(socket, 404, 'Not Found')
    if (!projectId || session.projectId !== projectId) return rejectUpgrade(socket, 403, 'Forbidden')
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      const meta = tm.attach(sessionId, ws)
      if (!meta) {
        try { ws.close(1011, 'attach_failed') } catch { /* ignore */ }
        return
      }
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          tm.write(sessionId, data as Buffer)
          return
        }
        try {
          const txt = (data as Buffer).toString('utf8')
          const msg = JSON.parse(txt) as { type?: string; cols?: number; rows?: number; data?: string }
          if (msg?.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
            tm.resize(sessionId, msg.cols, msg.rows)
          } else if (msg?.type === 'write' && typeof msg.data === 'string') {
            tm.write(sessionId, msg.data)
          }
        } catch { /* ignore malformed control */ }
      })
      ws.on('close', () => tm.detach(sessionId, ws))
      ws.on('error', () => tm.detach(sessionId, ws))
    })
    return
  }
  // Default: main event WebSocket.
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

// ─── Docs portal (available in all modes) ────────────────────────────────────

app.use('/api/docs', createDocsRouter())

// ─── Auth — protect all /api/* except /api/health and /api/hub/token ─────────
// (CRIT-01) Token is served publicly so the local client can bootstrap itself.

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: PKG_VERSION,
    uptime: Math.floor(process.uptime()),
    projects: _getProjectCount(),
    mode: isHubMode ? 'hub' : 'legacy',
  })
})

app.get('/api/hub/token', (_req, res) => {
  res.json({ token: loadOrGenerateToken() })
})

app.use('/api', requireAuth)

// ─── WebSocket rate limiting helper (LOW-03) ──────────────────────────────────

const WS_MAX_MESSAGES_PER_MINUTE = 120
const WS_MAX_MESSAGE_BYTES = 65_536 // 64 KB

function applyWsRateLimiting(ws: WebSocket): void {
  let messageCount = 0
  const resetTimer = setInterval(() => { messageCount = 0 }, 60_000)

  ws.on('message', (data: Buffer | string) => {
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength

    if (size > WS_MAX_MESSAGE_BYTES) {
      ws.close(1009, 'Message too large')
      return
    }

    messageCount++
    if (messageCount > WS_MAX_MESSAGES_PER_MINUTE) {
      ws.close(1008, 'Rate limit exceeded')
    }
  })

  ws.on('close', () => {
    clearInterval(resetTimer)
  })
}

// ─── Hub mode ─────────────────────────────────────────────────────────────────

if (isHubMode) {
  const registry = new ProjectRegistry(broadcast, undefined, port)
  registry.loadAll()
  _getProjectCount = () => registry.listContexts().length

  // OTLP/JSON receiver — must be mounted before auth middleware would block it,
  // but after CORS. Requires auth (already applied globally above via requireAuth).
  // Hub mode only: legacy mode has no per-project routing so receiver is not useful.
  app.use('/otlp', createTelemetryRouter(registry))

  // Run telemetry compaction at startup after registry is hydrated
  runCompactionForAll(registry).catch((err) => {
    console.error('[telemetry-compactor] startup compaction error:', err)
  })

  // Hub-level routes
  app.use('/api/hub', createHubRouter(registry, broadcast))

  // Per-project routes under /api/projects/:projectId/*
  app.use('/api/projects', createProjectRouter(registry))

  // Return 410 Gone for old per-project hook endpoint in hub mode
  app.post('/hooks/events', (_req, res) => {
    res.status(410).json({
      error: 'In hub mode, use /api/projects/:projectId/hooks/events',
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)
    applyWsRateLimiting(ws)

    // Send hub state init
    const projects = registry.listContexts().map((ctx) => ctx.project)
    ws.send(JSON.stringify({
      type: 'hub.projects',
      projects,
      timestamp: new Date().toISOString(),
    }))

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

} else {
  // ─── Single-project (legacy) mode ─────────────────────────────────────────

  const db = initDb(path.join(process.cwd(), 'data', 'jobs.sqlite'))
  _getProjectCount = () => 1
  _legacyDb = db
  const queueManager = new QueueManager(broadcast, db)
  const chatManager = new ChatManager(broadcast, db)
  const proposalManager = new ProposalManager(broadcast, db, process.cwd())

  try {
    const initialConfig = getConfig(process.cwd(), db, projectName)
    queueManager.setCommands(initialConfig.commands)
  } catch {
    console.warn('[init] failed to load commands for phase resolution')
  }

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)
    applyWsRateLimiting(ws)

    const initMsg: WsMessage = {
      type: 'init',
      projectName,
      phases: getPhaseStates(),
      phaseDefinitions: getPhaseDefinitions(),
      logBuffer: queueManager.getLogBuffer().slice(-500),
      recentJobs: listJobs(db, { limit: 10 }).jobs,
      queue: {
        jobs: queueManager.getJobs(),
        activeJobId: queueManager.getActiveJobId(),
        paused: queueManager.isPaused(),
      },
    }
    ws.send(JSON.stringify(initMsg))

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  app.use('/hooks', createHooksRouter(broadcast, db, {
    get current() { return queueManager.getActiveJobId() },
    set current(_: string | null) { /* managed by QueueManager */ },
  }))

  app.post('/api/spawn', (req, res) => {
    const { command } = req.body ?? {}
    if (!command || typeof command !== 'string' || !command.trim()) {
      res.status(400).json({ error: 'command is required' })
      return
    }
    try {
      const job = queueManager.enqueue(command)
      const position = job.queuePosition ?? 0
      res.status(202).json({ jobId: job.id, position })
    } catch (err) {
      if (err instanceof ClaudeNotFoundError) {
        res.status(400).json({ error: err.message })
      } else {
        console.error('[spawn] unexpected error:', err)
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  })

  app.get('/api/state', (_req, res) => {
    res.json({
      projectName,
      phases: getPhaseStates(),
      busy: queueManager.getActiveJobId() !== null,
      currentJobId: queueManager.getActiveJobId(),
      version: PKG_VERSION,
    })
  })

  app.delete('/api/jobs/:id', (req, res) => {
    try {
      const result = queueManager.cancel(req.params.id)
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

  app.post('/api/queue/pause', (_req, res) => {
    queueManager.pause()
    res.json({ ok: true, paused: true })
  })

  app.post('/api/queue/resume', (_req, res) => {
    queueManager.resume()
    res.json({ ok: true, paused: false })
  })

  app.put('/api/queue/reorder', (req, res) => {
    const { jobIds } = req.body ?? {}
    if (!Array.isArray(jobIds)) {
      res.status(400).json({ error: 'jobIds must be an array' })
      return
    }
    try {
      queueManager.reorder(jobIds)
      res.json({ ok: true, queue: jobIds })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.get('/api/queue', (_req, res) => {
    res.json({
      jobs: queueManager.getJobs(),
      paused: queueManager.isPaused(),
      activeJobId: queueManager.getActiveJobId(),
    })
  })

  app.get('/api/jobs', (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200)
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0
    const status = req.query.status as string | undefined
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    const result = listJobs(db, { limit, offset, status, from, to })
    res.json(result)
  })

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJob(db, req.params.id)
    if (!job) { res.status(404).json({ error: 'Job not found' }); return }
    const events = getJobEvents(db, req.params.id)
    const phaseDefinitions = queueManager.phasesForCommand(job.command)
    res.json({ job, events, phaseDefinitions })
  })

  app.delete('/api/jobs', (req, res) => {
    try {
      const { from, to } = req.body ?? {}
      const deleted = purgeJobs(db, { from, to })
      res.json({ ok: true, deleted })
    } catch (err) {
      console.error('[purge] error:', err)
      res.status(500).json({ error: 'Failed to purge jobs' })
    }
  })

  app.get('/api/stats', (_req, res) => {
    res.json(getStats(db))
  })

  app.get('/api/analytics', (req, res) => {
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
      res.json(getAnalytics(db, { period: period as any, from, to }))
    } catch (err) {
      console.error('[analytics] error:', err)
      res.status(500).json({ error: 'Failed to compute analytics' })
    }
  })

  app.get('/api/config', (_req, res) => {
    try {
      const config = getConfig(process.cwd(), db, projectName)
      res.json(config)
    } catch (err) {
      console.error('[config] error:', err)
      res.status(500).json({ error: 'Failed to read config' })
    }
  })

  app.post('/api/config', (req, res) => {
    const { active, labelFilter } = req.body ?? {}
    try {
      if (active !== undefined) {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.active_tracker', ?)`).run(active ?? '')
      }
      if (labelFilter !== undefined) {
        db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.label_filter', ?)`).run(labelFilter ?? '')
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[config] persist error:', err)
      res.status(500).json({ error: 'Failed to persist config' })
    }
  })

  app.get('/api/issues', (_req, res) => {
    try {
      const config = getConfig(process.cwd(), db, projectName)
      const tracker = config.issueTracker.active
      if (!tracker) {
        res.status(503).json({ error: 'No issue tracker configured', trackers: config.issueTracker })
        return
      }
      const search = _req.query.search as string | undefined
      const label = _req.query.label as string | undefined
      const issues = fetchIssues(tracker, { search, label, repo: config.project.repo, cwd: process.cwd() })
      res.json(issues)
    } catch (err) {
      console.error('[issues] error:', err)
      res.status(500).json({ error: 'Failed to fetch issues' })
    }
  })

  // Chat routes
  app.get('/api/chat/conversations', (_req, res) => {
    const conversations = listConversations(db)
    res.json({ conversations })
  })

  app.post('/api/chat/conversations', (req, res) => {
    const model = (req.body?.model as string | undefined) ?? 'claude-sonnet-4-5'
    const id = uuidv4()
    createConversation(db, { id, model })
    const conversation = getConversation(db, id) as ChatConversationRow
    res.status(201).json({ conversation })
  })

  app.get('/api/chat/conversations/:id', (req, res) => {
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const messages = getMessages(db, req.params.id)
    res.json({ conversation, messages })
  })

  app.delete('/api/chat/conversations/:id', (req, res) => {
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    deleteConversation(db, req.params.id)
    res.json({ ok: true })
  })

  app.patch('/api/chat/conversations/:id', (req, res) => {
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

  app.get('/api/chat/conversations/:id/messages', (req, res) => {
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const messages = getMessages(db, req.params.id)
    res.json({ messages })
  })

  app.post('/api/chat/conversations/:id/messages', async (req, res) => {
    const conversation = getConversation(db, req.params.id)
    if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return }
    const text = req.body?.text as string | undefined
    if (!text || !text.trim()) { res.status(400).json({ error: 'text is required' }); return }
    if (chatManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'CONVERSATION_BUSY' }); return
    }
    res.status(202).json({ ok: true })
    chatManager.sendMessage(req.params.id, text.trim()).catch((err) => {
      console.error('[chat] sendMessage error:', err)
    })
  })

  app.delete('/api/chat/conversations/:id/messages/stream', (req, res) => {
    if (!chatManager.isActive(req.params.id)) {
      res.status(404).json({ error: 'No active stream for this conversation' }); return
    }
    chatManager.abort(req.params.id)
    res.json({ ok: true })
  })

  // ─── Proposal routes (legacy mode) ──────────────────────────────────────────

  app.get('/api/propose', (_req, res) => {
    const limit = Math.min(parseInt(String(_req.query.limit ?? '20'), 10) || 20, 100)
    const offset = parseInt(String(_req.query.offset ?? '0'), 10) || 0
    const result = listProposals(db, { limit, offset })
    res.json(result)
  })

  app.post('/api/propose', (req, res) => {
    const { idea } = req.body ?? {}
    if (!idea || typeof idea !== 'string' || !idea.trim()) {
      res.status(400).json({ error: 'idea is required' }); return
    }
    const testCmd = `/specrails:propose-feature test`
    const resolved = resolveCommand(testCmd, process.cwd())
    if (resolved === testCmd) {
      res.status(400).json({ error: 'This project does not have the /specrails:propose-feature command installed. Run "npx specrails-core@latest" to update.' }); return
    }
    const id = uuidv4()
    createProposal(db, { id, idea: idea.trim() })
    res.status(202).json({ proposalId: id })
    proposalManager.startExploration(id, idea.trim()).catch((err) => {
      console.error('[propose] startExploration error:', err)
    })
  })

  app.get('/api/propose/:id', (req, res) => {
    const proposal = getProposal(db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    res.json({ proposal })
  })

  app.post('/api/propose/:id/refine', (req, res) => {
    const proposal = getProposal(db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    const { feedback } = req.body ?? {}
    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      res.status(400).json({ error: 'feedback is required' }); return
    }
    if (proposalManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'PROPOSAL_BUSY' }); return
    }
    if (proposal.status !== 'review') {
      res.status(409).json({ error: 'Proposal is not in review state' }); return
    }
    res.status(202).json({ ok: true })
    proposalManager.sendRefinement(req.params.id, feedback.trim()).catch((err) => {
      console.error('[propose] sendRefinement error:', err)
    })
  })

  app.post('/api/propose/:id/create-issue', (req, res) => {
    const proposal = getProposal(db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    if (proposalManager.isActive(req.params.id)) {
      res.status(409).json({ error: 'PROPOSAL_BUSY' }); return
    }
    if (proposal.status !== 'review') {
      res.status(409).json({ error: 'Proposal is not in review state' }); return
    }
    res.status(202).json({ ok: true })
    proposalManager.createIssue(req.params.id).catch((err) => {
      console.error('[propose] createIssue error:', err)
    })
  })

  app.delete('/api/propose/:id', (req, res) => {
    const proposal = getProposal(db, req.params.id)
    if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return }
    proposalManager.cancel(req.params.id)
    res.json({ ok: true })
  })
}


// ─── Global async error handler ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err)
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Serve built React client (production) ────────────────────────────────────

const clientDist = path.resolve(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api|\/hooks).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ─── Start server ─────────────────────────────────────────────────────────────

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[error] Port ${port} is already in use. Is another manager instance running?`)
    console.error(`[error] Try stopping it first: specrails-hub stop`)
    process.exit(1)
  }
  throw err
})

server.listen(port, '127.0.0.1', () => {
  const mode = isHubMode ? 'hub mode' : 'single-project mode'
  console.log(`specrails web manager (${mode}) running on http://127.0.0.1:${port}`)
  writePidFile()
})

// ─── Clean shutdown ───────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  removePidFile()
  try {
    await getTerminalManager().shutdown()
  } catch { /* ignore */ }
  try { wss.close() } catch { /* ignore */ }
  try { terminalWss.close() } catch { /* ignore */ }
  if (_legacyDb) {
    try { _legacyDb.close() } catch { /* ignore */ }
  }
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
