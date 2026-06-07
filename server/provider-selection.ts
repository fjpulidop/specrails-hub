// Per-invocation provider selection for multi-provider projects.
//
// A project carries a primary `provider` (single source for single-provider
// projects, and the fallback default) plus a `providers` list of every
// installed provider. Add Spec, rails and the terminal can request a specific
// engine per invocation; these helpers resolve and validate that request
// against what the project actually has installed.
//
// Invariant: when `providers.length === 1` every helper collapses to the single
// provider, so single-provider projects behave exactly as before.

import type { CliProvider, ProjectRow } from './hub-db'

type ProviderFields = Pick<ProjectRow, 'provider' | 'providers'>

/**
 * Normalised installed-provider list. `getProject` always populates
 * `providers`, but this tolerates a row where it is missing/empty (legacy or
 * hand-built rows) by falling back to the primary provider.
 */
function installedProviders(project: Partial<ProviderFields>): CliProvider[] {
  if (Array.isArray(project.providers) && project.providers.length > 0) return project.providers
  return [project.provider ?? 'claude']
}

/** True when `id` is one of the providers installed on the project. */
export function isProviderEnabled(
  project: Partial<ProviderFields>,
  id: string | null | undefined,
): id is CliProvider {
  if (!id) return false
  return installedProviders(project).includes(id as CliProvider)
}

/** True when the project offers a choice of engines (more than one installed). */
export function isMultiProvider(project: Partial<ProviderFields>): boolean {
  return installedProviders(project).length > 1
}

/**
 * Resolve the effective provider for a per-invocation request.
 * Returns the requested provider when it is installed on the project; otherwise
 * falls back to the project's primary provider. Never throws — callers that
 * want strict validation should use `validateRequestedProvider` first.
 */
export function resolveProvider(project: Partial<ProviderFields>, requested?: string | null): CliProvider {
  if (isProviderEnabled(project, requested)) return requested
  return project.provider ?? installedProviders(project)[0]
}

/**
 * Strict validation for route handlers. Returns the resolved provider when the
 * request is acceptable, or an `error` string when an explicit, non-empty
 * provider was requested that the project does not have installed. Omitting the
 * provider (undefined/null/empty) is always acceptable and resolves to primary.
 */
export function validateRequestedProvider(
  project: Partial<ProviderFields>,
  requested: unknown,
): { ok: true; provider: CliProvider } | { ok: false; error: string } {
  const installed = installedProviders(project)
  if (requested === undefined || requested === null || requested === '') {
    return { ok: true, provider: project.provider ?? installed[0] }
  }
  if (typeof requested !== 'string') {
    return { ok: false, error: 'provider must be a string' }
  }
  if (!isProviderEnabled(project, requested)) {
    return {
      ok: false,
      error: `provider '${requested}' is not installed for this project (installed: ${installed.join(', ')})`,
    }
  }
  return { ok: true, provider: requested }
}
