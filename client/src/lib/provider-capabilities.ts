/**
 * Provider capability guards.
 *
 * Pure functions with no side effects — safe to call from any render context
 * or test without a React provider wrapper.
 *
 * See openspec/changes/hide-smash-codex-explore.
 */

export type ProviderId = 'claude' | 'codex'

/**
 * Returns true when the given provider supports SMASH (Spec decomposition via
 * Contract Layer). SMASH requires a Claude-specific Contract Layer generation
 * step; no Codex equivalent exists.
 *
 * Accepts `string | null | undefined` so callers need not assert type narrowness
 * when the provider has not yet been resolved (null/undefined → false, which is
 * the safe default: hide the hint rather than flash it for Codex users).
 */
export function isSmashCapable(provider: string | null | undefined): boolean {
  return provider === 'claude'
}
