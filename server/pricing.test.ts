import { describe, it, expect } from 'vitest'
import { PRICING, estimateCostUsd, lastReviewedAt, providerNeedsCostEstimation } from './pricing'
// Import the providers barrel so claude+codex are registered for the helper-
// behind-adapter test cases below.
import './providers'

describe('pricing.PRICING — table sanity', () => {
  it('has at least one codex entry', () => {
    const codexKeys = Object.keys(PRICING).filter((k) => k.startsWith('codex:'))
    expect(codexKeys.length).toBeGreaterThan(0)
  })

  it('every entry has all four required fields with sane shapes', () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      expect(entry.inputPer1M, `${key}.inputPer1M`).toBeGreaterThanOrEqual(0)
      expect(entry.outputPer1M, `${key}.outputPer1M`).toBeGreaterThanOrEqual(0)
      expect(entry.cacheReadPer1M, `${key}.cacheReadPer1M`).toBeGreaterThanOrEqual(0)
      expect(entry.lastReviewedAt, `${key}.lastReviewedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('output prices are always >= input prices (per OpenAI rate card structure)', () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      expect(entry.outputPer1M, `${key} output should be ≥ input`).toBeGreaterThanOrEqual(entry.inputPer1M)
    }
  })

  it('cache-read prices are always <= input prices (caching is a discount)', () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      expect(entry.cacheReadPer1M, `${key} cache-read should be ≤ input`).toBeLessThanOrEqual(entry.inputPer1M)
    }
  })
})

describe('estimateCostUsd', () => {
  it('computes cost = (in*p_in + out*p_out + cache_read*p_cache) / 1M', () => {
    // codex:gpt-5.4-mini → input 0.25, output 2.00, cache_read 0.025
    const cost = estimateCostUsd('codex', 'gpt-5.4-mini', {
      tokens_in: 100_000,
      tokens_out: 50_000,
      tokens_cache_read: 20_000,
    })
    // 100000 * 0.25 / 1M = 0.025
    // 50000  * 2.00 / 1M = 0.100
    // 20000  * 0.025 / 1M = 0.0005
    // Total ≈ 0.1255
    expect(cost).toBeCloseTo(0.1255, 4)
  })

  it('returns 0 when usage is empty', () => {
    const cost = estimateCostUsd('codex', 'gpt-5.4-mini', {})
    expect(cost).toBe(0)
  })

  it('treats missing usage fields as zero', () => {
    const cost = estimateCostUsd('codex', 'gpt-5.4-mini', { tokens_in: 1_000_000 })
    // 1M * 0.25 / 1M = 0.25 USD, no output or cache
    expect(cost).toBeCloseTo(0.25, 6)
  })

  it('ignores tokens_cache_create silently (no separate tier modelled)', () => {
    const withCacheCreate = estimateCostUsd('codex', 'gpt-5.4-mini', {
      tokens_in: 1_000_000,
      tokens_cache_create: 500_000,
    })
    const withoutCacheCreate = estimateCostUsd('codex', 'gpt-5.4-mini', {
      tokens_in: 1_000_000,
    })
    expect(withCacheCreate).toBe(withoutCacheCreate)
  })

  it('returns null when model is null', () => {
    expect(estimateCostUsd('codex', null, { tokens_in: 100 })).toBeNull()
  })

  it('returns null when model is undefined', () => {
    expect(estimateCostUsd('codex', undefined, { tokens_in: 100 })).toBeNull()
  })

  it('returns null when model is empty string', () => {
    expect(estimateCostUsd('codex', '', { tokens_in: 100 })).toBeNull()
  })

  it('returns null for unknown providerId', () => {
    expect(estimateCostUsd('ghost', 'gpt-5.4-mini', { tokens_in: 100 })).toBeNull()
  })

  it('returns null for unknown model under a known provider', () => {
    expect(estimateCostUsd('codex', 'gpt-99-future', { tokens_in: 100 })).toBeNull()
  })

  it('computes deterministic cost for each table entry', () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      const [providerId, model] = key.split(':')
      const cost = estimateCostUsd(providerId!, model!, {
        tokens_in: 1_000_000,
        tokens_out: 1_000_000,
        tokens_cache_read: 1_000_000,
      })
      expect(cost).toBeCloseTo(entry.inputPer1M + entry.outputPer1M + entry.cacheReadPer1M, 6)
    }
  })
})

describe('lastReviewedAt', () => {
  it('returns the oldest review date in YYYY-MM-DD format', () => {
    const date = lastReviewedAt()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('providerNeedsCostEstimation', () => {
  it('returns true for codex (capabilities.nativeCostUsd === false)', () => {
    expect(providerNeedsCostEstimation('codex')).toBe(true)
  })

  it('returns false for claude (capabilities.nativeCostUsd === true)', () => {
    expect(providerNeedsCostEstimation('claude')).toBe(false)
  })

  it('returns false for unknown providerId (defensive)', () => {
    expect(providerNeedsCostEstimation('ghost')).toBe(false)
  })
})
