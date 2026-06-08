import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, type DbInstance } from './db'
import { BrowserCaptureManager, type BrowserWsClient } from './browser-capture-manager'
import {
  BrowserLimitExceededError,
  BrowserLaunchError,
  type BrowserContextHandle,
  type BrowserPageHandle,
  type CapturedDom,
  type CapturedNetworkRequest,
  type ContextLauncher,
  type ScreencastFrame,
} from './browser-capture-types'
import type { Attachment } from './ticket-store'

// ─── Fakes ────────────────────────────────────────────────────────────────────

function makeDom(): CapturedDom {
  return {
    url: 'https://example.com',
    title: 'Example',
    viewport: { width: 1280, height: 800 },
    rect: { x: 0, y: 0, width: 10, height: 10 },
    html: '<button>Hi</button>',
    htmlTruncated: false,
    css: '.x{color:red}',
    cssTruncated: false,
    nodes: [{ tag: 'button', role: 'button', text: 'Hi', rect: { x: 0, y: 0, width: 10, height: 10 }, attributes: {}, styles: {} }],
    capturedAt: '2026-06-07T00:00:00.000Z',
  }
}

class FakePage implements BrowserPageHandle {
  url = 'about:blank'
  title = ''
  calls: string[] = []
  inputs: unknown[] = []
  frameCb: ((f: ScreencastFrame) => void) | null = null
  screencasting = false
  closed = false
  nextNav: { url: string; title: string } | null = null
  enabledNetwork = false
  network: CapturedNetworkRequest[] = []

  private nav(): { url: string; title: string } {
    if (this.nextNav) { this.url = this.nextNav.url; this.title = this.nextNav.title }
    return { url: this.url, title: this.title }
  }
  async goto(url: string) { this.calls.push(`goto:${url}`); if (!this.nextNav) { this.url = url; this.title = url === 'about:blank' ? '' : 'T' } ; return this.nav() }
  async goBack() { this.calls.push('back'); return this.nav() }
  async goForward() { this.calls.push('forward'); return this.nav() }
  async reload() { this.calls.push('reload'); return this.nav() }
  currentUrl() { return this.url }
  async currentTitle() { return this.title }
  async setViewport(w: number, h: number) { this.calls.push(`viewport:${w}x${h}`) }
  async dispatchInput(e: unknown) { this.inputs.push(e) }
  async startScreencast(cb: (f: ScreencastFrame) => void) { this.screencasting = true; this.frameCb = cb }
  async stopScreencast() { this.screencasting = false; this.frameCb = null }
  async screenshotClip() { return Buffer.from('PNGDATA') }
  async extractDom() { return makeDom() }
  async probeElementAt(point: { x: number; y: number }) { return { rect: { x: point.x, y: point.y, width: 50, height: 20 }, tag: 'div' } }
  async enableNetwork() { this.enabledNetwork = true }
  recentNetwork() { return this.network }
  async close() { this.closed = true }
  emitFrame(data: Buffer) { this.frameCb?.({ data, width: 1280, height: 800 }) }
}

class FakeContext implements BrowserContextHandle {
  pages: FakePage[] = []
  closed = false
  async newPage() { const p = new FakePage(); this.pages.push(p); return p }
  async close() { this.closed = true }
}

function makeAttachments() {
  const uploads: Array<{ ticketKey: string | number; mime: string; name: string }> = []
  return {
    uploads,
    upload: vi.fn(async (opts: { slug: string; ticketKey: string | number; projectPath: string | null; file: { buffer: Buffer; originalname: string; mimetype: string; size: number } }): Promise<Attachment> => {
      uploads.push({ ticketKey: opts.ticketKey, mime: opts.file.mimetype, name: opts.file.originalname })
      return {
        id: `att-${uploads.length}`,
        filename: opts.file.originalname,
        storedName: opts.file.originalname,
        mimeType: opts.file.mimetype,
        size: opts.file.size,
        addedAt: '2026-06-07T00:00:00.000Z',
      }
    }),
  }
}

function makeWs(): BrowserWsClient & { sent: Array<string | Buffer>; closed: boolean } {
  return {
    readyState: 1,
    sent: [],
    closed: false,
    send(d: string | Buffer) { this.sent.push(d) },
    close() { this.closed = true },
  } as BrowserWsClient & { sent: Array<string | Buffer>; closed: boolean }
}

function makeManager(opts: { launcher?: ContextLauncher; db?: DbInstance; attachments?: ReturnType<typeof makeAttachments> } = {}) {
  const db = opts.db ?? initDb(':memory:')
  const ctx = new FakeContext()
  const launcher: ContextLauncher = opts.launcher ?? vi.fn(async () => ctx)
  const attachments = opts.attachments ?? makeAttachments()
  const broadcast = vi.fn()
  const mgr = new BrowserCaptureManager({
    projectId: 'proj-1',
    projectSlug: 'proj',
    db,
    broadcast,
    launcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachments: attachments as any,
    profileDir: '/tmp/profile',
  })
  return { mgr, db, ctx, launcher, attachments, broadcast }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BrowserCaptureManager', () => {
  let db: DbInstance
  beforeEach(() => { db = initDb(':memory:') })

  it('creates a session navigating to about:blank with default viewport', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    expect(meta.projectId).toBe('proj-1')
    expect(meta.viewportWidth).toBe(1280)
    expect(meta.viewportHeight).toBe(800)
    expect(ctx.pages).toHaveLength(1)
    expect(ctx.pages[0].calls).toContain('goto:about:blank')
    expect(mgr.sessionCount()).toBe(1)
  })

  it('navigates to initialUrl and persists it as the last URL', async () => {
    const { mgr } = makeManager({ db })
    const ctxPage = () => undefined
    void ctxPage
    const meta = await mgr.create({ initialUrl: 'https://example.com' })
    expect(meta.url).toBe('https://example.com')
    expect(mgr.getLastUrl()).toBe('https://example.com')
  })

  it('reuses the persisted last URL on a fresh session', async () => {
    db.prepare('INSERT OR REPLACE INTO queue_state (key, value) VALUES (?, ?)').run('config.browser_last_url', 'https://saved.dev')
    const { mgr, ctx } = makeManager({ db })
    await mgr.create()
    expect(ctx.pages[0].calls).toContain('goto:https://saved.dev')
  })

  it('does not persist about:blank as last URL', async () => {
    const { mgr } = makeManager({ db })
    await mgr.create()
    expect(mgr.getLastUrl()).toBeNull()
  })

  it('enforces the per-project session cap', async () => {
    const { mgr } = makeManager({ db })
    await mgr.create(); await mgr.create(); await mgr.create(); await mgr.create()
    await expect(mgr.create()).rejects.toBeInstanceOf(BrowserLimitExceededError)
  })

  it('wraps launch failures and allows a retry', async () => {
    let attempt = 0
    const ctx = new FakeContext()
    const launcher: ContextLauncher = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('boom')
      return ctx
    })
    const { mgr } = makeManager({ db, launcher })
    await expect(mgr.create()).rejects.toBeInstanceOf(BrowserLaunchError)
    // second attempt succeeds (contextPromise was reset)
    const meta = await mgr.create()
    expect(meta).toBeTruthy()
    expect(launcher).toHaveBeenCalledTimes(2)
  })

  it('attaches a client: sends ready, starts screencast, fans out frames, replays last frame', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    const ws1 = makeWs()
    await mgr.attach(meta.id, ws1)
    // ready JSON sent
    expect(typeof ws1.sent[0]).toBe('string')
    expect(JSON.parse(ws1.sent[0] as string).type).toBe('ready')
    expect(ctx.pages[0].screencasting).toBe(true)

    // emit a frame → binary delivered + stored
    ctx.pages[0].emitFrame(Buffer.from('JPEG1'))
    expect(ws1.sent.some((s) => Buffer.isBuffer(s) && s.toString() === 'JPEG1')).toBe(true)

    // a second client gets the last frame immediately after ready
    const ws2 = makeWs()
    await mgr.attach(meta.id, ws2)
    expect(ws2.sent.some((s) => Buffer.isBuffer(s) && s.toString() === 'JPEG1')).toBe(true)
  })

  it('attach returns null for an unknown session', async () => {
    const { mgr } = makeManager({ db })
    expect(await mgr.attach('nope', makeWs())).toBeNull()
  })

  it('stops the screencast when the last client detaches', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    const ws = makeWs()
    await mgr.attach(meta.id, ws)
    expect(ctx.pages[0].screencasting).toBe(true)
    mgr.detach(meta.id, ws)
    // The stop transition is serialised on a per-session promise chain.
    await new Promise((r) => setTimeout(r, 0))
    expect(ctx.pages[0].screencasting).toBe(false)
  })

  it('serialises a rapid detach→attach so the screencast ends up running', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    const ws1 = makeWs()
    await mgr.attach(meta.id, ws1)
    mgr.detach(meta.id, ws1) // fires async stop
    const ws2 = makeWs()
    await mgr.attach(meta.id, ws2) // desires screencast again
    await new Promise((r) => setTimeout(r, 0))
    expect(ctx.pages[0].screencasting).toBe(true)
  })

  it('forwards input and tracks viewport on resize', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    await mgr.handleInput(meta.id, { type: 'resize', width: 640, height: 480 })
    await mgr.handleInput(meta.id, { type: 'mouse', action: 'down', x: 5, y: 5 })
    expect(ctx.pages[0].inputs).toHaveLength(2)
    expect(mgr.listSessions()[0].viewportWidth).toBe(640)
  })

  it('handleInput is a no-op for unknown sessions', async () => {
    const { mgr } = makeManager({ db })
    await expect(mgr.handleInput('nope', { type: 'resize', width: 1, height: 1 })).resolves.toBeUndefined()
  })

  it('navigates, updates state, persists URL and broadcasts to clients', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    const ws = makeWs()
    await mgr.attach(meta.id, ws)
    ctx.pages[0].nextNav = { url: 'https://navd.dev', title: 'Navd' }
    const result = await mgr.navigate(meta.id, 'goto', 'https://navd.dev')
    expect(result).toEqual({ url: 'https://navd.dev', title: 'Navd' })
    expect(mgr.getLastUrl()).toBe('https://navd.dev')
    expect(ws.sent.some((s) => typeof s === 'string' && JSON.parse(s).type === 'nav')).toBe(true)
    expect(mgr.getSession(meta.id)?.url).toBe('https://navd.dev')
  })

  it('navigate variants reach the page; unknown session returns null', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    await mgr.navigate(meta.id, 'back')
    await mgr.navigate(meta.id, 'forward')
    await mgr.navigate(meta.id, 'reload')
    expect(ctx.pages[0].calls).toEqual(expect.arrayContaining(['back', 'forward', 'reload']))
    expect(await mgr.navigate('nope', 'reload')).toBeNull()
  })

  it('captures a region: uploads screenshot + DOM attachments and returns them', async () => {
    const attachments = makeAttachments()
    const { mgr } = makeManager({ db, attachments })
    const meta = await mgr.create()
    const result = await mgr.capture(meta.id, { x: -5, y: -5, width: 100, height: 50 }, 'pending-1')
    expect(result).not.toBeNull()
    expect(result!.screenshot.mimeType).toBe('image/png')
    expect(result!.domAttachment.mimeType).toBe('application/json')
    expect(result!.screenshotDataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(result!.dom.html).toContain('button')
    expect(attachments.uploads).toHaveLength(2)
    expect(attachments.uploads.every((u) => u.ticketKey === 'pending-1')).toBe(true)
    expect(attachments.uploads.map((u) => u.mime)).toEqual(['image/png', 'application/json'])
  })

  it('enables network capture on session create and folds requests into the DOM', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    expect(ctx.pages[0].enabledNetwork).toBe(true)
    ctx.pages[0].network = [
      { method: 'GET', url: 'https://api.x/items', status: 200, resourceType: 'Fetch', mimeType: 'application/json', requestBodyShape: null, responseShape: '{ items: [object] }', durationMs: 42, startedAt: 0 },
    ]
    const result = await mgr.capture(meta.id, { x: 0, y: 0, width: 10, height: 10 }, 'pend')
    expect(result!.dom.networkRequests).toHaveLength(1)
    expect(result!.dom.networkRequests![0].url).toBe('https://api.x/items')
    expect(result!.dom.networkRequests![0].responseShape).toBe('{ items: [object] }')
  })

  it('omits network requests when captureNetwork is false', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    ctx.pages[0].network = [
      { method: 'GET', url: 'https://api.x/items', status: 200, resourceType: 'Fetch', mimeType: 'application/json', durationMs: 1, startedAt: 0 } as CapturedNetworkRequest,
    ]
    const result = await mgr.capture(meta.id, { x: 0, y: 0, width: 10, height: 10 }, 'pend', { captureNetwork: false })
    expect(result!.dom.networkRequests).toBeUndefined()
  })

  it('capture returns null for an unknown session', async () => {
    const { mgr } = makeManager({ db })
    expect(await mgr.capture('nope', { x: 0, y: 0, width: 1, height: 1 }, 'p')).toBeNull()
  })

  it('capture returns null (and kills the session) when the page is already closed', async () => {
    const { mgr } = makeManager({ db })
    const meta = await mgr.create()
    const s = mgr.getSession(meta.id)!
    // Simulate the page dying mid-capture (dev server restart / page crash).
    s.page.screenshotClip = async () => { throw new Error('Target page, context or browser has been closed') }
    const result = await mgr.capture(meta.id, { x: 0, y: 0, width: 10, height: 10 }, 'pend')
    expect(result).toBeNull()
    expect(mgr.getSession(meta.id)).toBeUndefined()
  })

  it('probeElement returns the hovered element rect; null for unknown/disposed', async () => {
    const { mgr } = makeManager({ db })
    const meta = await mgr.create()
    const probe = await mgr.probeElement(meta.id, { x: 12, y: 34 })
    expect(probe).toEqual({ rect: { x: 12, y: 34, width: 50, height: 20 }, tag: 'div' })
    expect(await mgr.probeElement('nope', { x: 0, y: 0 })).toBeNull()
    await mgr.shutdown()
    expect(await mgr.probeElement(meta.id, { x: 0, y: 0 })).toBeNull()
  })

  it('kills a session, closing page + clients; unknown kill returns false', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    const ws = makeWs()
    await mgr.attach(meta.id, ws)
    expect(await mgr.kill(meta.id)).toBe(true)
    expect(ctx.pages[0].closed).toBe(true)
    expect(ws.closed).toBe(true)
    expect(mgr.getSession(meta.id)).toBeUndefined()
    expect(await mgr.kill(meta.id)).toBe(false)
  })

  it('shutdown tears down all sessions + the context and blocks further creates', async () => {
    const { mgr, ctx } = makeManager({ db })
    await mgr.create()
    await mgr.shutdown()
    expect(ctx.closed).toBe(true)
    expect(mgr.sessionCount()).toBe(0)
    await expect(mgr.create()).rejects.toBeInstanceOf(BrowserLaunchError)
    // idempotent
    await expect(mgr.shutdown()).resolves.toBeUndefined()
  })

  it('keeps the persistent context alive after killing the last session (StrictMode-safe)', async () => {
    const { mgr, ctx } = makeManager({ db })
    const meta = await mgr.create()
    await mgr.kill(meta.id)
    expect(mgr.sessionCount()).toBe(0)
    // Context is NOT closed on last-session-kill — that raced with StrictMode
    // double-mount in dev. It closes on shutdown() instead.
    expect(ctx.closed).toBe(false)
    // A subsequent create reuses the live context (no relaunch).
    await mgr.create()
    await mgr.shutdown()
    expect(ctx.closed).toBe(true)
  })

  it('shutdown closes a context whose launch was still in flight', async () => {
    let resolveCtx: (c: FakeContext) => void = () => {}
    const ctx = new FakeContext()
    const launcher: ContextLauncher = vi.fn(() => new Promise((res) => { resolveCtx = () => res(ctx) }))
    const { mgr } = makeManager({ db, launcher })
    const createPromise = mgr.create() // contextPromise now pending
    const shutdownPromise = mgr.shutdown()
    resolveCtx(ctx) // launch resolves AFTER shutdown began
    await Promise.allSettled([createPromise, shutdownPromise])
    expect(ctx.closed).toBe(true)
  })

  it('public methods are inert after shutdown', async () => {
    const { mgr } = makeManager({ db })
    const meta = await mgr.create()
    await mgr.shutdown()
    expect(await mgr.attach(meta.id, makeWs())).toBeNull()
    expect(await mgr.navigate(meta.id, 'reload')).toBeNull()
    expect(await mgr.capture(meta.id, { x: 0, y: 0, width: 5, height: 5 }, 'p')).toBeNull()
    await expect(mgr.handleInput(meta.id, { type: 'resize', width: 1, height: 1 })).resolves.toBeUndefined()
  })

  it('listSessions and getSession ignore closed sessions', async () => {
    const { mgr } = makeManager({ db })
    const a = await mgr.create()
    const b = await mgr.create()
    await mgr.kill(a.id)
    expect(mgr.listSessions().map((s) => s.id)).toEqual([b.id])
  })

  it('getLastUrl is resilient when the query fails', async () => {
    const closed = initDb(':memory:')
    closed.close()
    const { mgr } = makeManager({ db: closed })
    expect(mgr.getLastUrl()).toBeNull()
  })
})
