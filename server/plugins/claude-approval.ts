import fs from 'fs'
import os from 'os'
import path from 'path'

export type ApprovalState = 'enabled' | 'disabled' | 'pending'

interface ClaudeProjectEntry {
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  /** When true, Claude auto-loads `.mcp.json` servers without prompting.
   *  Set after the user accepts the trust dialog the first time the project
   *  is opened. Critical for our deactivate logic — without explicit deny in
   *  `disabledMcpjsonServers`, trusted projects load the server regardless. */
  hasTrustDialogAccepted?: boolean
}

interface ClaudeUserConfig {
  projects?: Record<string, ClaudeProjectEntry>
}

interface ClaudeSettings {
  /** Plugins enabled via Claude Code's plugin marketplace.
   *  Keys look like `<plugin-name>@<source>` (e.g., `serena@claude-plugins-official`). */
  enabledPlugins?: Record<string, boolean>
}

/**
 * Returns the approval state for `<projectPath>` × `<serverName>`. The state
 * is sourced from EITHER:
 *
 *   1. `~/.claude.json` → projects[<path>].{enabled,disabled}McpjsonServers —
 *      the per-project approval set when the user accepts (or denies) the
 *      `.mcp.json` prompt the first time Claude opens the repo.
 *
 *   2. `~/.claude/settings.json` → enabledPlugins["<serverName>@*"] — Claude
 *      Code's plugin-marketplace mechanism. When a user installs an MCP via
 *      the marketplace, Serena (or similar) is available in EVERY project
 *      regardless of `.mcp.json`. The card should reflect that the tool is
 *      loaded, not that our hub-managed `.mcp.json` entry is dormant.
 *
 * Resolution order:
 *   - explicit disable in (1)            → `disabled`
 *   - explicit enable in (1) OR (2)      → `enabled`
 *   - otherwise                          → `pending`
 *
 * Defensive: any I/O / parse error falls back to 'pending'. Never throws.
 */
export function getClaudeApprovalState(projectPath: string, serverName: string): ApprovalState {
  // (1) Per-project mcpjson approval.
  // Order:
  //   - explicit disabled list   → disabled
  //   - explicit enabled list    → enabled
  //   - trusted project          → enabled (Claude auto-loads .mcp.json
  //                                without prompting once trust is granted)
  //   - none of the above        → pending (first prompt not yet shown)
  let mcpjsonState: ApprovalState = 'pending'
  try {
    const configPath = path.join(os.homedir(), '.claude.json')
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ClaudeUserConfig
      const entry = parsed.projects?.[path.resolve(projectPath)]
      if (entry) {
        if (entry.disabledMcpjsonServers?.includes(serverName)) mcpjsonState = 'disabled'
        else if (entry.enabledMcpjsonServers?.includes(serverName)) mcpjsonState = 'enabled'
        else if (entry.hasTrustDialogAccepted === true) mcpjsonState = 'enabled'
      }
    }
  } catch {
    // ignore — falls through to marketplace check
  }

  // Explicit disabled wins over marketplace enable.
  if (mcpjsonState === 'disabled') return 'disabled'

  // (2) Claude marketplace plugin (per-user, project-agnostic).
  let marketplaceEnabled = false
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as ClaudeSettings
      const enabled = settings.enabledPlugins ?? {}
      const prefix = `${serverName}@`
      for (const [key, value] of Object.entries(enabled)) {
        if (value === true && key.startsWith(prefix)) { marketplaceEnabled = true; break }
      }
    }
  } catch {
    // ignore
  }

  if (mcpjsonState === 'enabled' || marketplaceEnabled) return 'enabled'
  return 'pending'
}

/**
 * Returns the keys (e.g., `serena@claude-plugins-official`) under
 * `~/.claude/settings.json#enabledPlugins` that match `<serverName>@*` and
 * are set to `true`. Empty array if none.
 */
export function findEnabledMarketplaceKeys(serverName: string): string[] {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
    if (!fs.existsSync(settingsPath)) return []
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as ClaudeSettings
    const enabled = settings.enabledPlugins ?? {}
    const prefix = `${serverName}@`
    return Object.entries(enabled)
      .filter(([k, v]) => v === true && k.startsWith(prefix))
      .map(([k]) => k)
  } catch {
    return []
  }
}

interface InstalledPluginsFile {
  plugins?: Record<string, unknown>
}

/**
 * Returns the keys present in `~/.claude/plugins/installed_plugins.json`
 * that match `<serverName>@*`, regardless of the `enabledPlugins` toggle.
 * Used to detect plugins that are physically in Claude's cache and may be
 * loaded by Claude even when `enabledPlugins[key]=false` (observed: Claude
 * keeps them resolvable from the cache `.mcp.json`).
 */
export function findInstalledMarketplaceKeys(serverName: string): string[] {
  try {
    const filePath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as InstalledPluginsFile
    const map = parsed.plugins ?? {}
    const prefix = `${serverName}@`
    return Object.keys(map).filter((k) => k.startsWith(prefix))
  } catch {
    return []
  }
}

/**
 * Returns marketplace keys that are physically installed in Claude's plugin
 * cache but NOT enabled (i.e., `enabledPlugins[key] !== true`). These are
 * the ones likely to confuse users — the hub disabled them but the binary +
 * shipped `.mcp.json` are still on disk; Claude may still resolve the server.
 */
export function findInstalledButNotEnabledMarketplaceKeys(serverName: string): string[] {
  const installed = findInstalledMarketplaceKeys(serverName)
  if (installed.length === 0) return []
  let enabledMap: Record<string, boolean> = {}
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as ClaudeSettings
      enabledMap = settings.enabledPlugins ?? {}
    }
  } catch { /* fall through */ }
  return installed.filter((k) => enabledMap[k] !== true)
}

/**
 * Mutates `~/.claude/settings.json` so the named marketplace plugin is set
 * to `false` (disabling it). Atomic temp+rename. Returns true on success.
 *
 * NOTE: this is the only place the hub touches Claude's per-user config.
 * Surface to the user via an explicit action (button/CLI), never silently.
 */
export function disableMarketplacePlugin(marketplaceKey: string): { ok: boolean; reason?: string } {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
    if (!fs.existsSync(settingsPath)) {
      return { ok: false, reason: 'settings-not-found' }
    }
    const raw = fs.readFileSync(settingsPath, 'utf8')
    const settings = JSON.parse(raw) as ClaudeSettings
    settings.enabledPlugins ??= {}
    if (settings.enabledPlugins[marketplaceKey] === false) {
      return { ok: true, reason: 'already-disabled' }
    }
    settings.enabledPlugins[marketplaceKey] = false
    const tmp = `${settingsPath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, settingsPath)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}
