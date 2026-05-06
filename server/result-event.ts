/**
 * Normalises the terminal `result` event from claude (`--output-format stream-json`)
 * and codex (`codex exec`) into a uniform payload used by the ai_invocations
 * capture sites. Codex generally lacks token-level billing — fields it cannot
 * report are returned as `undefined` (NULL when persisted).
 */

export interface NormalisedResult {
  tokens_in?: number
  tokens_out?: number
  tokens_cache_read?: number
  tokens_cache_create?: number
  total_cost_usd?: number
  num_turns?: number
  model?: string
  duration_ms?: number
  duration_api_ms?: number
  session_id?: string
}

export function normaliseResultEvent(
  event: Record<string, unknown> | null | undefined,
  provider: 'claude' | 'codex' = 'claude'
): NormalisedResult {
  if (!event) return {}
  if (provider === 'claude') {
    const usage = event.usage as Record<string, number> | undefined
    return {
      tokens_in: usage?.input_tokens,
      tokens_out: usage?.output_tokens,
      tokens_cache_read: usage?.cache_read_input_tokens,
      tokens_cache_create: usage?.cache_creation_input_tokens,
      total_cost_usd: event.total_cost_usd as number | undefined,
      num_turns: event.num_turns as number | undefined,
      model: event.model as string | undefined,
      duration_ms: event.duration_ms as number | undefined,
      duration_api_ms: event.api_duration_ms as number | undefined,
      session_id: event.session_id as string | undefined,
    }
  }
  // codex: minimal payload synthesised by callers (cost=0 by convention)
  return {
    total_cost_usd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined,
    num_turns: typeof event.num_turns === 'number' ? event.num_turns : undefined,
    model: typeof event.model === 'string' ? event.model : undefined,
    duration_ms: typeof event.duration_ms === 'number' ? event.duration_ms : undefined,
  }
}
