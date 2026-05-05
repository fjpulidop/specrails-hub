import type { Plugin } from '../types'

export class PluginOwnershipConflictError extends Error {
  readonly conflicts: Array<{ kind: 'mcpServers' | 'agentFragments' | 'configKeys'; key: string; plugins: string[] }>
  constructor(conflicts: PluginOwnershipConflictError['conflicts']) {
    const lines = conflicts.map(
      (c) => `  ${c.kind}.${c.key} claimed by: ${c.plugins.join(', ')}`,
    )
    super(`plugin ownership conflict:\n${lines.join('\n')}`)
    this.name = 'PluginOwnershipConflictError'
    this.conflicts = conflicts
  }
}

export interface OwnershipMap {
  /** mcpServers key → owning plugin name */
  mcpServers: Map<string, string>
  /** project-relative agent fragment path → owning plugin name */
  agentFragments: Map<string, string>
  /** future configKeys → owning plugin name */
  configKeys: Map<string, string>
  /** plugin name → manifest (resolves quickly during lookups) */
  byName: Map<string, Plugin>
}

/**
 * Build a global ownership index from a registry of plugins. Fails fast when
 * any two plugins claim the same key — that is the central guarantee that
 * additivity holds: install/uninstall of plugin N can never corrupt plugin M
 * because their owned keys are statically known to be disjoint.
 *
 * Also rejects plugins with duplicate names.
 */
export function buildOwnershipMap(plugins: Plugin[]): OwnershipMap {
  const byName = new Map<string, Plugin>()
  const mcpServers = new Map<string, string>()
  const agentFragments = new Map<string, string>()
  const configKeys = new Map<string, string>()
  const conflicts: PluginOwnershipConflictError['conflicts'] = []

  // Tracks which plugins claim each key, for richer error reporting.
  const claimMap: Record<'mcpServers' | 'agentFragments' | 'configKeys', Map<string, string[]>> = {
    mcpServers: new Map(),
    agentFragments: new Map(),
    configKeys: new Map(),
  }

  for (const plugin of plugins) {
    const m = plugin.manifest
    if (!m || !m.name) {
      throw new Error('plugin manifest is missing required field: name')
    }
    if (!m.version) {
      throw new Error(`plugin '${m.name}' is missing required field: version`)
    }
    if (!m.owns) {
      throw new Error(`plugin '${m.name}' is missing required field: owns`)
    }
    if (byName.has(m.name)) {
      throw new Error(`duplicate plugin name in registry: '${m.name}'`)
    }
    byName.set(m.name, plugin)

    for (const key of m.owns.mcpServers ?? []) {
      const list = claimMap.mcpServers.get(key) ?? []
      list.push(m.name)
      claimMap.mcpServers.set(key, list)
    }
    for (const key of m.owns.agentFragments ?? []) {
      const list = claimMap.agentFragments.get(key) ?? []
      list.push(m.name)
      claimMap.agentFragments.set(key, list)
    }
    for (const key of m.owns.configKeys ?? []) {
      const list = claimMap.configKeys.get(key) ?? []
      list.push(m.name)
      claimMap.configKeys.set(key, list)
    }
  }

  // Promote single-claimer entries; surface multi-claimer entries as conflicts.
  for (const kind of ['mcpServers', 'agentFragments', 'configKeys'] as const) {
    for (const [key, owners] of claimMap[kind].entries()) {
      if (owners.length === 1) {
        if (kind === 'mcpServers') mcpServers.set(key, owners[0])
        else if (kind === 'agentFragments') agentFragments.set(key, owners[0])
        else configKeys.set(key, owners[0])
      } else {
        conflicts.push({ kind, key, plugins: owners })
      }
    }
  }

  if (conflicts.length > 0) {
    throw new PluginOwnershipConflictError(conflicts)
  }

  return { mcpServers, agentFragments, configKeys, byName }
}
