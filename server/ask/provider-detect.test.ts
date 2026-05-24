import { describe, it, expect, vi } from 'vitest'
import { resolveAskProvider, detectAvailableProviders, type AvailableProviders, type AskProviderDetection } from './provider-detect'
import * as registry from '../providers/registry'

function detection(...usable: string[]): AvailableProviders {
  const providers: AskProviderDetection[] = ['claude', 'codex'].map((id) => ({
    id,
    displayName: id,
    available: usable.includes(id),
    executable: usable.includes(id),
  }))
  return { providers, usable }
}

describe('resolveAskProvider', () => {
  it("returns 'none' when setting='none'", () => {
    expect(resolveAskProvider('none', detection('claude'))).toEqual({ mode: 'none' })
  })

  it('returns use when explicit provider is available', () => {
    expect(resolveAskProvider('claude', detection('claude'))).toEqual({ mode: 'use', provider: 'claude' })
  })

  it('returns degraded when configured provider is unavailable', () => {
    expect(resolveAskProvider('codex', detection('claude'))).toEqual({ mode: 'degraded', configured: 'codex' })
  })

  it('returns none when unset and nothing usable', () => {
    expect(resolveAskProvider(null, detection())).toEqual({ mode: 'none' })
  })

  it('auto-picks single available provider when unset', () => {
    expect(resolveAskProvider(null, detection('claude'))).toEqual({ mode: 'use', provider: 'claude' })
  })

  it('returns first-run when unset and multiple available', () => {
    const r = resolveAskProvider(null, detection('claude', 'codex'))
    expect(r.mode).toBe('first-run')
    if (r.mode === 'first-run') expect(r.options).toEqual(['claude', 'codex'])
  })
})

describe('detectAvailableProviders', () => {
  it('aggregates detectInstalled from every registered adapter', async () => {
    vi.spyOn(registry, 'listAdapters').mockReturnValue([
      {
        id: 'claude', displayName: 'Claude',
        detectInstalled: async () => ({ installed: true, executable: true, version: '1.0' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        id: 'codex', displayName: 'Codex',
        detectInstalled: async () => ({ installed: false, executable: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ])
    const r = await detectAvailableProviders()
    expect(r.usable).toEqual(['claude'])
    expect(r.providers).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('handles adapter errors gracefully', async () => {
    vi.spyOn(registry, 'listAdapters').mockReturnValue([
      {
        id: 'boom', displayName: 'Boom',
        detectInstalled: async () => { throw new Error('detection failed') },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ])
    const r = await detectAvailableProviders()
    expect(r.usable).toEqual([])
    expect(r.providers[0]!.error).toContain('detection failed')
    vi.restoreAllMocks()
  })
})
