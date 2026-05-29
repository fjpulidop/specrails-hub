import { describe, it, expect, afterEach } from 'vitest'
import { isAskHubEnabled, isCodeExplorerEnabled } from './feature-flags'

describe('isAskHubEnabled', () => {
  const original = process.env.SPECRAILS_ASK_HUB
  afterEach(() => {
    if (original === undefined) delete process.env.SPECRAILS_ASK_HUB
    else process.env.SPECRAILS_ASK_HUB = original
  })

  it('defaults to enabled when env unset', () => {
    delete process.env.SPECRAILS_ASK_HUB
    expect(isAskHubEnabled()).toBe(true)
  })

  it.each(['0', 'false', 'off', 'no', 'FALSE', 'Off'])('treats %s as disabled', (v) => {
    process.env.SPECRAILS_ASK_HUB = v
    expect(isAskHubEnabled()).toBe(false)
  })

  it.each(['1', 'true', 'on', 'yes', ''])('treats %s as enabled', (v) => {
    process.env.SPECRAILS_ASK_HUB = v
    expect(isAskHubEnabled()).toBe(true)
  })
})

describe('isCodeExplorerEnabled', () => {
  it('returns true by default', () => {
    delete process.env.SPECRAILS_CODE_EXPLORER
    expect(isCodeExplorerEnabled()).toBe(true)
  })
})
