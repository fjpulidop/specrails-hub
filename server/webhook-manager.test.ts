import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebhookManager } from './webhook-manager'
import { initHubDb, addWebhook, addProject } from './hub-db'
import type { DbInstance } from './db'

// Flush setImmediate and pending microtasks so fire-and-forget callbacks execute
async function flushAsync(passes = 4): Promise<void> {
  for (let i = 0; i < passes; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve))
    await Promise.resolve()
  }
}

describe('WebhookManager', () => {
  let hubDb: DbInstance
  let manager: WebhookManager
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    hubDb = initHubDb(':memory:')
    manager = new WebhookManager(hubDb)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // ─── deliverTest ─────────────────────────────────────────────────────────────

  describe('deliverTest', () => {
    it('sends a test ping payload to the webhook URL', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const webhook = addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        secret: '',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
      expect(url).toBe('https://example.com/hook')
      expect(opts.method).toBe('POST')
      const body = JSON.parse(opts.body as string)
      expect(body.event).toBe('job.completed')
      expect(body.data.test).toBe(true)
      expect(body.data.message).toContain('test ping')
    })

    it('adds HMAC-SHA256 signature header when secret is set', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const webhook = addWebhook(hubDb, {
        id: 'wh-2',
        projectId: null,
        url: 'https://example.com/hook',
        secret: 'my-secret',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledOnce()
      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
      expect(opts.headers['X-Specrails-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it('does not add signature header when secret is empty', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const webhook = addWebhook(hubDb, {
        id: 'wh-3',
        projectId: null,
        url: 'https://example.com/hook',
        secret: '',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
      expect(opts.headers['X-Specrails-Signature']).toBeUndefined()
    })

    it('uses wildcard projectId when webhook.project_id is null', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const webhook = addWebhook(hubDb, {
        id: 'wh-4',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.projectId).toBe('*')
    })

    it('uses actual projectId when webhook.project_id is set', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      addProject(hubDb, { id: 'proj-123', slug: 'proj-123', name: 'Test Project', path: '/tmp/test' })
      const webhook = addWebhook(hubDb, {
        id: 'wh-5',
        projectId: 'proj-123',
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.projectId).toBe('proj-123')
    })

    it('includes Content-Type and User-Agent headers', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const webhook = addWebhook(hubDb, {
        id: 'wh-6',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliverTest(webhook)
      await flushAsync()

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(opts.headers['User-Agent']).toBe('specrails-hub')
    })
  })

  // ─── deliver ─────────────────────────────────────────────────────────────────

  describe('deliver', () => {
    it('sends payload to all enabled webhooks matching the event', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliver('proj-1', 'job.completed', { jobId: 'j1' })
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledOnce()
      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.event).toBe('job.completed')
      expect(body.projectId).toBe('proj-1')
      expect(body.data.jobId).toBe('j1')
    })

    it('does not send to webhooks not matching the event', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.failed'],
      })

      manager.deliver('proj-1', 'job.completed', {})
      await flushAsync()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends to global webhooks (project_id IS NULL) for any project', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      addWebhook(hubDb, {
        id: 'wh-global',
        projectId: null,
        url: 'https://example.com/global',
        events: ['job.completed'],
      })

      manager.deliver('any-project', 'job.completed', {})
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('handles webhooks with malformed events JSON gracefully', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      // Insert a webhook with invalid JSON events directly
      hubDb.prepare(
        `INSERT INTO webhooks (id, project_id, url, secret, events, enabled) VALUES (?, NULL, ?, '', ?, 1)`
      ).run('wh-bad', 'https://example.com/hook', 'not-valid-json')

      expect(() => manager.deliver('proj-1', 'job.completed', {})).not.toThrow()
      await flushAsync()
      // Malformed events are treated as non-matching
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('delivers to multiple matching webhooks', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      for (let i = 1; i <= 3; i++) {
        addWebhook(hubDb, {
          id: `wh-${i}`,
          projectId: null,
          url: `https://example.com/hook${i}`,
          events: ['job.completed'],
        })
      }

      manager.deliver('proj-1', 'job.completed', {})
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('includes a timestamp in the payload', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliver('proj-1', 'job.completed', {})
      await flushAsync()

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  // ─── retry logic ─────────────────────────────────────────────────────────────

  describe('retry logic', () => {
    it('retries up to 3 times on non-ok response', async () => {
      vi.useFakeTimers()
      fetchMock.mockResolvedValue({ ok: false })

      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliver('proj-1', 'job.completed', {})
      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('retries up to 3 times on fetch error', async () => {
      vi.useFakeTimers()
      fetchMock.mockRejectedValue(new Error('Network error'))

      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliver('proj-1', 'job.completed', {})
      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('does not retry after a successful response', async () => {
      fetchMock.mockResolvedValue({ ok: true })

      addWebhook(hubDb, {
        id: 'wh-1',
        projectId: null,
        url: 'https://example.com/hook',
        events: ['job.completed'],
      })

      manager.deliver('proj-1', 'job.completed', {})
      await flushAsync()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
