import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to re-import auth after each test to reset module-level state.
describe('auth', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  describe('initAuth', () => {
    it('fetches /api/hub/token and caches the token', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token-abc' }),
      })

      const { initAuth, getHubToken } = await import('../auth')
      await initAuth()

      expect(global.fetch).toHaveBeenCalledWith('/api/hub/token')
      expect(getHubToken()).toBe('test-token-abc')
    })

    it('does not crash and leaves token null when fetch fails', async () => {
      vi.useFakeTimers()
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))

      const { initAuth, getHubToken } = await import('../auth')
      const p = initAuth()
      await vi.runAllTimersAsync()
      await p
      expect(getHubToken()).toBeNull()
      vi.useRealTimers()
    })

    it('does not cache token when response is not ok', async () => {
      vi.useFakeTimers()
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      })

      const { initAuth, getHubToken } = await import('../auth')
      const p = initAuth()
      await vi.runAllTimersAsync()
      await p
      expect(getHubToken()).toBeNull()
      vi.useRealTimers()
    })

    it('handles missing token field gracefully (token=undefined)', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // no token field
      })

      const { initAuth, getHubToken } = await import('../auth')
      await initAuth()
      expect(getHubToken()).toBeNull()
    })
  })

  describe('getHubToken', () => {
    it('returns null before initAuth is called', async () => {
      const { getHubToken } = await import('../auth')
      expect(getHubToken()).toBeNull()
    })

    it('returns a WebSocket subprotocol when token is initialized', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'abc123' }),
      })
      const { initAuth, getHubTokenProtocol } = await import('../auth')
      await initAuth()
      expect(getHubTokenProtocol()).toBe('hub-token.abc123')
    })
  })

  describe('installFetchInterceptor', () => {
    it('wraps window.fetch when called', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'interceptor-token' }),
      })

      const { initAuth, installFetchInterceptor } = await import('../auth')
      await initAuth()

      const fetchBefore = window.fetch
      installFetchInterceptor()
      const fetchAfter = window.fetch

      // installFetchInterceptor replaces window.fetch with a wrapper
      expect(fetchAfter).not.toBe(fetchBefore)
    })

    it('attaches X-Hub-Token header to relative URL requests when token is set', async () => {
      // Use a spy as the original fetch BEFORE installing interceptor
      const spyFetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      )
      ;(window as unknown as Record<string, unknown>).fetch = spyFetch

      // Init auth by having spyFetch return the token
      spyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'interceptor-token' }),
      } as unknown as Response)

      const { initAuth, installFetchInterceptor } = await import('../auth')
      await initAuth()
      installFetchInterceptor()

      // Now window.fetch is the interceptor. spyFetch is the origFetch captured inside.
      await window.fetch('/api/jobs')

      expect(spyFetch).toHaveBeenCalled()
      const lastCall = spyFetch.mock.calls[spyFetch.mock.calls.length - 1]
      const headersArg = lastCall[1]?.headers
      if (headersArg instanceof Headers) {
        expect(headersArg.get('X-Hub-Token')).toBe('interceptor-token')
      } else {
        expect((headersArg as Record<string, string>)?.['X-Hub-Token']).toBe('interceptor-token')
      }
    })

    it('does not add header when token is null', async () => {
      const spyFetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      )
      ;(window as unknown as Record<string, unknown>).fetch = spyFetch

      // Don't call initAuth — token remains null
      const { installFetchInterceptor } = await import('../auth')
      installFetchInterceptor()

      await window.fetch('/api/jobs')

      expect(spyFetch).toHaveBeenCalled()
      // When token is null, origFetch is called with the original init (no headers modified)
      const lastCall = spyFetch.mock.calls[spyFetch.mock.calls.length - 1]
      const callInit = lastCall[1]
      if (callInit?.headers) {
        const headers = callInit.headers as Headers
        expect(headers.get?.('X-Hub-Token')).toBeFalsy()
      }
      // If no headers — that's fine too (no token injected)
    })

    it('does not overwrite existing X-Hub-Token header', async () => {
      const spyFetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      )
      ;(window as unknown as Record<string, unknown>).fetch = spyFetch

      spyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'server-token' }),
      } as unknown as Response)

      const { initAuth, installFetchInterceptor } = await import('../auth')
      await initAuth()
      installFetchInterceptor()

      await window.fetch('/api/jobs', {
        headers: new Headers({ 'X-Hub-Token': 'caller-provided-token' }),
      })

      expect(spyFetch).toHaveBeenCalled()
      const lastCall = spyFetch.mock.calls[spyFetch.mock.calls.length - 1]
      const headers = lastCall[1]?.headers as Headers
      expect(headers.get('X-Hub-Token')).toBe('caller-provided-token')
    })

    it('does not add header to external URLs not on localhost', async () => {
      const spyFetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      )
      ;(window as unknown as Record<string, unknown>).fetch = spyFetch

      spyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'my-token' }),
      } as unknown as Response)

      const { initAuth, installFetchInterceptor } = await import('../auth')
      await initAuth()
      installFetchInterceptor()

      await window.fetch('https://external-api.example.com/data')

      expect(spyFetch).toHaveBeenCalled()
      const lastCall = spyFetch.mock.calls[spyFetch.mock.calls.length - 1]
      const callInit = lastCall[1]
      // External URLs pass through unchanged — no X-Hub-Token header modification
      if (callInit?.headers) {
        const headers = callInit.headers as Headers
        expect(headers.get?.('X-Hub-Token')).toBeNull()
      }
    })

    it('does not add header to unrelated localhost URLs', async () => {
      const spyFetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      )
      ;(window as unknown as Record<string, unknown>).fetch = spyFetch

      spyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'my-token' }),
      } as unknown as Response)

      const { initAuth, installFetchInterceptor } = await import('../auth')
      await initAuth()
      installFetchInterceptor()

      await window.fetch('http://localhost:9999/data')

      const lastCall = spyFetch.mock.calls[spyFetch.mock.calls.length - 1]
      const callInit = lastCall[1]
      if (callInit?.headers) {
        const headers = callInit.headers as Headers
        expect(headers.get?.('X-Hub-Token')).toBeNull()
      }
    })
  })
})
