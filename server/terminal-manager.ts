import fs from 'fs'
import path from 'path'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { newId as uuidv4 } from './ids'
import type { WebSocket } from 'ws'

export const TERMINAL_SCROLLBACK_BYTES = 262_144
export const TERMINAL_KILL_GRACE_MS = 2_000
export const TERMINAL_MAX_PER_PROJECT = 10
export const TERMINAL_NAME_MAX = 64
export const TERMINAL_DEFAULT_COLS = 80
export const TERMINAL_DEFAULT_ROWS = 24
const WS_OPEN = 1

// ─── Spawn-helper permission fix ──────────────────────────────────────────────
// node-pty's prebuilds occasionally lose the executable bit during npm extraction
// on some systems. Best-effort chmod so the first Terminal spawn does not fail
// with `posix_spawnp failed`.
function ensureSpawnHelperExecutable(): void {
  if (process.platform === 'win32') return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ptyPkgPath = require.resolve('node-pty/package.json')
    const ptyPkgDir = path.dirname(ptyPkgPath)
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch
    const platform = process.platform
    const helperPath = path.join(ptyPkgDir, 'prebuilds', `${platform}-${arch}`, 'spawn-helper')
    if (fs.existsSync(helperPath)) {
      const stat = fs.statSync(helperPath)
      if ((stat.mode & 0o111) === 0) {
        fs.chmodSync(helperPath, 0o755)
      }
    }
  } catch {
    // Best effort only — if the helper is missing or unreachable, node-pty will
    // surface a clearer error on the first spawn call.
  }
}
ensureSpawnHelperExecutable()

// ─── Shell resolution ─────────────────────────────────────────────────────────

export function resolveShell(): string {
  const envShell = process.env.SHELL
  if (envShell && envShell.trim().length > 0) return envShell.trim()
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return '/bin/zsh'
}

export function shellArgs(shell: string): string[] {
  // Normalize so Windows paths (C:\foo\bar.exe) work even when running cross-platform tests.
  const normalized = shell.replace(/\\/g, '/')
  const base = path.posix.basename(normalized).toLowerCase()
  if (base === 'zsh' || base === 'bash') return ['-l', '-i']
  if (base === 'fish') return ['-i']
  if (base === 'powershell.exe' || base === 'pwsh' || base === 'pwsh.exe' || base === 'powershell') return ['-NoLogo']
  if (base === 'cmd.exe' || base === 'cmd') return []
  return ['-i']
}

// ─── Ring buffer ──────────────────────────────────────────────────────────────

export class RingBuffer {
  private chunks: Buffer[] = []
  private total = 0
  constructor(readonly capacity: number) {}
  append(chunk: Buffer): void {
    if (chunk.length === 0) return
    this.chunks.push(chunk)
    this.total += chunk.length
    // Drop whole chunks from the front until we fit (except the last, which we trim)
    while (this.total > this.capacity && this.chunks.length > 1) {
      const drop = this.chunks.shift() as Buffer
      this.total -= drop.length
    }
    if (this.total > this.capacity && this.chunks.length === 1) {
      const head = this.chunks[0]
      const excess = this.total - this.capacity
      this.chunks[0] = head.subarray(excess)
      this.total = this.chunks[0].length
    }
  }
  snapshot(): Buffer {
    if (this.total === 0) return Buffer.alloc(0)
    return Buffer.concat(this.chunks, this.total)
  }
  size(): number { return this.total }
  clear(): void { this.chunks = []; this.total = 0 }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSessionMeta {
  id: string
  projectId: string
  name: string
  shell: string
  cwd: string
  cols: number
  rows: number
  createdAt: number
}

interface TerminalSession extends TerminalSessionMeta {
  pty: IPty
  buffer: RingBuffer
  clients: Set<WebSocket>
  killTimer?: NodeJS.Timeout
  exited: boolean
}

export class TerminalLimitExceededError extends Error {
  readonly limit = TERMINAL_MAX_PER_PROJECT
  constructor() { super('terminal_limit_exceeded'); this.name = 'TerminalLimitExceededError' }
}
export class TerminalNotFoundError extends Error {
  constructor() { super('terminal_not_found'); this.name = 'TerminalNotFoundError' }
}
export class TerminalNameInvalidError extends Error {
  constructor() { super('terminal_name_invalid'); this.name = 'TerminalNameInvalidError' }
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>()
  private byProject = new Map<string, Set<string>>()

  listForProject(projectId: string): TerminalSessionMeta[] {
    const set = this.byProject.get(projectId)
    if (!set) return []
    const out: TerminalSessionMeta[] = []
    for (const id of set) {
      const s = this.sessions.get(id)
      if (s) out.push(this.toMeta(s))
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Scoped lookup: returns session only if both id AND projectId match. */
  get(projectId: string, sessionId: string): TerminalSession | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) return undefined
    if (s.projectId !== projectId) return undefined
    return s
  }

  /** Unscoped lookup — used by the WS upgrade handler to validate cross-project access. */
  getUnsafe(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId)
  }

  create(projectId: string, opts: { cwd: string; cols?: number; rows?: number; name?: string }): TerminalSessionMeta {
    const currentCount = this.byProject.get(projectId)?.size ?? 0
    if (currentCount >= TERMINAL_MAX_PER_PROJECT) throw new TerminalLimitExceededError()

    const shell = resolveShell()
    const args = shellArgs(shell)
    const cols = clampDim(opts.cols ?? TERMINAL_DEFAULT_COLS, 2, 1000)
    const rows = clampDim(opts.rows ?? TERMINAL_DEFAULT_ROWS, 2, 1000)
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'

    const pty = ptySpawn(shell, args, {
      cwd: opts.cwd,
      cols, rows,
      env,
      name: 'xterm-256color',
    })

    const id = uuidv4()
    const name = validateName(opts.name) ?? this.autoName(projectId, shell)

    const session: TerminalSession = {
      id, projectId, name, shell, cwd: opts.cwd, cols, rows,
      createdAt: Date.now(),
      pty, buffer: new RingBuffer(TERMINAL_SCROLLBACK_BYTES),
      clients: new Set<WebSocket>(),
      exited: false,
    }

    pty.onData((chunk: string) => {
      const buf = Buffer.from(chunk, 'utf8')
      session.buffer.append(buf)
      for (const ws of session.clients) {
        if (ws.readyState === WS_OPEN) {
          try { ws.send(buf, { binary: true }) } catch { /* ignore */ }
        }
      }
    })
    pty.onExit(() => {
      session.exited = true
      for (const ws of session.clients) {
        try { ws.close(1000, 'pty_exit') } catch { /* ignore */ }
      }
      this.removeFromRegistry(session)
    })

    this.sessions.set(id, session)
    let set = this.byProject.get(projectId)
    if (!set) { set = new Set<string>(); this.byProject.set(projectId, set) }
    set.add(id)

    return this.toMeta(session)
  }

  /**
   * Attach a WebSocket to the session: sends snapshot + ready frame, then wires live output.
   * Caller is responsible for having verified projectId scope.
   */
  attach(sessionId: string, ws: WebSocket): TerminalSessionMeta | null {
    const s = this.sessions.get(sessionId)
    if (!s || s.exited) return null
    try {
      const snapshot = s.buffer.snapshot()
      if (snapshot.length > 0) ws.send(snapshot, { binary: true })
      ws.send(JSON.stringify({ type: 'ready', id: s.id, name: s.name, cols: s.cols, rows: s.rows }))
    } catch {
      return null
    }
    s.clients.add(ws)
    return this.toMeta(s)
  }

  detach(sessionId: string, ws: WebSocket): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.clients.delete(ws)
  }

  write(sessionId: string, data: Buffer | string): void {
    const s = this.sessions.get(sessionId)
    if (!s || s.exited) return
    const str = typeof data === 'string' ? data : data.toString('utf8')
    try { s.pty.write(str) } catch { /* pty may have died between checks */ }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const s = this.sessions.get(sessionId)
    if (!s || s.exited) return
    const c = clampDim(cols, 2, 1000)
    const r = clampDim(rows, 2, 1000)
    try { s.pty.resize(c, r) } catch { /* ignore */ }
    s.cols = c; s.rows = r
  }

  rename(projectId: string, sessionId: string, name: string): TerminalSessionMeta {
    const s = this.get(projectId, sessionId)
    if (!s) throw new TerminalNotFoundError()
    const validated = validateName(name)
    if (!validated) throw new TerminalNameInvalidError()
    s.name = validated
    const msg = JSON.stringify({ type: 'renamed', id: s.id, name: s.name })
    for (const ws of s.clients) {
      if (ws.readyState === WS_OPEN) {
        try { ws.send(msg) } catch { /* ignore */ }
      }
    }
    return this.toMeta(s)
  }

  kill(projectId: string, sessionId: string): boolean {
    const s = this.get(projectId, sessionId)
    if (!s) return false
    this.killSession(s)
    return true
  }

  killAllForProject(projectId: string): number {
    const set = this.byProject.get(projectId)
    if (!set) return 0
    const ids = Array.from(set)
    let killed = 0
    for (const id of ids) {
      const s = this.sessions.get(id)
      if (s) { this.killSession(s); killed++ }
    }
    return killed
  }

  async shutdown(): Promise<void> {
    const all = Array.from(this.sessions.values())
    for (const s of all) {
      try { s.pty.kill('SIGTERM') } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, TERMINAL_KILL_GRACE_MS))
    for (const s of Array.from(this.sessions.values())) {
      try { s.pty.kill('SIGKILL') } catch { /* ignore */ }
      this.removeFromRegistry(s)
    }
  }

  sessionCount(): number { return this.sessions.size }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Kill semantics: remove the session from the public registry immediately so
   * subsequent lookups (REST, WS attach) return 404, then SIGTERM in the
   * background, then SIGKILL after a grace period if needed. The onExit handler
   * installed at creation becomes a no-op for already-removed sessions.
   */
  private killSession(s: TerminalSession): void {
    // Idempotent: if already removed from registry, skip.
    if (!this.sessions.has(s.id)) return
    this.detachFromRegistry(s)
    if (!s.exited) {
      try { s.pty.kill('SIGTERM') } catch { /* ignore */ }
      s.killTimer = setTimeout(() => {
        if (!s.exited) {
          try { s.pty.kill('SIGKILL') } catch { /* ignore */ }
        }
      }, TERMINAL_KILL_GRACE_MS)
    }
    // Close clients so the WS upgrade handlers detach cleanly
    for (const ws of s.clients) {
      try { ws.close(1000, 'session_closed') } catch { /* ignore */ }
    }
    s.clients.clear()
    s.buffer.clear()
  }

  private detachFromRegistry(s: TerminalSession): void {
    this.sessions.delete(s.id)
    const set = this.byProject.get(s.projectId)
    if (set) {
      set.delete(s.id)
      if (set.size === 0) this.byProject.delete(s.projectId)
    }
  }

  private removeFromRegistry(s: TerminalSession): void {
    if (s.killTimer) { clearTimeout(s.killTimer); s.killTimer = undefined }
    this.detachFromRegistry(s)
    for (const ws of s.clients) {
      try { ws.close(1000, 'session_closed') } catch { /* ignore */ }
    }
    s.clients.clear()
    s.buffer.clear()
  }

  private autoName(projectId: string, shell: string): string {
    const base = path.basename(shell)
    const metas = this.listForProject(projectId)
    const matching = metas.filter((m) => m.name === base || m.name.startsWith(base + ' ('))
    if (matching.length === 0) return base
    return `${base} (${matching.length + 1})`
  }

  private toMeta(s: TerminalSession): TerminalSessionMeta {
    return {
      id: s.id, projectId: s.projectId, name: s.name, shell: s.shell,
      cwd: s.cwd, cols: s.cols, rows: s.rows, createdAt: s.createdAt,
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampDim(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  const v = Math.trunc(n)
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

function validateName(name?: string): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > TERMINAL_NAME_MAX) return null
  return trimmed
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: TerminalManager | null = null

/**
 * Returns the process-wide TerminalManager. Lazy-initialised so that test suites
 * that don't touch terminals pay no cost.
 */
export function getTerminalManager(): TerminalManager {
  if (!_instance) _instance = new TerminalManager()
  return _instance
}

/** Reset the singleton. Tests only. */
export function _resetTerminalManagerForTest(): void {
  if (_instance) {
    // Best-effort sync cleanup — tests call this in beforeEach
    void _instance.shutdown()
  }
  _instance = null
}
