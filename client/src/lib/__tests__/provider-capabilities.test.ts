import { describe, it, expect } from 'vitest'
import { isSmashCapable } from '../provider-capabilities'

describe('isSmashCapable', () => {
  it('returns true for claude', () => {
    expect(isSmashCapable('claude')).toBe(true)
  })

  it('returns false for codex', () => {
    expect(isSmashCapable('codex')).toBe(false)
  })

  it('returns false for null (provider not yet resolved)', () => {
    expect(isSmashCapable(null)).toBe(false)
  })

  it('returns false for undefined (provider not yet resolved)', () => {
    expect(isSmashCapable(undefined)).toBe(false)
  })

  it('returns false for an unknown provider string', () => {
    expect(isSmashCapable('openai')).toBe(false)
    expect(isSmashCapable('gemini')).toBe(false)
    expect(isSmashCapable('')).toBe(false)
  })
})
