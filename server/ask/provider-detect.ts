// Provider detection for Ask-the-Hub.
//
// Reuses each registered ProviderAdapter's `detectInstalled()` health probe
// to determine which AI CLIs are available at runtime. Drives the first-run
// picker and the search-only fallback when none are present.

import { listAdapters } from '../providers/registry'
import type { ProviderId } from '../providers/types'

export interface AskProviderDetection {
  id: ProviderId
  displayName: string
  available: boolean
  executable: boolean
  version?: string
  error?: string
}

export interface AvailableProviders {
  providers: AskProviderDetection[]
  /** Convenience accessor — providers actually usable for spawning. */
  usable: ProviderId[]
}

export async function detectAvailableProviders(): Promise<AvailableProviders> {
  const adapters = listAdapters()
  const settled = await Promise.all(
    adapters.map(async (a) => {
      try {
        const r = await a.detectInstalled()
        return {
          id: a.id,
          displayName: a.displayName,
          available: r.installed,
          executable: r.executable,
          version: r.version,
          error: r.error,
        }
      } catch (err) {
        return {
          id: a.id,
          displayName: a.displayName,
          available: false,
          executable: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )
  return {
    providers: settled,
    usable: settled.filter((p) => p.available && p.executable).map((p) => p.id),
  }
}

export type AskProviderSetting = 'claude' | 'codex' | 'none' | null

/**
 * Resolve which provider to actually use for an answer query given the
 * user's persisted setting and the live detection state.
 *
 * Rules:
 *  - explicit user setting 'none' → search-only
 *  - explicit setting + provider available → that provider
 *  - explicit setting + provider unavailable → 'degraded' (caller surfaces banner)
 *  - unset + 0 usable → 'none'
 *  - unset + 1 usable → that provider (auto-pick)
 *  - unset + 2+ usable → 'first-run' (caller renders the picker)
 */
export function resolveAskProvider(
  setting: AskProviderSetting,
  detected: AvailableProviders,
): { mode: 'use'; provider: ProviderId } | { mode: 'none' } | { mode: 'degraded'; configured: ProviderId } | { mode: 'first-run'; options: ProviderId[] } {
  if (setting === 'none') return { mode: 'none' }
  if (setting) {
    const configured = setting as ProviderId
    if (detected.usable.includes(configured)) return { mode: 'use', provider: configured }
    return { mode: 'degraded', configured }
  }
  // unset
  if (detected.usable.length === 0) return { mode: 'none' }
  if (detected.usable.length === 1) return { mode: 'use', provider: detected.usable[0]! }
  return { mode: 'first-run', options: detected.usable }
}
