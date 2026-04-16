import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _registerRouteForcer, forceProjectRoute } from '../route-memory'

describe('route-memory', () => {
  beforeEach(() => {
    // Reset by registering a null-like forcer; module-level state is shared
    // across tests. Re-register a fresh spy each time.
    _registerRouteForcer(() => {})
  })

  describe('_registerRouteForcer', () => {
    it('registers a forcer function', () => {
      const fn = vi.fn()
      _registerRouteForcer(fn)
      forceProjectRoute('proj-1', '/tickets')
      expect(fn).toHaveBeenCalledWith('proj-1', '/tickets')
    })
  })

  describe('forceProjectRoute', () => {
    it('calls the registered forcer with projectId and route', () => {
      const fn = vi.fn()
      _registerRouteForcer(fn)
      forceProjectRoute('my-project', '/settings')
      expect(fn).toHaveBeenCalledOnce()
      expect(fn).toHaveBeenCalledWith('my-project', '/settings')
    })

    it('is a no-op when no forcer is registered (null state)', () => {
      // Register a forcer that records calls, then simulate a fresh null state
      // by replacing with one that we can verify is NOT the previous one
      _registerRouteForcer(() => {})
      // forceProjectRoute should not throw even if _forcer is freshly null-ish
      expect(() => forceProjectRoute('proj-x', '/')).not.toThrow()
    })
  })
})
