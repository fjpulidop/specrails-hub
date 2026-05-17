// Local pricing table for providers whose CLI does NOT report `total_cost_usd`
// natively. The hub uses this to populate `ai_invocations.total_cost_usd` from
// captured token usage so the Spending dashboard, daily-budget enforcement, and
// cost alerts continue to function uniformly across providers.
//
// IMPORTANT — review cadence:
//
// Every quarter, the maintainer is expected to:
//   1. Confirm each entry's per-1M-token prices against the provider's
//      published rate card (https://openai.com/pricing for OpenAI / Codex).
//   2. Bump the entry's `lastReviewedAt` to the verification date.
//   3. Add new models that have shipped since the last review.
//
// If a model is encountered at runtime that is NOT in the table,
// `estimateCostUsd` returns `null` and the consuming row is persisted with
// `total_cost_usd = NULL`. This is the deliberate fail-soft behaviour: never
// fabricate a cost from an unknown rate card.
//
// Spec: openspec/changes/add-multi-provider-support/specs/project-spending/spec.md
//   - "Pricing-table fallback for non-native-cost providers"

import { getAdapter, hasAdapter } from './providers/registry'

export interface PriceEntry {
  /** USD per 1 000 000 input tokens. */
  inputPer1M: number
  /** USD per 1 000 000 output tokens. Reasoning tokens are billed at this rate
   *  per OpenAI's pricing model and are folded into `tokens_out` upstream. */
  outputPer1M: number
  /** USD per 1 000 000 cache-read tokens. */
  cacheReadPer1M: number
  /** YYYY-MM-DD of the last quarterly review. Drives the staleness reminder. */
  lastReviewedAt: string
}

export interface TokenUsage {
  tokens_in?: number
  tokens_out?: number
  tokens_cache_read?: number
  tokens_cache_create?: number
}

/** Key shape: `<providerId>:<model>` (case-sensitive). */
export const PRICING: Record<string, PriceEntry> = {
  // Codex (OpenAI). Reference: https://openai.com/pricing
  'codex:gpt-5.5':       { inputPer1M: 1.25, outputPer1M: 10.00, cacheReadPer1M: 0.125, lastReviewedAt: '2026-05-17' },
  'codex:gpt-5.4':       { inputPer1M: 2.50, outputPer1M: 10.00, cacheReadPer1M: 0.25,  lastReviewedAt: '2026-05-17' },
  'codex:gpt-5.4-mini':  { inputPer1M: 0.25, outputPer1M: 2.00,  cacheReadPer1M: 0.025, lastReviewedAt: '2026-05-17' },
  'codex:gpt-5.3-codex': { inputPer1M: 1.50, outputPer1M: 6.00,  cacheReadPer1M: 0.15,  lastReviewedAt: '2026-05-17' },
}

/**
 * Estimate cost in USD from a token usage breakdown. Returns `null` when:
 *   - the model is null/empty,
 *   - the `${providerId}:${model}` key is not in the pricing table.
 *
 * Cache-creation tokens are not modelled (OpenAI does not surface a separate
 * cache-write tier as of 2026-05-17). When `tokens_cache_create` is present we
 * silently ignore it — including it as ordinary input tokens would double-count
 * against the rate card.
 */
export function estimateCostUsd(
  providerId: string,
  model: string | null | undefined,
  usage: TokenUsage,
): number | null {
  if (!model) return null
  const entry = PRICING[`${providerId}:${model}`]
  if (!entry) return null
  const inputCost     = (usage.tokens_in         ?? 0) * entry.inputPer1M     / 1_000_000
  const outputCost    = (usage.tokens_out        ?? 0) * entry.outputPer1M    / 1_000_000
  const cacheReadCost = (usage.tokens_cache_read ?? 0) * entry.cacheReadPer1M / 1_000_000
  return inputCost + outputCost + cacheReadCost
}

/**
 * Returns the oldest `lastReviewedAt` date across the table. Surfaced by an
 * optional diagnostic endpoint so the maintainer can spot staleness quickly.
 */
export function lastReviewedAt(): string {
  let oldest: string | null = null
  for (const entry of Object.values(PRICING)) {
    if (oldest === null || entry.lastReviewedAt < oldest) oldest = entry.lastReviewedAt
  }
  return oldest ?? '0000-00-00'
}

/**
 * Returns true when the resolved adapter for the given provider id declares
 * `capabilities.nativeCostUsd === false`. Used by callsites to decide whether
 * to fall back to estimation vs trust the provider's terminal event.
 *
 * Returns false for unknown ids (defensive: do not call the estimator for an
 * unrecognised provider).
 */
export function providerNeedsCostEstimation(providerId: string): boolean {
  if (!hasAdapter(providerId)) return false
  return getAdapter(providerId).capabilities.nativeCostUsd === false
}
