import fs from 'fs'
import path from 'path'
import type { PluginLifecycleContext } from '../../types'
import { PluginManager } from '../../plugin-manager'
import { SERENA_MCP_ENTRY } from './manifest'
import { SERENA_INSTRUCTIONS_MD } from './instructions-content'

const FRAGMENT_REL = '.claude/agents/custom-serena.md'

export async function installSerena(ctx: PluginLifecycleContext): Promise<void> {
  ctx.log('Adding mcpServers.serena to .mcp.json')
  await PluginManager.mergeMcpServers(ctx.projectPath, { serena: SERENA_MCP_ENTRY })

  // Fragment lives in the core-protected `.claude/agents/custom-*.md` namespace.
  // Content is embedded at compile time so we don't depend on a sibling .md
  // file surviving bundling or sidecar packaging.
  ctx.log(`Writing ${FRAGMENT_REL}`)
  const fragmentDest = path.join(ctx.projectPath, FRAGMENT_REL)
  fs.mkdirSync(path.dirname(fragmentDest), { recursive: true })
  fs.writeFileSync(fragmentDest, SERENA_INSTRUCTIONS_MD, 'utf8')
  ctx.recordInstalledFile(FRAGMENT_REL)
}

export async function uninstallSerena(ctx: PluginLifecycleContext): Promise<void> {
  ctx.log('Removing mcpServers.serena from .mcp.json')
  await PluginManager.removeMcpServers(ctx.projectPath, ['serena'])

  const fragmentDest = path.join(ctx.projectPath, FRAGMENT_REL)
  if (fs.existsSync(fragmentDest)) {
    ctx.log(`Removing ${FRAGMENT_REL}`)
    try { fs.unlinkSync(fragmentDest) } catch { /* best-effort */ }
  }
}
