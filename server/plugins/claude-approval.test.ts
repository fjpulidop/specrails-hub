import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { getClaudeApprovalState } from './claude-approval'

let tmpHome: string
let originalHome: string | undefined

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-approval-'))
  originalHome = process.env.HOME
  process.env.HOME = tmpHome
})
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  if (originalHome !== undefined) process.env.HOME = originalHome
  else delete process.env.HOME
})

function writeClaudeJson(content: object): void {
  fs.writeFileSync(path.join(tmpHome, '.claude.json'), JSON.stringify(content), 'utf8')
}

function writeClaudeSettings(content: object): void {
  fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(tmpHome, '.claude', 'settings.json'), JSON.stringify(content), 'utf8')
}

describe('getClaudeApprovalState', () => {
  it('returns pending when ~/.claude.json missing', () => {
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('returns pending when project entry missing', () => {
    writeClaudeJson({ projects: { '/other/path': { enabledMcpjsonServers: ['serena'] } } })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('returns enabled when server in enabledMcpjsonServers', () => {
    writeClaudeJson({
      projects: { '/some/project': { enabledMcpjsonServers: ['serena', 'other'] } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('enabled')
  })

  it('returns disabled when server in disabledMcpjsonServers', () => {
    writeClaudeJson({
      projects: { '/some/project': { disabledMcpjsonServers: ['serena'] } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('disabled')
  })

  it('returns pending when server in neither list and trust not accepted', () => {
    writeClaudeJson({
      projects: { '/some/project': { enabledMcpjsonServers: ['other'], disabledMcpjsonServers: [] } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('returns enabled when project is trusted (hasTrustDialogAccepted=true) and not denied', () => {
    writeClaudeJson({
      projects: { '/some/project': { enabledMcpjsonServers: [], disabledMcpjsonServers: [], hasTrustDialogAccepted: true } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('enabled')
  })

  it('explicit deny wins even on trusted project', () => {
    writeClaudeJson({
      projects: { '/some/project': { enabledMcpjsonServers: [], disabledMcpjsonServers: ['serena'], hasTrustDialogAccepted: true } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('disabled')
  })

  it('returns pending when JSON malformed', () => {
    fs.writeFileSync(path.join(tmpHome, '.claude.json'), '{not')
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('returns enabled when marketplace plugin is enabled (no .mcp.json approval needed)', () => {
    writeClaudeSettings({
      enabledPlugins: { 'serena@claude-plugins-official': true },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('enabled')
  })

  it('marketplace match requires the @ prefix segment to match the server name', () => {
    writeClaudeSettings({
      enabledPlugins: { 'foobar@something': true, 'serena-helper@x': true },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('marketplace ignores entries with value=false', () => {
    writeClaudeSettings({
      enabledPlugins: { 'serena@claude-plugins-official': false },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('pending')
  })

  it('explicit disabledMcpjsonServers wins over marketplace enable', () => {
    writeClaudeJson({ projects: { '/some/project': { disabledMcpjsonServers: ['serena'] } } })
    writeClaudeSettings({ enabledPlugins: { 'serena@claude-plugins-official': true } })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('disabled')
  })

it('findInstalledMarketplaceKeys returns matching keys regardless of enabled state', async () => {
    const installedDir = path.join(tmpHome, '.claude', 'plugins')
    fs.mkdirSync(installedDir, { recursive: true })
    fs.writeFileSync(path.join(installedDir, 'installed_plugins.json'), JSON.stringify({
      plugins: {
        'serena@claude-plugins-official': [{ scope: 'user' }],
        'other@x': [{ scope: 'user' }],
      },
    }))
    const { findInstalledMarketplaceKeys } = await import('./claude-approval')
    expect(findInstalledMarketplaceKeys('serena')).toEqual(['serena@claude-plugins-official'])
    expect(findInstalledMarketplaceKeys('other')).toEqual(['other@x'])
    expect(findInstalledMarketplaceKeys('nope')).toEqual([])
  })

  it('findInstalledButNotEnabledMarketplaceKeys reports only disabled cached plugins', async () => {
    const installedDir = path.join(tmpHome, '.claude', 'plugins')
    fs.mkdirSync(installedDir, { recursive: true })
    fs.writeFileSync(path.join(installedDir, 'installed_plugins.json'), JSON.stringify({
      plugins: { 'serena@claude-plugins-official': [{ scope: 'user' }] },
    }))
    writeClaudeSettings({ enabledPlugins: { 'serena@claude-plugins-official': false } })
    const { findInstalledButNotEnabledMarketplaceKeys } = await import('./claude-approval')
    expect(findInstalledButNotEnabledMarketplaceKeys('serena')).toEqual(['serena@claude-plugins-official'])
  })

  it('findInstalledButNotEnabledMarketplaceKeys is empty when key is enabled', async () => {
    const installedDir = path.join(tmpHome, '.claude', 'plugins')
    fs.mkdirSync(installedDir, { recursive: true })
    fs.writeFileSync(path.join(installedDir, 'installed_plugins.json'), JSON.stringify({
      plugins: { 'serena@claude-plugins-official': [{ scope: 'user' }] },
    }))
    writeClaudeSettings({ enabledPlugins: { 'serena@claude-plugins-official': true } })
    const { findInstalledButNotEnabledMarketplaceKeys } = await import('./claude-approval')
    expect(findInstalledButNotEnabledMarketplaceKeys('serena')).toEqual([])
  })

  it('disabled wins over enabled (defensive: should never happen)', () => {
    writeClaudeJson({
      projects: { '/some/project': {
        enabledMcpjsonServers: ['serena'],
        disabledMcpjsonServers: ['serena'],
      } },
    })
    expect(getClaudeApprovalState('/some/project', 'serena')).toBe('disabled')
  })
})
