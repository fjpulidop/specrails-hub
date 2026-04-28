import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import type { ChildProcess } from 'child_process'

export type PathSource = 'inherited' | 'fast-path' | 'login-shell'
export type LoginShellStatus = 'ok' | 'skipped' | 'timeout' | 'error'

interface PathDiagnostic {
  pathSegments: string[]
  pathSources: PathSource[]
  loginShellStatus: LoginShellStatus
}

const PATH_BEGIN = '__SRH_PATH_BEGIN__'
const PATH_END = '__SRH_PATH_END__'
const LOGIN_SHELL_TIMEOUT_MS = 1500

let diagnostic: PathDiagnostic = {
  pathSegments: [],
  pathSources: [],
  loginShellStatus: 'skipped',
}

let warnedLoginShell = false

function getDelimiter(): string {
  return process.platform === 'win32' ? ';' : ':'
}

function splitPath(value: string | undefined): string[] {
  if (!value) return []
  return value.split(getDelimiter()).filter((s) => s.length > 0)
}

function joinPath(segments: string[]): string {
  return segments.join(getDelimiter())
}

function fastPathDirectories(): string[] {
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin']
  }
  if (process.platform === 'linux') {
    return ['/usr/local/bin', '/usr/local/sbin', path.join(os.homedir(), '.local/bin')]
  }
  return []
}

/**
 * Synchronously prepend well-known package-manager bin directories to
 * `process.env.PATH` if they are missing. No-op on Windows.
 *
 * Records the resulting segments and their sources for diagnostic reporting.
 */
export function resolveStartupPath(): void {
  const inherited = splitPath(process.env.PATH)
  const inheritedSet = new Set(inherited)

  if (process.platform === 'win32') {
    diagnostic = {
      pathSegments: inherited,
      pathSources: inherited.map(() => 'inherited' as PathSource),
      loginShellStatus: 'skipped',
    }
    return
  }

  const toPrepend: string[] = []
  for (const dir of fastPathDirectories()) {
    if (!inheritedSet.has(dir)) {
      toPrepend.push(dir)
      inheritedSet.add(dir)
    }
  }

  const merged = [...toPrepend, ...inherited]
  process.env.PATH = joinPath(merged)

  diagnostic = {
    pathSegments: merged,
    pathSources: [
      ...toPrepend.map(() => 'fast-path' as PathSource),
      ...inherited.map(() => 'inherited' as PathSource),
    ],
    loginShellStatus: 'skipped',
  }
}

/**
 * Parse stdout from the login-shell probe. Returns the PATH between sentinel
 * markers, or `null` if the markers are not present.
 */
export function parseLoginShellOutput(stdout: string): string | null {
  const begin = stdout.indexOf(PATH_BEGIN)
  if (begin === -1) return null
  const start = begin + PATH_BEGIN.length
  const end = stdout.indexOf(PATH_END, start)
  if (end === -1) return null
  return stdout.slice(start, end)
}

type SpawnFn = typeof spawn

interface AugmentOptions {
  spawnFn?: SpawnFn
  timeoutMs?: number
}

/**
 * Spawn the user's login shell once and merge any additional PATH segments
 * it exposes (Volta/nvm/fnm/asdf shims) into `process.env.PATH`. Async,
 * fire-and-forget — must not block startup.
 *
 * No-op on Windows and in test environments.
 */
export async function augmentPathFromLoginShell(opts: AugmentOptions = {}): Promise<void> {
  if (process.platform === 'win32') {
    diagnostic.loginShellStatus = 'skipped'
    return
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    diagnostic.loginShellStatus = 'skipped'
    return
  }

  const spawnFn = opts.spawnFn ?? spawn
  const timeoutMs = opts.timeoutMs ?? LOGIN_SHELL_TIMEOUT_MS
  const shell = process.env.SHELL || '/bin/sh'
  const command = `printf "${PATH_BEGIN}%s${PATH_END}" "$PATH"`

  const status = await new Promise<LoginShellStatus>((resolve) => {
    let child: ChildProcess
    try {
      child = spawnFn(shell, ['-l', '-i', '-c', command], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve('error')
      return
    }

    let stdout = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    child.stderr?.on('data', () => { /* discard */ })

    const finish = (s: LoginShellStatus) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(s)
    }

    child.on('error', () => finish('error'))
    child.on('close', (code) => {
      if (timedOut) {
        finish('timeout')
        return
      }
      if (code !== 0) {
        finish('error')
        return
      }
      const parsed = parseLoginShellOutput(stdout)
      if (parsed === null) {
        finish('error')
        return
      }
      mergeLoginShellPath(parsed)
      finish('ok')
    })
  })

  diagnostic.loginShellStatus = status

  if (status !== 'ok' && !warnedLoginShell) {
    warnedLoginShell = true
    console.warn(`[path-resolver] login-shell merge ${status}; using fast-path PATH only`)
  }
}

function mergeLoginShellPath(rawPath: string): void {
  const current = splitPath(process.env.PATH)
  const currentSet = new Set(current)
  const incoming = splitPath(rawPath)

  const additions: string[] = []
  for (const dir of incoming) {
    if (!currentSet.has(dir)) {
      additions.push(dir)
      currentSet.add(dir)
    }
  }
  if (additions.length === 0) return

  const merged = [...additions, ...current]
  process.env.PATH = joinPath(merged)

  diagnostic = {
    pathSegments: merged,
    pathSources: [
      ...additions.map(() => 'login-shell' as PathSource),
      ...diagnostic.pathSources,
    ],
    loginShellStatus: diagnostic.loginShellStatus,
  }
}

export function getPathDiagnostic(): PathDiagnostic {
  return {
    pathSegments: [...diagnostic.pathSegments],
    pathSources: [...diagnostic.pathSources],
    loginShellStatus: diagnostic.loginShellStatus,
  }
}

/** Test-only helper to reset module state. */
export function __resetPathResolverForTest(): void {
  diagnostic = { pathSegments: [], pathSources: [], loginShellStatus: 'skipped' }
  warnedLoginShell = false
}
