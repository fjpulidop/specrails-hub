/**
 * Per-session in-memory command-mark store fed by JSON `mark` control frames.
 * Lives at module scope so it survives React re-mounts; we intentionally don't
 * persist to localStorage because marks are session-scoped.
 *
 * Subscribe via `useSessionMarks` for re-rendering React state.
 */

export interface SessionMarks {
  /** Open prompt currently in pre-exec state (no post-exec yet). */
  openPreExec: { startedAt: number } | null
  /** Completed commands (most recent last). */
  completed: Array<{ startedAt: number; finishedAt: number; exitCode: number | null }>
  /** Latest CWD reported. */
  cwd: string | null
  /** Buffer line at which each prompt-start mark was observed. Used by the gutter. */
  promptRows: Array<{ ts: number; row: number | null; exitCode: number | null }>
}

type Listener = (m: SessionMarks) => void

const stores = new Map<string, SessionMarks>()
const listeners = new Map<string, Set<Listener>>()

function ensure(sessionId: string): SessionMarks {
  let s = stores.get(sessionId)
  if (!s) {
    s = { openPreExec: null, completed: [], cwd: null, promptRows: [] }
    stores.set(sessionId, s)
  }
  return s
}

function notify(sessionId: string): void {
  const set = listeners.get(sessionId)
  if (!set) return
  const m = ensure(sessionId)
  for (const fn of set) {
    try { fn(m) } catch { /* listener error must not break stream */ }
  }
}

export function ingestMark(
  sessionId: string,
  ev: { kind: string; ts: number; payload?: { exitCode?: number; path?: string } },
  buffer?: { row: number | null },
): void {
  const s = ensure(sessionId)
  switch (ev.kind) {
    case 'prompt-start':
      s.promptRows.push({ ts: ev.ts, row: buffer?.row ?? null, exitCode: null })
      // Cap at 1000 to prevent unbounded growth.
      if (s.promptRows.length > 1000) s.promptRows.shift()
      break
    case 'pre-exec':
      s.openPreExec = { startedAt: ev.ts }
      break
    case 'post-exec': {
      const exit = ev.payload?.exitCode ?? null
      const startedAt = s.openPreExec?.startedAt ?? ev.ts
      s.completed.push({ startedAt, finishedAt: ev.ts, exitCode: exit })
      // Update most recent prompt row's exit code so the gutter can colour it.
      const last = s.promptRows[s.promptRows.length - 1]
      if (last) last.exitCode = exit
      s.openPreExec = null
      // Trim completed log to a reasonable in-memory size.
      if (s.completed.length > 1000) s.completed.shift()
      break
    }
    case 'cwd':
      s.cwd = ev.payload?.path ?? null
      break
  }
  notify(sessionId)
}

export function subscribe(sessionId: string, fn: Listener): () => void {
  let set = listeners.get(sessionId)
  if (!set) { set = new Set(); listeners.set(sessionId, set) }
  set.add(fn)
  return () => { set!.delete(fn) }
}

export function getMarks(sessionId: string): SessionMarks {
  return ensure(sessionId)
}

export function disposeSession(sessionId: string): void {
  stores.delete(sessionId)
  listeners.delete(sessionId)
}
