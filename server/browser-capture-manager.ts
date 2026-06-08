import os from 'os'
import path from 'path'
import { newId } from './ids'
import type { DbInstance } from './db'
import type { WsMessage } from './types'
import type { Attachment } from './ticket-store'
import { attachmentManager as defaultAttachmentManager, type AttachmentManager } from './attachment-manager'
import {
  BrowserLimitExceededError,
  BrowserLaunchError,
  type BrowserContextHandle,
  type BrowserInputEvent,
  type BrowserPageHandle,
  type BrowserSessionMeta,
  type CaptureRect,
  type CapturedDom,
  type ContextLauncher,
  type ElementProbe,
} from './browser-capture-types'
import { createPlaywrightLauncher } from './browser-playwright'

const WS_OPEN = 1
const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

/** Playwright throws this family when the page/context/browser died underneath an
 *  operation (server restart in dev, page crash, tab closed). */
function isTargetClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /target page, context or browser has been closed|target closed|has been closed/i.test(msg)
}
const MAX_SESSIONS_PER_PROJECT = 4
const DOM_HTML_BYTE_CAP = 100_000
const LAST_URL_KEY = 'config.browser_last_url'

/** A minimal structural view of a `ws` WebSocket — keeps the manager decoupled
 *  from the `ws` package so tests can pass plain fakes. */
export interface BrowserWsClient {
  readyState: number
  send(data: string | Buffer): void
  close(code?: number, reason?: string): void
}

interface BrowserSession {
  id: string
  projectId: string
  page: BrowserPageHandle
  clients: Set<BrowserWsClient>
  lastFrame: Buffer | null
  url: string | null
  title: string | null
  viewport: { width: number; height: number }
  createdAt: number
  screencasting: boolean
  /** Desired screencast state; transitions are serialised via `screencastOp`. */
  screencastDesired: boolean
  screencastOp: Promise<void> | null
  closed: boolean
}

export interface CaptureResult {
  screenshot: Attachment
  domAttachment: Attachment
  dom: CapturedDom
  /** Inline preview of the screenshot so the client can render a thumbnail
   *  without a second authenticated request (an <img src> to the attachment GET
   *  endpoint would omit the X-Hub-Token header and 401). */
  screenshotDataUrl: string
}

export interface BrowserCaptureManagerOptions {
  projectId: string
  projectSlug: string
  db: DbInstance
  broadcast?: (msg: WsMessage) => void
  /** Injectable for tests — defaults to the real Playwright launcher. */
  launcher?: ContextLauncher
  /** Injectable for tests — defaults to the shared AttachmentManager. */
  attachments?: AttachmentManager
  /** Override the persistent-profile dir (tests). */
  profileDir?: string
  homeDir?: string
}

/**
 * Per-project owner of an embedded Chromium browser used by the "Add Spec from
 * browser" feature. Holds ONE persistent Playwright context (cookies/login survive
 * restarts) keyed to `~/.specrails/projects/<slug>/browser-profile/`, with one page
 * per session. Screencast frames + control go over the dedicated `/ws/browser/:id`
 * socket; region capture (screenshot + rich DOM) is a REST call that persists both
 * artifacts as attachments so they ride the existing Add-Spec attachment pipeline.
 *
 * All Playwright contact is behind the injected `ContextLauncher`, so the class is
 * fully unit-testable with a fake launcher (no real browser).
 */
export class BrowserCaptureManager {
  private readonly projectId: string
  private readonly projectSlug: string
  private readonly db: DbInstance
  private readonly broadcast?: (msg: WsMessage) => void
  private readonly launcher: ContextLauncher
  private readonly attachments: AttachmentManager
  private readonly profileDir: string

  private context: BrowserContextHandle | null = null
  private contextPromise: Promise<BrowserContextHandle> | null = null
  private readonly sessions = new Map<string, BrowserSession>()
  private disposed = false

  constructor(opts: BrowserCaptureManagerOptions) {
    this.projectId = opts.projectId
    this.projectSlug = opts.projectSlug
    this.db = opts.db
    this.broadcast = opts.broadcast
    this.launcher = opts.launcher ?? createPlaywrightLauncher()
    this.attachments = opts.attachments ?? defaultAttachmentManager
    this.profileDir =
      opts.profileDir ??
      path.join(opts.homeDir ?? os.homedir(), '.specrails', 'projects', opts.projectSlug, 'browser-profile')
  }

  // ─── Last-URL persistence (reuses the queue_state key/value table) ───────────

  getLastUrl(): string | null {
    try {
      const row = this.db.prepare('SELECT value FROM queue_state WHERE key = ?').get(LAST_URL_KEY) as
        | { value: string }
        | undefined
      return row?.value ?? null
    } catch {
      return null
    }
  }

  private setLastUrl(url: string): void {
    try {
      this.db.prepare('INSERT OR REPLACE INTO queue_state (key, value) VALUES (?, ?)').run(LAST_URL_KEY, url)
    } catch {
      /* non-fatal */
    }
  }

  // ─── Context lifecycle ──────────────────────────────────────────────────────

  private async ensureContext(): Promise<BrowserContextHandle> {
    if (this.disposed) throw new BrowserLaunchError('manager disposed')
    if (this.context) return this.context
    if (this.contextPromise) return this.contextPromise
    this.contextPromise = (async () => {
      try {
        const ctx = await this.launcher({
          userDataDir: this.profileDir,
          viewport: DEFAULT_VIEWPORT,
        })
        this.context = ctx
        return ctx
      } catch (err) {
        this.contextPromise = null
        throw new BrowserLaunchError('failed to launch browser', err)
      }
    })()
    return this.contextPromise
  }

  // ─── Session CRUD ───────────────────────────────────────────────────────────

  private toMeta(s: BrowserSession): BrowserSessionMeta {
    return {
      id: s.id,
      projectId: s.projectId,
      url: s.url,
      title: s.title,
      viewportWidth: s.viewport.width,
      viewportHeight: s.viewport.height,
      createdAt: s.createdAt,
    }
  }

  listSessions(): BrowserSessionMeta[] {
    return [...this.sessions.values()].filter((s) => !s.closed).map((s) => this.toMeta(s))
  }

  getSession(sessionId: string): BrowserSession | undefined {
    const s = this.sessions.get(sessionId)
    return s && !s.closed ? s : undefined
  }

  async create(opts?: { initialUrl?: string; createdAtMs?: number }): Promise<BrowserSessionMeta> {
    const live = [...this.sessions.values()].filter((s) => !s.closed)
    if (live.length >= MAX_SESSIONS_PER_PROJECT) {
      throw new BrowserLimitExceededError(MAX_SESSIONS_PER_PROJECT)
    }
    const ctx = await this.ensureContext()
    const page = await ctx.newPage()
    const id = newId()
    const session: BrowserSession = {
      id,
      projectId: this.projectId,
      page,
      clients: new Set(),
      lastFrame: null,
      url: null,
      title: null,
      viewport: { ...DEFAULT_VIEWPORT },
      createdAt: opts?.createdAtMs ?? this.now(),
      screencasting: false,
      screencastDesired: false,
      screencastOp: null,
      closed: false,
    }
    this.sessions.set(id, session)

    const target = opts?.initialUrl?.trim() || this.getLastUrl() || 'about:blank'
    const result = await page.goto(target)
    session.url = result.url
    session.title = result.title
    if (result.url && result.url !== 'about:blank') this.setLastUrl(result.url)
    return this.toMeta(session)
  }

  // ─── WS attach / detach + screencast fan-out ────────────────────────────────

  async attach(sessionId: string, ws: BrowserWsClient): Promise<BrowserSessionMeta | null> {
    if (this.disposed) return null
    const s = this.getSession(sessionId)
    if (!s) return null
    s.clients.add(ws)
    this.safeSend(ws, JSON.stringify({ type: 'ready', id: s.id, url: s.url, title: s.title, viewport: s.viewport }))
    if (s.lastFrame) this.safeSend(ws, s.lastFrame)
    s.screencastDesired = true
    await this.applyScreencast(s)
    return this.toMeta(s)
  }

  detach(sessionId: string, ws: BrowserWsClient): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.clients.delete(ws)
    if (s.clients.size === 0 && !s.closed) {
      s.screencastDesired = false
      void this.applyScreencast(s)
    }
  }

  /**
   * Serialise screencast start/stop transitions on a per-session promise chain so
   * a rapid detach→attach (stop fired async, then start) can't double-initialise
   * the CDP screencast. The chain always reconciles `screencasting` to
   * `screencastDesired`.
   */
  private applyScreencast(s: BrowserSession): Promise<void> {
    const prev = s.screencastOp ?? Promise.resolve()
    s.screencastOp = prev.then(async () => {
      if (s.closed) {
        if (s.screencasting) {
          s.screencasting = false
          try { await s.page.stopScreencast() } catch { /* ignore */ }
        }
        return
      }
      if (s.screencastDesired && !s.screencasting) {
        s.screencasting = true
        await s.page.startScreencast((frame) => {
          if (s.closed) return
          s.lastFrame = frame.data
          for (const client of s.clients) {
            if (client.readyState === WS_OPEN) {
              try { client.send(frame.data) } catch { /* drop */ }
            }
          }
        })
      } else if (!s.screencastDesired && s.screencasting) {
        s.screencasting = false
        try { await s.page.stopScreencast() } catch { /* ignore */ }
      }
    }).catch(() => { /* never let a screencast transition reject the chain */ })
    return s.screencastOp
  }

  private safeSend(ws: BrowserWsClient, data: string | Buffer): void {
    if (ws.readyState !== WS_OPEN) return
    try { ws.send(data) } catch { /* drop */ }
  }

  private broadcastControl(s: BrowserSession, msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg)
    for (const client of s.clients) this.safeSend(client, data)
  }

  // ─── Interactions ───────────────────────────────────────────────────────────

  async probeElement(sessionId: string, point: { x: number; y: number }): Promise<ElementProbe | null> {
    if (this.disposed) return null
    const s = this.getSession(sessionId)
    if (!s) return null
    return s.page.probeElementAt(point)
  }

  async handleInput(sessionId: string, event: BrowserInputEvent): Promise<void> {
    if (this.disposed) return
    const s = this.getSession(sessionId)
    if (!s) return
    if (event.type === 'resize') {
      s.viewport = {
        width: Math.max(1, Math.round(event.width)),
        height: Math.max(1, Math.round(event.height)),
      }
    }
    await s.page.dispatchInput(event)
  }

  async navigate(sessionId: string, action: 'goto' | 'back' | 'forward' | 'reload', url?: string): Promise<{ url: string; title: string } | null> {
    if (this.disposed) return null
    const s = this.getSession(sessionId)
    if (!s) return null
    let result: { url: string; title: string }
    if (action === 'goto') result = await s.page.goto(url ?? 'about:blank')
    else if (action === 'back') result = await s.page.goBack()
    else if (action === 'forward') result = await s.page.goForward()
    else result = await s.page.reload()
    s.url = result.url
    s.title = result.title
    if (result.url && result.url !== 'about:blank') this.setLastUrl(result.url)
    this.broadcastControl(s, { type: 'nav', url: result.url, title: result.title })
    return result
  }

  // ─── Capture: screenshot + rich DOM → attachments ───────────────────────────

  async capture(sessionId: string, rect: CaptureRect, pendingSpecId: string): Promise<CaptureResult | null> {
    if (this.disposed) return null
    const s = this.getSession(sessionId)
    if (!s) return null
    const safeRect: CaptureRect = {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    }
    let png: Buffer
    let dom: CapturedDom
    try {
      ;[png, dom] = await Promise.all([
        s.page.screenshotClip(safeRect),
        s.page.extractDom(safeRect, DOM_HTML_BYTE_CAP),
      ])
    } catch (err) {
      // The page/context can vanish mid-capture (the dev server restarting,
      // a page crash, the tab being closed). Treat a closed target as a gone
      // session — tear it down and return null (→ 404) instead of a 500 stack.
      if (isTargetClosedError(err)) {
        await this.kill(sessionId)
        return null
      }
      throw err
    }

    const stamp = this.now()
    const screenshot = await this.attachments.upload({
      slug: this.projectSlug,
      ticketKey: pendingSpecId,
      projectPath: null,
      file: {
        buffer: png,
        originalname: `screen-capture-${stamp}.png`,
        mimetype: 'image/png',
        size: png.length,
      },
    })
    const domJson = Buffer.from(JSON.stringify(dom, null, 2), 'utf-8')
    const domAttachment = await this.attachments.upload({
      slug: this.projectSlug,
      ticketKey: pendingSpecId,
      projectPath: null,
      file: {
        buffer: domJson,
        originalname: `page-dom-${stamp}.json`,
        mimetype: 'application/json',
        size: domJson.length,
      },
    })
    return { screenshot, domAttachment, dom, screenshotDataUrl: `data:image/png;base64,${png.toString('base64')}` }
  }

  // ─── Teardown ───────────────────────────────────────────────────────────────

  async kill(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    this.sessions.delete(sessionId)
    if (s.closed) return false
    s.closed = true
    s.screencastDesired = false
    for (const client of s.clients) {
      try { client.close(1000, 'session_closed') } catch { /* ignore */ }
    }
    s.clients.clear()
    try { await s.page.close() } catch { /* ignore */ }
    // NOTE: the persistent Chromium context is deliberately kept alive here even
    // when no sessions remain. Closing it on last-session-kill raced with React
    // StrictMode's mount→unmount→mount in dev: the throwaway first session is
    // killed (sessionCount→0 → context closed) WHILE the real second session is
    // still launching in that same context, breaking it. The context is closed
    // on manager.shutdown() / project removal instead — one idle headless browser
    // per project after use is an acceptable cost.
    return true
  }

  async shutdown(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const s of [...this.sessions.values()]) {
      s.closed = true
      for (const client of s.clients) {
        try { client.close(1000, 'shutdown') } catch { /* ignore */ }
      }
      s.clients.clear()
      try { await s.page.close() } catch { /* ignore */ }
    }
    this.sessions.clear()
    // Resolve the context even if its launch was still in flight when shutdown
    // raced in — otherwise a pending contextPromise settles after we exit and
    // leaks a headless Chromium that nothing will ever close.
    let ctx = this.context
    if (!ctx && this.contextPromise) {
      try { ctx = await this.contextPromise } catch { ctx = null }
    }
    if (ctx) {
      try { await ctx.close() } catch { /* ignore */ }
    }
    this.context = null
    this.contextPromise = null
  }

  sessionCount(): number {
    return [...this.sessions.values()].filter((s) => !s.closed).length
  }

  // Wall-clock indirection so tests can stay deterministic if needed.
  private now(): number {
    return Date.now()
  }
}
