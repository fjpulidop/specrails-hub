import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createProjectRouter } from './project-router'
import { initDb, type DbInstance } from './db'
import { initHubDb } from './hub-db'
import { BrowserLimitExceededError, BrowserLaunchError } from './browser-capture-types'
import type { ProjectRegistry, ProjectContext } from './project-registry'

function makeBrowserManager(overrides: Record<string, unknown> = {}) {
  return {
    listSessions: vi.fn(() => [{ id: 's1', projectId: 'proj-1', url: null, title: null, viewportWidth: 1280, viewportHeight: 800, createdAt: 1 }]),
    getLastUrl: vi.fn(() => 'https://last.dev'),
    create: vi.fn(async () => ({ id: 's1', projectId: 'proj-1', url: 'about:blank', title: null, viewportWidth: 1280, viewportHeight: 800, createdAt: 1 })),
    navigate: vi.fn(async () => ({ url: 'https://x.dev', title: 'X' })),
    capture: vi.fn(async () => ({ screenshot: { id: 'a1' }, domAttachment: { id: 'a2' }, dom: { html: '<i>', nodes: [] } })),
    kill: vi.fn(async () => true),
    ...overrides,
  }
}

function makeContext(db: DbInstance, browser: ReturnType<typeof makeBrowserManager>): ProjectContext {
  return {
    project: { id: 'proj-1', slug: 'proj', name: 'P', path: '/tmp', db_path: ':memory:', provider: 'claude', providers: ['claude'], added_at: '', last_seen_at: '' },
    db,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browserCaptureManager: browser as any,
    broadcast: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function createApp(ctx: ProjectContext | null) {
  const contexts = new Map<string, ProjectContext>()
  if (ctx) contexts.set('proj-1', ctx)
  const registry = {
    hubDb: initHubDb(':memory:'),
    getContext: vi.fn((id: string) => contexts.get(id)),
    getContextByPath: vi.fn(() => undefined),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => Array.from(contexts.values())),
  } as unknown as ProjectRegistry
  const app = express()
  app.use(express.json())
  app.use('/api/projects', createProjectRouter(registry))
  return app
}

describe('project-router browser endpoints', () => {
  let db: DbInstance
  let browser: ReturnType<typeof makeBrowserManager>
  const saved = process.env.SPECRAILS_BROWSER_CAPTURE

  beforeEach(() => {
    db = initDb(':memory:')
    browser = makeBrowserManager()
    delete process.env.SPECRAILS_BROWSER_CAPTURE
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.SPECRAILS_BROWSER_CAPTURE
    else process.env.SPECRAILS_BROWSER_CAPTURE = saved
  })

  it('GET /browser/sessions returns sessions + lastUrl', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).get('/api/projects/proj-1/browser/sessions')
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(1)
    expect(res.body.lastUrl).toBe('https://last.dev')
  })

  it('returns 404 for all browser endpoints when the feature is disabled', async () => {
    process.env.SPECRAILS_BROWSER_CAPTURE = 'false'
    const app = createApp(makeContext(db, browser))
    const res = await request(app).get('/api/projects/proj-1/browser/sessions')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('browser_capture_disabled')
  })

  it('POST /browser/sessions creates a session (201)', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions').send({ initialUrl: 'https://x.dev' })
    expect(res.status).toBe(201)
    expect(res.body.session.id).toBe('s1')
    expect(browser.create).toHaveBeenCalledWith({ initialUrl: 'https://x.dev' })
  })

  it('POST /browser/sessions maps the cap error to 409', async () => {
    browser = makeBrowserManager({ create: vi.fn(async () => { throw new BrowserLimitExceededError(4) }) })
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions').send({})
    expect(res.status).toBe(409)
    expect(res.body.limit).toBe(4)
  })

  it('POST /browser/sessions maps a launch failure to 502', async () => {
    browser = makeBrowserManager({ create: vi.fn(async () => { throw new BrowserLaunchError('no chromium') }) })
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions').send({})
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('browser_launch_failed')
  })

  it('POST navigate requires a url for goto', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/navigate').send({ action: 'goto' })
    expect(res.status).toBe(400)
  })

  it('POST navigate returns the nav result and accepts back without url', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/navigate').send({ action: 'back' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ url: 'https://x.dev', title: 'X' })
    expect(browser.navigate).toHaveBeenCalledWith('s1', 'back', undefined)
  })

  it('POST navigate rejects an invalid action', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/navigate').send({ action: 'evaluate' })
    expect(res.status).toBe(400)
  })

  it('POST navigate rejects non-http(s) URL schemes (SSRF guard)', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/navigate').send({ action: 'goto', url: 'file:///etc/passwd' })
    expect(res.status).toBe(400)
    expect(browser.navigate).not.toHaveBeenCalled()
  })

  it('POST navigate returns 404 when the session is gone', async () => {
    browser = makeBrowserManager({ navigate: vi.fn(async () => null) })
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/navigate').send({ action: 'goto', url: 'https://x' })
    expect(res.status).toBe(404)
  })

  it('POST capture validates rect and pendingSpecId', async () => {
    const app = createApp(makeContext(db, browser))
    const bad = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 0, y: 0, width: 0, height: 10 }, pendingSpecId: 'p' })
    expect(bad.status).toBe(400)
    const noPending = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 0, y: 0, width: 10, height: 10 } })
    expect(noPending.status).toBe(400)
    const negative = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: -1, y: 0, width: 10, height: 10 }, pendingSpecId: 'p' })
    expect(negative.status).toBe(400)
  })

  it('POST capture rejects a path-traversal pendingSpecId', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 0, y: 0, width: 10, height: 10 }, pendingSpecId: '../../etc/passwd' })
    expect(res.status).toBe(400)
    expect(browser.capture).not.toHaveBeenCalled()
  })

  it('POST capture returns the capture result', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 1, y: 2, width: 30, height: 40 }, pendingSpecId: 'pend-1' })
    expect(res.status).toBe(200)
    expect(res.body.screenshot.id).toBe('a1')
    expect(res.body.domAttachment.id).toBe('a2')
    expect(browser.capture).toHaveBeenCalledWith('s1', { x: 1, y: 2, width: 30, height: 40 }, 'pend-1', { captureNetwork: true })
  })

  it('POST capture forwards captureNetwork:false to the manager', async () => {
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 1, y: 2, width: 30, height: 40 }, pendingSpecId: 'pend-1', captureNetwork: false })
    expect(res.status).toBe(200)
    expect(browser.capture).toHaveBeenCalledWith('s1', { x: 1, y: 2, width: 30, height: 40 }, 'pend-1', { captureNetwork: false })
  })

  it('POST capture returns 404 when capture yields null', async () => {
    browser = makeBrowserManager({ capture: vi.fn(async () => null) })
    const app = createApp(makeContext(db, browser))
    const res = await request(app).post('/api/projects/proj-1/browser/sessions/s1/capture').send({ rect: { x: 0, y: 0, width: 5, height: 5 }, pendingSpecId: 'p' })
    expect(res.status).toBe(404)
  })

  it('DELETE kills the session; 404 when unknown', async () => {
    const app = createApp(makeContext(db, browser))
    const ok = await request(app).delete('/api/projects/proj-1/browser/sessions/s1')
    expect(ok.status).toBe(200)
    expect(ok.body.ok).toBe(true)

    browser = makeBrowserManager({ kill: vi.fn(async () => false) })
    const app2 = createApp(makeContext(db, browser))
    const miss = await request(app2).delete('/api/projects/proj-1/browser/sessions/s1')
    expect(miss.status).toBe(404)
  })
})
