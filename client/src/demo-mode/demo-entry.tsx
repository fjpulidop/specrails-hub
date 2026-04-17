/**
 * Demo entry point — replaces main.tsx for the static demo build.
 *
 * Boots the app in read-only demo mode:
 * - Patches window.fetch to return static fixtures (no backend needed)
 * - Mocks WebSocket so SharedWebSocketProvider connects silently
 * - Skips token-based auth entirely
 * - Listens for postMessage from parent (specrails-web HubShowcase) for navigation
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '../globals.css'
import './tour/tour.css'
import App from '../App'
import { installDemoFetchInterceptor, DEMO_PROJECT } from './demo-api'
import { demoJobs } from './fixtures/jobs'
import { TourCursor, TourOverlay, startTour } from './tour'

// ─── 1. Install demo fetch interceptor ──────────────────────────────────────

installDemoFetchInterceptor()

// ─── Clean localStorage + force dashboard route ─────────────────────────────
// Prior demo runs may have persisted a saved route (e.g. /jobs from when a
// viewer clicked around in an earlier build), the last-active project id,
// spec ordering, sidebar pin state, etc. None of that should survive across
// demo loads — the demo must always open on the dashboard with a stable
// layout.
try {
  localStorage.removeItem('specrails-hub:routeMemory')
  localStorage.removeItem('specrails-hub:activeProjectId')
  // Clear any spec-order keys from previous runs
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key && key.startsWith('specrails-hub:spec-order:')) {
      localStorage.removeItem(key)
    }
  }
  localStorage.setItem('specrails-hub:onboarding-dismissed', 'true')
} catch {
  // no-op (private mode, etc.)
}

// HashRouter: force the hash to "/" even if the URL landed on /#jobs etc.
if (typeof window !== 'undefined') {
  const hash = window.location.hash
  if (hash && hash !== '#' && hash !== '#/') {
    window.location.hash = '/'
  }
}

// ─── 2. Mock WebSocket ──────────────────────────────────────────────────────

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  protocol = ''
  extensions = ''
  bufferedAmount = 0
  binaryType: BinaryType = 'blob'

  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map()

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = typeof url === 'string' ? url : url.href

    // Simulate async open + init message
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      const openEvent = new Event('open')
      this.onopen?.(openEvent)
      this._dispatch('open', openEvent)

      // Send an 'init' message with demo pipeline state so usePipeline works
      const initMsg = {
        type: 'init',
        projectName: 'my-saas-app',
        phaseDefinitions: [
          { key: 'architect', label: 'Architect', description: 'Design the solution' },
          { key: 'develop', label: 'Develop', description: 'Implement the code' },
          { key: 'review', label: 'Review', description: 'Review the changes' },
          { key: 'ship', label: 'Ship', description: 'Deploy to production' },
        ],
        phases: { architect: 'done', develop: 'running', review: 'idle', ship: 'idle' },
        recentJobs: demoJobs,
        queue: { jobs: [], activeJobId: null, paused: false },
        logBuffer: [],
      }
      const msgEvent = new MessageEvent('message', { data: JSON.stringify(initMsg) })
      this.onmessage?.(msgEvent)
      this._dispatch('message', msgEvent)

      // Send a 'hub.projects' message so HubProvider auto-selects the demo
      // project. Without this, activeProjectId stays null and useTickets /
      // useRails never fire, which is why the Specs column appeared empty.
      const hubMsg = {
        type: 'hub.projects',
        projects: [DEMO_PROJECT],
      }
      const hubEvent = new MessageEvent('message', { data: JSON.stringify(hubMsg) })
      this.onmessage?.(hubEvent)
      this._dispatch('message', hubEvent)
    }, 50)
  }

  send(_data: string | ArrayBuffer | Blob | ArrayBufferView) {
    // no-op in demo
  }

  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set())
    this._listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this._listeners.get(type)?.delete(listener)
  }

  dispatchEvent(_event: Event): boolean {
    return true
  }

  private _dispatch(type: string, event: Event) {
    this._listeners.get(type)?.forEach((fn) => {
      if (typeof fn === 'function') fn(event)
      else fn.handleEvent(event)
    })
  }
}

// Replace the global WebSocket constructor
;(window as unknown as Record<string, unknown>).WebSocket = MockWebSocket

// ─── 3. PostMessage listener for parent navigation ──────────────────────────

// The parent HubShowcase component sends { type: 'navigate', route: '/analytics' }
// via postMessage. We listen and use the React Router navigate function.
// Since we can't call useNavigate outside React, we store a setter that
// the NavigationBridge component will register.

let _navigateFn: ((path: string) => void) | null = null

export function setDemoNavigate(fn: (path: string) => void) {
  _navigateFn = fn
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: string; route?: string } | null
  if (data?.type === 'navigate' && typeof data.route === 'string') {
    _navigateFn?.(data.route)
  }
})

// ─── 4. Navigation bridge component ────────────────────────────────────────

import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

function NavigationBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    setDemoNavigate((path) => navigate(path))
    return () => { _navigateFn = null }
  }, [navigate])
  return null
}

// ─── 5. Mount ───────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <NavigationBridge />
      <App />
      <TourOverlay />
      <TourCursor />
    </HashRouter>
  </StrictMode>,
)

// Start the scripted tour after the React tree has had a beat to hydrate.
// requestIdleCallback lets layout settle before the orchestrator starts
// resolving selectors.
type IdleCallback = (cb: () => void, opts?: { timeout?: number }) => number
const ric: IdleCallback =
  ((window as unknown as { requestIdleCallback?: IdleCallback })
    .requestIdleCallback ??
    ((cb: () => void) => window.setTimeout(cb, 400))) as IdleCallback

ric(() => startTour(), { timeout: 1500 })
