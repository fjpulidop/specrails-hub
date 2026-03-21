import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('WS_URL', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns __WS_URL__ value when defined (dev mode)', async () => {
    // In vitest config, __WS_URL__ is defined as 'ws://localhost:4200'
    // The module-level getWsUrl() runs at import time
    const { WS_URL } = await import('../ws-url')
    expect(WS_URL).toBe('ws://localhost:4200')
  })

  it('WS_URL is a non-empty string', async () => {
    const { WS_URL } = await import('../ws-url')
    expect(typeof WS_URL).toBe('string')
    expect(WS_URL.length).toBeGreaterThan(0)
  })

  it('WS_URL starts with ws: or wss:', async () => {
    const { WS_URL } = await import('../ws-url')
    expect(WS_URL).toMatch(/^wss?:/)
  })
})
