import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { applyContributors, contributorPaths, revertContributors, SHARED_FILE_CONTRIBUTORS } from './contributors'
import type { Plugin } from '../types'

let projectPath: string

function makePlugin(claudeMdInstructions?: string): Plugin {
  return {
    manifest: {
      name: 'serena',
      version: '1.0.0',
      description: '',
      whatItDoes: [],
      owns: { mcpServers: ['serena'] },
      claudeMdInstructions,
    },
    install: async () => {},
    uninstall: async () => {},
    verify: async () => ({ ok: true, checkedAt: new Date().toISOString() }),
  }
}

beforeEach(() => { projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'contrib-')) })
afterEach(() => { fs.rmSync(projectPath, { recursive: true, force: true }) })

describe('contributors registry', () => {
  it('claude-md contributor present', () => {
    expect(SHARED_FILE_CONTRIBUTORS.find((c) => c.id === 'claude-md')).toBeDefined()
  })
})

describe('contributorPaths', () => {
  it('returns empty when plugin contributes nothing', () => {
    expect(contributorPaths(makePlugin())).toEqual([])
  })

  it('returns CLAUDE.md when plugin has claudeMdInstructions', () => {
    expect(contributorPaths(makePlugin('## hello'))).toEqual(['CLAUDE.md'])
  })

  it('returns empty when claudeMdInstructions is whitespace-only', () => {
    expect(contributorPaths(makePlugin('   \n  '))).toEqual([])
  })
})

describe('applyContributors / revertContributors', () => {
  it('apply writes CLAUDE.md with the plugin block; revert removes it', async () => {
    const plugin = makePlugin('## serena hint')
    const touched = await applyContributors(plugin, projectPath)
    expect(touched).toEqual(['CLAUDE.md'])
    const text = fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf8')
    expect(text).toContain('## serena hint')
    expect(text).toContain('specrails-hub-managed:serena')

    await revertContributors(plugin, projectPath)
    const after = fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf8')
    expect(after).not.toContain('serena hint')
    expect(after).not.toContain('specrails-hub-managed:serena')
  })

  it('apply is idempotent (multiple calls produce same content)', async () => {
    const plugin = makePlugin('## hint')
    await applyContributors(plugin, projectPath)
    await applyContributors(plugin, projectPath)
    const text = fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf8')
    const occurrences = (text.match(/specrails-hub-managed:serena:start/g) || []).length
    expect(occurrences).toBe(1)
  })

  it('apply for plugin A does not touch plugin B block', async () => {
    const a = makePlugin('A content')
    a.manifest.name = 'a'
    const b = makePlugin('B content')
    b.manifest.name = 'b'
    await applyContributors(a, projectPath)
    await applyContributors(b, projectPath)
    await revertContributors(a, projectPath)
    const text = fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf8')
    expect(text).not.toContain('A content')
    expect(text).toContain('B content')
  })

  it('plugin without claudeMdInstructions skips contributor (no file created)', async () => {
    const plugin = makePlugin()
    const touched = await applyContributors(plugin, projectPath)
    expect(touched).toEqual([])
    expect(fs.existsSync(path.join(projectPath, 'CLAUDE.md'))).toBe(false)
  })
})
