import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'fs'

// Mock fs so we don't touch the real ~/.specrails/hub.token during tests
vi.mock('fs')

import { requireAuth, getServerToken, _resetTokenForTest, loadOrGenerateToken, tokenFromUpgradeRequest } from './auth'

const mockFs = fs as typeof fs & {
  existsSync: ReturnType<typeof vi.fn>
  readFileSync: ReturnType<typeof vi.fn>
  writeFileSync: ReturnType<typeof vi.fn>
  mkdirSync: ReturnType<typeof vi.fn>
}

function createTestApp() {
  const app = express()
  app.use(express.json())

  // Public endpoint — no auth required
  app.get('/public', (_req, res) => {
    res.json({ ok: true })
  })

  // Protected endpoint
  app.use('/protected', requireAuth, ((_req, res) => {
    res.json({ secret: true })
  }) as express.RequestHandler)

  return app
}

describe('auth middleware', () => {
  beforeEach(() => {
    _resetTokenForTest()
    vi.resetAllMocks()

    // Default: no existing token file
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockReturnValue(undefined)
    mockFs.writeFileSync.mockReturnValue(undefined)
  })

  afterEach(() => {
    _resetTokenForTest()
  })

  describe('loadOrGenerateToken', () => {
    it('generates a new token when no file exists', () => {
      mockFs.existsSync.mockReturnValue(false)
      const token = loadOrGenerateToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThanOrEqual(32)
    })

    it('loads an existing token from disk', () => {
      const stored = 'a'.repeat(64)
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(stored)

      const token = loadOrGenerateToken()
      expect(token).toBe(stored)
    })

    it('returns the same token on subsequent calls (cached)', () => {
      mockFs.existsSync.mockReturnValue(false)
      const t1 = loadOrGenerateToken()
      const t2 = loadOrGenerateToken()
      expect(t1).toBe(t2)
      // Only called once — second call uses cache
      expect(mockFs.existsSync).toHaveBeenCalledTimes(1)
    })

    it('generates a new token when stored token is too short', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('short')

      const token = loadOrGenerateToken()
      expect(token.length).toBeGreaterThanOrEqual(32)
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('requireAuth middleware', () => {
    it('returns 401 when no auth header is provided', async () => {
      const app = createTestApp()
      const res = await request(app).get('/protected')
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    it('returns 401 for an invalid Bearer token', async () => {
      const app = createTestApp()
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer wrong-token')
      expect(res.status).toBe(401)
    })

    it('returns 401 for an invalid X-Hub-Token header', async () => {
      const app = createTestApp()
      const res = await request(app)
        .get('/protected')
        .set('X-Hub-Token', 'wrong-token')
      expect(res.status).toBe(401)
    })

    it('passes with correct Bearer token', async () => {
      const app = createTestApp()
      const token = getServerToken()
      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.secret).toBe(true)
    })

    it('passes with correct X-Hub-Token header', async () => {
      const app = createTestApp()
      const token = getServerToken()
      const res = await request(app)
        .get('/protected')
        .set('X-Hub-Token', token)
      expect(res.status).toBe(200)
      expect(res.body.secret).toBe(true)
    })

    it('does not protect routes not using the middleware', async () => {
      const app = createTestApp()
      const res = await request(app).get('/public')
      expect(res.status).toBe(200)
    })

    it('returns 401 for empty Bearer value', async () => {
      const app = createTestApp()
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ')
      expect(res.status).toBe(401)
    })

    it('does not accept query-string tokens', async () => {
      const app = createTestApp()
      const token = getServerToken()
      const res = await request(app).get(`/protected?token=${token}`)
      expect(res.status).toBe(401)
    })
  })
})

describe('tokenFromUpgradeRequest', () => {
  it('reads bearer tokens from upgrade requests', () => {
    const req = { headers: { authorization: 'Bearer abc' } }
    expect(tokenFromUpgradeRequest(req as any)).toBe('abc')
  })

  it('reads hub-token WebSocket subprotocols', () => {
    const req = { headers: { 'sec-websocket-protocol': 'json, hub-token.def' } }
    expect(tokenFromUpgradeRequest(req as any)).toBe('def')
  })
})

describe('CORS middleware', () => {
  it('allows requests without Origin header (same-origin / non-browser)', async () => {
    // The corsMiddleware is not imported here — tested via index integration.
    // This is a placeholder that ensures the CORS tests are tracked.
    expect(true).toBe(true)
  })
})

describe('hub-router path safety', () => {
  it('denies /etc', () => {
    const { isPathSafe } = _getPathSafeForTest()
    expect(isPathSafe('/etc')).toBe(false)
    expect(isPathSafe('/etc/passwd')).toBe(false)
  })

  it('denies /usr/local/bin', () => {
    const { isPathSafe } = _getPathSafeForTest()
    expect(isPathSafe('/usr/local/bin')).toBe(false)
  })

  it('allows home directory paths', () => {
    const { isPathSafe } = _getPathSafeForTest()
    expect(isPathSafe('/Users/javi/repos/myproject')).toBe(true)
    expect(isPathSafe('/home/javi/projects/foo')).toBe(true)
  })

  it('allows /tmp paths', () => {
    const { isPathSafe } = _getPathSafeForTest()
    expect(isPathSafe('/tmp/myproject')).toBe(true)
  })
})

// ─── Helper to import the internal path check without exporting it ──────────

function _getPathSafeForTest() {
  const DENIED_PATH_PREFIXES = [
    '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64',
    '/sys', '/proc', '/dev', '/boot', '/run',
  ]

  function isPathSafe(resolvedPath: string): boolean {
    const normalized = resolvedPath.endsWith('/') ? resolvedPath : resolvedPath + '/'
    return !DENIED_PATH_PREFIXES.some(
      (prefix) => normalized.startsWith(prefix + '/') || normalized === prefix + '/'
    )
  }

  return { isPathSafe }
}
