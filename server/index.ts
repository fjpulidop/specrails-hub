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
import { createDocsRouter } from './docs-router'
import { requireAuth, loadOrGenerateToken, tokenFromUpgradeRequest } from './auth'
import { getTerminalManager } from './terminal-manager'
import { createTelemetryRouter } from './telemetry-receiver'
import { runCompactionForAll } from './telemetry-compactor'
import { resolveStartupPath, augmentPathFromLoginShell, getPathDiagnostic } from './path-resolver'

const inheritedPathBeforeResolve = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean).length
resolveStartupPath()

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

// ─── Parse CLI args ───────────────────────────────────────────────────────────

let port = 4200

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
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

// ─── Health endpoint state (populated by hub bootstrap below) ────────────────

let _getProjectCount: () => number = () => 0

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
    mode: 'hub',
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

// ─── Hub bootstrap ────────────────────────────────────────────────────────────

{
  const registry = new ProjectRegistry(broadcast, undefined, port)
  registry.loadAll()
  _getProjectCount = () => registry.listContexts().length

  // OTLP/JSON receiver — must be mounted before auth middleware would block it,
  // but after CORS. Requires auth (already applied globally above via requireAuth).
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
  console.log(`specrails web manager running on http://127.0.0.1:${port}`)
  writePidFile()
  void augmentPathFromLoginShell().then(() => {
    const diag = getPathDiagnostic()
    const augmented = diag.pathSegments.length - inheritedPathBeforeResolve
    const source = process.stdin.isTTY ? 'terminal' : 'gui'
    console.log(`[path-resolver] inherited=${inheritedPathBeforeResolve} augmented=${Math.max(0, augmented)} loginShell=${diag.loginShellStatus} source=${source}`)
  })
})

// ─── Clean shutdown ───────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  removePidFile()
  try {
    await getTerminalManager().shutdown()
  } catch { /* ignore */ }
  try { wss.close() } catch { /* ignore */ }
  try { terminalWss.close() } catch { /* ignore */ }
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
