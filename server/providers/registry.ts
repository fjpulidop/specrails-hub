// In-process registry of ProviderAdapter instances. Adapter modules call
// `register(this)` on module load; managers look up by id via `getAdapter`.
//
// Spec: openspec/specs/multi-provider-architecture/spec.md
//   - "Provider registry exposes lookup by id"

import { type ProviderAdapter, type ProviderId, UnknownProviderError } from './types'

const _registry = new Map<ProviderId, ProviderAdapter>()

export function register(adapter: ProviderAdapter): void {
  _registry.set(adapter.id, adapter)
}

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = _registry.get(id)
  if (!adapter) {
    throw new UnknownProviderError(id, Array.from(_registry.keys()))
  }
  return adapter
}

export function hasAdapter(id: ProviderId): boolean {
  return _registry.has(id)
}

export function listAdapters(): readonly ProviderAdapter[] {
  return Array.from(_registry.values())
}

/**
 * Reset the registry. Test-only — production code MUST NOT call this.
 * Exported separately so production paths cannot mistakenly import it.
 */
export function _clearForTests(): void {
  _registry.clear()
}
