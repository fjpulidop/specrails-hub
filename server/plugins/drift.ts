import fs from 'fs'
import { mcpJsonPath } from './paths'
import type { Plugin } from '../types'

/**
 * Returns true when the project's `.mcp.json` entry for any of the plugin's
 * owned mcpServers no longer matches the bundled manifest. Used to surface
 * an "Update available" affordance when upstream changes args (e.g.,
 * Serena's `serena-mcp-server` → `serena start-mcp-server`).
 *
 * Only inspects entries the plugin owns; user-authored entries are ignored.
 */
export function detectMcpDrift(projectPath: string, plugin: Plugin): boolean {
  const ownedKeys = plugin.manifest.owns.mcpServers ?? []
  if (ownedKeys.length === 0) return false

  // The plugin tells us what its current canonical entry should look like
  // via `previewInstall` is too heavy; we instead introspect via a marker:
  // plugins that ship their canonical entry expose it via `expectedMcpEntry`.
  // We accept Plugins without it (drift detection silently disabled).
  const expected = (plugin as Plugin & { expectedMcpEntry?: () => Record<string, unknown> })
    .expectedMcpEntry?.()
  if (!expected) return false

  const file = mcpJsonPath(projectPath)
  if (!fs.existsSync(file)) return false
  let parsed: { mcpServers?: Record<string, unknown> }
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return false
  }
  const servers = parsed.mcpServers ?? {}

  for (const key of ownedKeys) {
    const current = servers[key]
    if (current === undefined) continue
    if (JSON.stringify(current) !== JSON.stringify(expected)) return true
  }
  return false
}
