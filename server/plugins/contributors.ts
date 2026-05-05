import type { Plugin } from '../types'
import { upsertBlock, removeBlock } from './claude-md-mutation'

/**
 * "Contributors" abstract per-plugin contributions to **shared project
 * files** that several plugins might co-write — files where each plugin
 * owns a named region rather than the whole file.
 *
 * Each contributor exposes three lifecycle hooks:
 *   - apply(plugin, projectPath)    — write/refresh this plugin's region
 *   - revert(plugin, projectPath)   — remove this plugin's region
 *   - relativePaths(plugin)         — files this contributor will touch
 *                                     (drives preview-install + installedFiles)
 *
 * Adding a new shared-file contribution in the future means:
 *   1. Add an optional manifest field (e.g., `gitignoreEntries`).
 *   2. Implement a contributor module.
 *   3. Append it to `SHARED_FILE_CONTRIBUTORS`.
 *
 * No other code in PluginManager needs to change — install / uninstall /
 * setActive iterate this array.
 */
export interface SharedFileContributor {
  /** Stable id, used in logs and tests. */
  id: string
  /** True when this plugin actually contributes via this contributor. */
  appliesTo(plugin: Plugin): boolean
  /** Project-relative paths this contributor will create/modify. */
  relativePaths(plugin: Plugin): string[]
  /** Write/refresh the plugin's region. Idempotent. */
  apply(plugin: Plugin, projectPath: string): Promise<void>
  /** Remove the plugin's region. No-op when already absent. */
  revert(plugin: Plugin, projectPath: string): Promise<void>
}

const claudeMdContributor: SharedFileContributor = {
  id: 'claude-md',
  appliesTo: (p) => typeof p.manifest.claudeMdInstructions === 'string' && p.manifest.claudeMdInstructions.trim().length > 0,
  relativePaths: () => ['CLAUDE.md'],
  apply: async (p, projectPath) => {
    await upsertBlock(projectPath, p.manifest.name, p.manifest.claudeMdInstructions!)
  },
  revert: async (p, projectPath) => {
    await removeBlock(projectPath, p.manifest.name)
  },
}

export const SHARED_FILE_CONTRIBUTORS: SharedFileContributor[] = [
  claudeMdContributor,
]

/** Run `apply` for every contributor that applies to this plugin. */
export async function applyContributors(plugin: Plugin, projectPath: string): Promise<string[]> {
  const touchedPaths: string[] = []
  for (const c of SHARED_FILE_CONTRIBUTORS) {
    if (!c.appliesTo(plugin)) continue
    await c.apply(plugin, projectPath)
    for (const rel of c.relativePaths(plugin)) {
      if (!touchedPaths.includes(rel)) touchedPaths.push(rel)
    }
  }
  return touchedPaths
}

/** Run `revert` for every contributor that applies to this plugin. */
export async function revertContributors(plugin: Plugin, projectPath: string): Promise<void> {
  for (const c of SHARED_FILE_CONTRIBUTORS) {
    if (!c.appliesTo(plugin)) continue
    await c.revert(plugin, projectPath)
  }
}

/** Project-relative paths every applicable contributor will touch. */
export function contributorPaths(plugin: Plugin): string[] {
  const out: string[] = []
  for (const c of SHARED_FILE_CONTRIBUTORS) {
    if (!c.appliesTo(plugin)) continue
    for (const rel of c.relativePaths(plugin)) {
      if (!out.includes(rel)) out.push(rel)
    }
  }
  return out
}
