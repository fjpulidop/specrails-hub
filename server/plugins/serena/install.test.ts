import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { installSerena, uninstallSerena } from './install'
import type { PluginLifecycleContext } from '../../types'

let projectPath: string

function makeCtx(): PluginLifecycleContext & { recorded: string[]; logs: string[] } {
  const recorded: string[] = []
  const logs: string[] = []
  return {
    projectPath,
    projectId: 'pid',
    recordInstalledFile: (rel) => recorded.push(rel),
    log: (line) => logs.push(line),
    recorded,
    logs,
  }
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'serena-install-'))
})
afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
})

describe('installSerena', () => {
  it('creates .mcp.json with the serena entry on a fresh project', async () => {
    const ctx = makeCtx()
    await installSerena(ctx)
    const mcp = JSON.parse(fs.readFileSync(path.join(projectPath, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.serena.command).toBe('uvx')
    expect(mcp.mcpServers.serena.args).toContain('serena')
    expect(mcp.mcpServers.serena.args).toContain('start-mcp-server')
  })

  it('preserves user-authored mcpServers entries', async () => {
    fs.writeFileSync(path.join(projectPath, '.mcp.json'), JSON.stringify({ mcpServers: { myown: { command: 'me' } } }))
    const ctx = makeCtx()
    await installSerena(ctx)
    const mcp = JSON.parse(fs.readFileSync(path.join(projectPath, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.myown.command).toBe('me')
    expect(mcp.mcpServers.serena).toBeDefined()
  })

  it('writes the optional fragment file and records it', async () => {
    const ctx = makeCtx()
    await installSerena(ctx)
    const fragPath = path.join(projectPath, '.claude', 'agents', 'custom-serena.md')
    expect(fs.existsSync(fragPath)).toBe(true)
    expect(ctx.recorded).toContain('.claude/agents/custom-serena.md')
  })
})

describe('uninstallSerena', () => {
  it('removes only the serena mcpServers entry', async () => {
    fs.writeFileSync(path.join(projectPath, '.mcp.json'), JSON.stringify({ mcpServers: { myown: { command: 'me' } } }))
    const ctx = makeCtx()
    await installSerena(ctx)
    await uninstallSerena(ctx)
    const mcp = JSON.parse(fs.readFileSync(path.join(projectPath, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.myown).toBeDefined()
    expect(mcp.mcpServers.serena).toBeUndefined()
  })

  it('removes the fragment file', async () => {
    const ctx = makeCtx()
    await installSerena(ctx)
    await uninstallSerena(ctx)
    expect(fs.existsSync(path.join(projectPath, '.claude', 'agents', 'custom-serena.md'))).toBe(false)
  })
})
