import { describe, it, expect, vi, afterEach } from 'vitest'
import { SpecrailsTechClient, createSpecrailsTechClient } from './specrails-tech-client'

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

function mockFetchRefused() {
  return vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
}

function mockFetchTimeout() {
  const err = new Error('AbortError')
  err.name = 'AbortError'
  return vi.fn().mockRejectedValue(err)
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── SpecrailsTechClient ──────────────────────────────────────────────────────

describe('SpecrailsTechClient', () => {
  describe('health()', () => {
    it('returns connected:true when server responds ok', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.health()
      expect(result.connected).toBe(true)
      if (result.connected) {
        expect(result.data.status).toBe('ok')
      }
    })

    it('returns connected:false when connection refused', async () => {
      vi.stubGlobal('fetch', mockFetchRefused())
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.health()
      expect(result.connected).toBe(false)
      if (!result.connected) {
        expect(result.error).toContain('specrails-tech')
      }
    })

    it('returns connected:false on timeout', async () => {
      vi.stubGlobal('fetch', mockFetchTimeout())
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.health()
      expect(result.connected).toBe(false)
      if (!result.connected) {
        expect(result.error).toMatch(/timed out/)
      }
    })

    it('returns connected:false on non-200 status', async () => {
      vi.stubGlobal('fetch', mockFetch(503, {}))
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.health()
      expect(result.connected).toBe(false)
    })
  })

  describe('listAgents()', () => {
    it('returns unwrapped agent array on success', async () => {
      const agents = [
        { slug: 'desktop-engineer', name: 'Desktop Engineer', title: null, status: 'active', status_source: 'AGENTS.md', agents_md_path: 'agents/desktop-engineer/AGENTS.md' },
      ]
      vi.stubGlobal('fetch', mockFetch(200, { data: agents }))
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.listAgents()
      expect(result.connected).toBe(true)
      if (result.connected) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].slug).toBe('desktop-engineer')
      }
    })

    it('returns connected:false when offline', async () => {
      vi.stubGlobal('fetch', mockFetchRefused())
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.listAgents()
      expect(result.connected).toBe(false)
    })
  })

  describe('listDocs()', () => {
    it('returns unwrapped docs array on success', async () => {
      const docs = [
        { slug: 'getting-started', title: 'Getting Started', path: 'docs/getting-started.md', updated_at: '2026-03-01T00:00:00Z' },
      ]
      vi.stubGlobal('fetch', mockFetch(200, { data: docs }))
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.listDocs()
      expect(result.connected).toBe(true)
      if (result.connected) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].slug).toBe('getting-started')
      }
    })
  })

  describe('getAgent()', () => {
    it('encodes slug in URL and returns agent', async () => {
      const agent = { slug: 'desktop-engineer', name: 'Desktop Engineer', title: null, status: 'active', status_source: 'AGENTS.md', agents_md_path: 'agents/desktop-engineer/AGENTS.md' }
      const fetchMock = mockFetch(200, { data: agent })
      vi.stubGlobal('fetch', fetchMock)
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.getAgent('desktop-engineer')
      expect(result.connected).toBe(true)
      if (result.connected) {
        expect(result.data.name).toBe('Desktop Engineer')
      }
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('/api/v1/agents/desktop-engineer')
    })
  })

  describe('getDoc()', () => {
    it('encodes page slug in URL and returns doc with content', async () => {
      const doc = { slug: 'intro', title: 'Intro', path: 'docs/intro.md', updated_at: '2026-03-01T00:00:00Z', content: '# Hello' }
      const fetchMock = mockFetch(200, { data: doc })
      vi.stubGlobal('fetch', fetchMock)
      const client = new SpecrailsTechClient('http://localhost:3000')
      const result = await client.getDoc('intro')
      expect(result.connected).toBe(true)
      if (result.connected) {
        expect(result.data.content).toBe('# Hello')
      }
    })
  })

  describe('base URL handling', () => {
    it('strips trailing slash from base URL', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
      const client = new SpecrailsTechClient('http://localhost:3000/')
      await client.health()
      const fetchMock = vi.mocked(fetch)
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toBe('http://localhost:3000/api/v1/health')
    })
  })
})

// ─── createSpecrailsTechClient ────────────────────────────────────────────────

describe('createSpecrailsTechClient', () => {
  it('uses provided URL', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
    const client = createSpecrailsTechClient('http://localhost:4321')
    await client.health()
    const fetchMock = vi.mocked(fetch)
    const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
    expect(calledUrl).toContain('localhost:4321')
  })

  it('falls back to SPECRAILS_TECH_URL env var', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
    const original = process.env.SPECRAILS_TECH_URL
    process.env.SPECRAILS_TECH_URL = 'http://localhost:9999'
    try {
      const client = createSpecrailsTechClient()
      await client.health()
      const fetchMock = vi.mocked(fetch)
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('localhost:9999')
    } finally {
      if (original === undefined) {
        delete process.env.SPECRAILS_TECH_URL
      } else {
        process.env.SPECRAILS_TECH_URL = original
      }
    }
  })

  it('defaults to localhost:3000 when no URL provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
    const original = process.env.SPECRAILS_TECH_URL
    delete process.env.SPECRAILS_TECH_URL
    try {
      const client = createSpecrailsTechClient()
      await client.health()
      const fetchMock = vi.mocked(fetch)
      const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain('localhost:3000')
    } finally {
      if (original !== undefined) {
        process.env.SPECRAILS_TECH_URL = original
      }
    }
  })
})
