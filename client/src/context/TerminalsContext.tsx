/**
 * TerminalsContext — holds per-project terminal state and xterm instances.
 *
 * Key invariants:
 *  - xterm.js Terminal instances are created once per session and NEVER disposed
 *    until the session is explicitly killed. They live in `xtermHandles` (ref Map).
 *  - Each xterm's container DOM node is attached to a hidden host div by default.
 *    When a session becomes active and the panel is visible, the viewport slot
 *    component appendChild's it into its own subtree, then moves it back on unmount.
 *  - Per-project panel state (visibility + userHeight) is persisted to localStorage.
 *  - PTYs live on the server; when we switch to a project, we GET /terminals and
 *    reconcile local refs against the server truth.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API_ORIGIN } from '../lib/origin'
import { WS_URL } from '../lib/ws-url'
import { getHubToken } from '../lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelVisibility = 'hidden' | 'restored' | 'maximized'

export interface TerminalRef {
  id: string
  projectId: string
  name: string
  cols: number
  rows: number
  createdAt: number
}

export interface ProjectPanelState {
  visibility: PanelVisibility
  userHeight: number
  sessions: TerminalRef[]
  activeId: string | null
}

export const DEFAULT_USER_HEIGHT = 320
export const PANEL_MIN_HEIGHT = 120
export const TERMINAL_MAX_PER_PROJECT = 10

interface TerminalsContextValue {
  /** All per-project state. Re-reads trigger re-renders. */
  states: Record<string, ProjectPanelState>
  getState: (projectId: string) => ProjectPanelState
  ensureProject: (projectId: string) => void
  setVisibility: (projectId: string, v: PanelVisibility) => void
  togglePanel: (projectId: string) => void
  setUserHeight: (projectId: string, h: number) => void
  setActive: (projectId: string, id: string) => void
  create: (projectId: string, opts?: { cols?: number; rows?: number }) => Promise<TerminalRef | null>
  rename: (projectId: string, id: string, name: string) => Promise<boolean>
  kill: (projectId: string, id: string) => Promise<void>
  focusActive: (projectId: string) => void
  disposeProject: (projectId: string) => void
  /** For viewport slot components — returns the container DOM node to adopt. */
  getContainer: (sessionId: string) => HTMLDivElement | null
  /** Called when the viewport slot has appended the container to its DOM. Triggers fit. */
  notifyAdopted: (sessionId: string) => void
}

const TerminalsContext = createContext<TerminalsContextValue | null>(null)

// ─── Internals ────────────────────────────────────────────────────────────────

interface XtermHandle {
  term: Terminal
  fit: FitAddon
  webLinks: WebLinksAddon
  container: HTMLDivElement
  ws: WebSocket | null
  attached: boolean
  disposers: Array<() => void>
}

function storageKey(projectId: string): string {
  return `specrails-hub:terminal-panel:${projectId}`
}

interface StoredPanel { visibility: PanelVisibility; userHeight: number }

function readStored(projectId: string): StoredPanel | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const obj = JSON.parse(raw) as Partial<StoredPanel>
    if (!obj) return null
    const vis = obj.visibility
    const h = obj.userHeight
    if (vis !== 'hidden' && vis !== 'restored' && vis !== 'maximized') return null
    if (typeof h !== 'number' || !Number.isFinite(h)) return null
    return { visibility: vis, userHeight: h }
  } catch { return null }
}

function writeStored(projectId: string, v: StoredPanel): void {
  try { localStorage.setItem(storageKey(projectId), JSON.stringify(v)) } catch { /* ignore */ }
}

function initialProjectState(stored: StoredPanel | null): ProjectPanelState {
  return {
    visibility: stored?.visibility ?? 'hidden',
    userHeight: stored?.userHeight ?? DEFAULT_USER_HEIGHT,
    sessions: [],
    activeId: null,
  }
}

// ─── Hidden host for detached xterm containers ────────────────────────────────

function ensureTerminalHost(): HTMLDivElement {
  let host = document.getElementById('specrails-terminal-host') as HTMLDivElement | null
  if (host) return host
  host = document.createElement('div')
  host.id = 'specrails-terminal-host'
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = '0'
  host.style.height = '0'
  host.style.overflow = 'hidden'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)
  return host
}

// ─── xterm theme (Dracula-ish to match app) ────────────────────────────────────

const XTERM_THEME = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode
  /** Active project ID from HubProvider — used to focus panel on Cmd+J. */
  activeProjectId: string | null
}

export function TerminalsProvider({ children, activeProjectId }: ProviderProps) {
  const [states, setStates] = useState<Record<string, ProjectPanelState>>({})
  const statesRef = useRef(states)
  statesRef.current = states

  // Map of sessionId → xterm handle. Persists across project switches.
  const xtermHandles = useRef<Map<string, XtermHandle>>(new Map())
  // Map of sessionId → projectId. Needed to find owner on project-removal cleanup.
  const sessionOwners = useRef<Map<string, string>>(new Map())

  const hostRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    hostRef.current = ensureTerminalHost()
    return () => {
      // On unmount (rare): dispose everything
      for (const handle of xtermHandles.current.values()) disposeHandle(handle)
      xtermHandles.current.clear()
      sessionOwners.current.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Mutators ─────────────────────────────────────────────────────────────

  const updateProject = useCallback((projectId: string, fn: (p: ProjectPanelState) => ProjectPanelState) => {
    setStates((prev) => {
      const cur = prev[projectId] ?? initialProjectState(readStored(projectId))
      const next = fn(cur)
      if (next === cur) return prev
      if (next.visibility !== cur.visibility || next.userHeight !== cur.userHeight) {
        writeStored(projectId, { visibility: next.visibility, userHeight: next.userHeight })
      }
      return { ...prev, [projectId]: next }
    })
  }, [])

  const ensureProject = useCallback((projectId: string) => {
    setStates((prev) => {
      if (prev[projectId]) return prev
      return { ...prev, [projectId]: initialProjectState(readStored(projectId)) }
    })
  }, [])

  const getState = useCallback((projectId: string): ProjectPanelState => {
    return statesRef.current[projectId] ?? initialProjectState(readStored(projectId))
  }, [])

  const setVisibility = useCallback((projectId: string, v: PanelVisibility) => {
    updateProject(projectId, (s) => (s.visibility === v ? s : { ...s, visibility: v }))
  }, [updateProject])

  const togglePanel = useCallback((projectId: string) => {
    updateProject(projectId, (s) => ({
      ...s,
      visibility: s.visibility === 'hidden' ? 'restored' : 'hidden',
    }))
  }, [updateProject])

  const setUserHeight = useCallback((projectId: string, h: number) => {
    updateProject(projectId, (s) => (s.userHeight === h ? s : { ...s, userHeight: h }))
  }, [updateProject])

  const setActive = useCallback((projectId: string, id: string) => {
    updateProject(projectId, (s) => (s.activeId === id ? s : { ...s, activeId: id }))
  }, [updateProject])

  // ─── Sync with server on project focus ─────────────────────────────────────

  const activeProjectRef = useRef<string | null>(activeProjectId)
  activeProjectRef.current = activeProjectId

  useEffect(() => {
    if (!activeProjectId) return
    ensureProject(activeProjectId)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/projects/${activeProjectId}/terminals`)
        if (!res.ok) return
        const body = await res.json() as { sessions: TerminalRef[]; limit: number }
        if (cancelled) return
        updateProject(activeProjectId, (s) => {
          const serverIds = new Set(body.sessions.map((r) => r.id))
          // Drop local refs the server no longer knows about (server restart scenario)
          for (const id of s.sessions.map((r) => r.id)) {
            if (!serverIds.has(id)) {
              const h = xtermHandles.current.get(id)
              if (h) { disposeHandle(h); xtermHandles.current.delete(id); sessionOwners.current.delete(id) }
            }
          }
          // Merge: server is authoritative for existence; keep client-side name if we have it
          const merged: TerminalRef[] = body.sessions.map((srv) => {
            const local = s.sessions.find((l) => l.id === srv.id)
            if (local) return { ...local, ...srv }
            return srv
          })
          const activeId = merged.find((m) => m.id === s.activeId)?.id ?? merged[0]?.id ?? null
          // Prewarm xterm for each known session so switching is instant
          for (const m of merged) {
            if (!xtermHandles.current.has(m.id)) {
              ensureXtermForSession(m.projectId, m.id, m.cols, m.rows, xtermHandles.current, sessionOwners.current, hostRef.current)
            }
          }
          return { ...s, sessions: merged, activeId }
        })
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [activeProjectId, ensureProject, updateProject])

  // ─── Actions: create/rename/kill ───────────────────────────────────────────

  const create = useCallback(async (projectId: string, opts?: { cols?: number; rows?: number }): Promise<TerminalRef | null> => {
    const cols = opts?.cols ?? 80
    const rows = opts?.rows ?? 24
    try {
      const res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/terminals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      })
      if (!res.ok) return null
      const body = await res.json() as { session: TerminalRef }
      const session = body.session
      // Bootstrap xterm + WS
      ensureXtermForSession(projectId, session.id, session.cols, session.rows, xtermHandles.current, sessionOwners.current, hostRef.current)
      updateProject(projectId, (s) => ({
        ...s,
        sessions: [...s.sessions, session],
        activeId: session.id,
      }))
      return session
    } catch { return null }
  }, [updateProject])

  const rename = useCallback(async (projectId: string, id: string, name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/terminals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return false
      const body = await res.json() as { session: TerminalRef }
      updateProject(projectId, (s) => ({
        ...s,
        sessions: s.sessions.map((r) => (r.id === id ? { ...r, name: body.session.name } : r)),
      }))
      return true
    } catch { return false }
  }, [updateProject])

  const kill = useCallback(async (projectId: string, id: string): Promise<void> => {
    // Optimistic: dispose xterm + remove ref
    const h = xtermHandles.current.get(id)
    if (h) { disposeHandle(h); xtermHandles.current.delete(id); sessionOwners.current.delete(id) }
    updateProject(projectId, (s) => {
      const remaining = s.sessions.filter((r) => r.id !== id)
      const activeId = s.activeId === id ? (remaining[0]?.id ?? null) : s.activeId
      return { ...s, sessions: remaining, activeId }
    })
    try {
      await fetch(`${API_ORIGIN}/api/projects/${projectId}/terminals/${id}`, { method: 'DELETE' })
    } catch { /* best effort — state already removed locally */ }
  }, [updateProject])

  const focusActive = useCallback((projectId: string) => {
    const s = statesRef.current[projectId]
    if (!s?.activeId) return
    const h = xtermHandles.current.get(s.activeId)
    if (h?.attached) {
      try { h.term.focus() } catch { /* ignore */ }
    }
  }, [])

  const disposeProject = useCallback((projectId: string) => {
    // Called when a project is removed from the hub
    for (const [sid, owner] of sessionOwners.current.entries()) {
      if (owner !== projectId) continue
      const h = xtermHandles.current.get(sid)
      if (h) { disposeHandle(h); xtermHandles.current.delete(sid) }
      sessionOwners.current.delete(sid)
    }
    setStates((prev) => {
      if (!prev[projectId]) return prev
      const { [projectId]: _drop, ...rest } = prev
      void _drop
      return rest
    })
    try { localStorage.removeItem(storageKey(projectId)) } catch { /* ignore */ }
  }, [])

  const getContainer = useCallback((sessionId: string): HTMLDivElement | null => {
    const h = xtermHandles.current.get(sessionId)
    return h?.container ?? null
  }, [])

  const notifyAdopted = useCallback((sessionId: string) => {
    const h = xtermHandles.current.get(sessionId)
    if (!h) return
    h.attached = true
    // Open xterm if not yet opened
    if (!h.term.element || h.term.element.parentElement !== h.container) {
      try { h.term.open(h.container) } catch { /* ignore */ }
    }
    try { h.fit.fit() } catch { /* ignore */ }
    try { h.term.focus() } catch { /* ignore */ }
    // Send resize to server based on the fit result
    const cols = h.term.cols, rows = h.term.rows
    if (h.ws && h.ws.readyState === WebSocket.OPEN) {
      try { h.ws.send(JSON.stringify({ type: 'resize', cols, rows })) } catch { /* ignore */ }
    }
  }, [])

  const value = useMemo<TerminalsContextValue>(() => ({
    states,
    getState, ensureProject, setVisibility, togglePanel, setUserHeight,
    setActive, create, rename, kill, focusActive, disposeProject,
    getContainer, notifyAdopted,
  }), [states, getState, ensureProject, setVisibility, togglePanel, setUserHeight, setActive, create, rename, kill, focusActive, disposeProject, getContainer, notifyAdopted])

  return <TerminalsContext.Provider value={value}>{children}</TerminalsContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const NOOP_CONTEXT: TerminalsContextValue = {
  states: {},
  getState: (_id: string) => initialProjectState(null),
  ensureProject: () => {},
  setVisibility: () => {},
  togglePanel: () => {},
  setUserHeight: () => {},
  setActive: () => {},
  create: async () => null,
  rename: async () => false,
  kill: async () => {},
  focusActive: () => {},
  disposeProject: () => {},
  getContainer: () => null,
  notifyAdopted: () => {},
}

/**
 * Returns the terminal context. If called outside a TerminalsProvider (e.g. from
 * legacy mode or test harnesses that don't need terminal behavior), returns a
 * no-op implementation so callers don't crash.
 */
export function useTerminals(): TerminalsContextValue {
  const ctx = useContext(TerminalsContext)
  return ctx ?? NOOP_CONTEXT
}

export function useProjectTerminals(projectId: string | null | undefined): ProjectPanelState {
  const ctx = useTerminals()
  if (!projectId) return initialProjectState(null)
  return ctx.states[projectId] ?? initialProjectState(readStored(projectId))
}

// ─── xterm + WS bootstrap (exported for tests) ────────────────────────────────

function ensureXtermForSession(
  projectId: string,
  sessionId: string,
  cols: number,
  rows: number,
  handles: Map<string, XtermHandle>,
  owners: Map<string, string>,
  host: HTMLDivElement | null,
): XtermHandle {
  const existing = handles.get(sessionId)
  if (existing) return existing

  const container = document.createElement('div')
  container.style.width = '100%'
  container.style.height = '100%'
  container.className = 'specrails-xterm-container'

  const term = new Terminal({
    cols, rows,
    fontFamily: "'DM Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    fontSize: 12,
    theme: XTERM_THEME,
    cursorBlink: true,
    scrollback: 10_000,
    allowProposedApi: true,
  })
  const fit = new FitAddon()
  const webLinks = new WebLinksAddon()
  term.loadAddon(fit)
  term.loadAddon(webLinks)

  if (host) host.appendChild(container)

  const token = getHubToken()
  // Use WS_URL (not window.location) — the vite dev server runs on 4201 without
  // WS proxying, while the Express server (real PTY endpoint) lives on 4200.
  // WS_URL already handles dev / production browser / Tauri cases.
  const wsBase = WS_URL || (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:4200')
  const wsUrl = `${wsBase}/ws/terminal/${sessionId}?token=${encodeURIComponent(token ?? '')}&projectId=${encodeURIComponent(projectId)}`

  const ws = new WebSocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  const disposers: Array<() => void> = []

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      // Control frame
      try {
        const msg = JSON.parse(ev.data) as { type?: string; name?: string }
        if (msg?.type === 'ready') {
          // nothing to do — we already allocated xterm
        }
        // Rename broadcasts handled by server; client listener could wire into state
      } catch { /* ignore */ }
      return
    }
    // Binary frame (scrollback or live)
    const buf = new Uint8Array(ev.data as ArrayBuffer)
    try { term.write(buf) } catch { /* ignore */ }
  }

  ws.onclose = () => {
    // Session ended on server (kill or exit). Don't reopen automatically;
    // panel state will reconcile on next project focus.
  }

  // Forward user input to the server as binary
  const onDataSub = term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(new TextEncoder().encode(data)) } catch { /* ignore */ }
    }
  })
  disposers.push(() => onDataSub.dispose())

  // Propagate container resizes to the PTY (throttled ~50ms via rAF-ish)
  let resizeScheduled = false
  const ro = new ResizeObserver(() => {
    if (resizeScheduled) return
    resizeScheduled = true
    requestAnimationFrame(() => {
      resizeScheduled = false
      if (!container.isConnected) return
      try { fit.fit() } catch { return }
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })) } catch { /* ignore */ }
      }
    })
  })
  ro.observe(container)
  disposers.push(() => ro.disconnect())

  const handle: XtermHandle = { term, fit, webLinks, container, ws, attached: false, disposers }
  handles.set(sessionId, handle)
  owners.set(sessionId, projectId)
  return handle
}

function disposeHandle(handle: XtermHandle): void {
  for (const d of handle.disposers) { try { d() } catch { /* ignore */ } }
  handle.disposers = []
  try { handle.ws?.close(1000, 'client_dispose') } catch { /* ignore */ }
  handle.ws = null
  try { handle.term.dispose() } catch { /* ignore */ }
  try { handle.container.remove() } catch { /* ignore */ }
}
