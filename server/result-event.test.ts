import { describe, it, expect } from 'vitest'
import { normaliseResultEvent } from './result-event'

describe('normaliseResultEvent', () => {
  it('returns empty object for null/undefined', () => {
    expect(normaliseResultEvent(null)).toEqual({})
    expect(normaliseResultEvent(undefined)).toEqual({})
  })

  it('parses a claude result event with full usage', () => {
    const r = normaliseResultEvent({
      type: 'result',
      total_cost_usd: 0.1234,
      num_turns: 3,
      model: 'claude-sonnet-4-6',
      duration_ms: 12000,
      api_duration_ms: 8000,
      session_id: 's1',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
      },
    })
    expect(r.tokens_in).toBe(100)
    expect(r.tokens_out).toBe(50)
    expect(r.tokens_cache_read).toBe(20)
    expect(r.tokens_cache_create).toBe(10)
    expect(r.total_cost_usd).toBe(0.1234)
    expect(r.num_turns).toBe(3)
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.duration_ms).toBe(12000)
    expect(r.duration_api_ms).toBe(8000)
    expect(r.session_id).toBe('s1')
  })

  it('handles claude event missing usage gracefully', () => {
    const r = normaliseResultEvent({ type: 'result', total_cost_usd: 0 })
    expect(r.tokens_in).toBeUndefined()
    expect(r.tokens_out).toBeUndefined()
    expect(r.total_cost_usd).toBe(0)
  })

  it('parses a synthesised codex event with NULLs for missing fields', () => {
    const r = normaliseResultEvent(
      { type: 'result', total_cost_usd: 0, model: 'gpt-5.4-mini', duration_ms: 5000, num_turns: 1 },
      'codex'
    )
    expect(r.total_cost_usd).toBe(0)
    expect(r.model).toBe('gpt-5.4-mini')
    expect(r.duration_ms).toBe(5000)
    expect(r.num_turns).toBe(1)
    expect(r.tokens_in).toBeUndefined()
    expect(r.tokens_out).toBeUndefined()
  })
})
