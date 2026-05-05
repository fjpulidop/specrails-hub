import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { getBlockContent, removeBlock, upsertBlock } from './claude-md-mutation'

let projectPath: string

beforeEach(() => { projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-')) })
afterEach(() => { fs.rmSync(projectPath, { recursive: true, force: true }) })

const claudeMdFile = () => path.join(projectPath, 'CLAUDE.md')

describe('upsertBlock', () => {
  it('creates CLAUDE.md when missing', async () => {
    await upsertBlock(projectPath, 'serena', '## hello')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).toContain('<!-- specrails-hub-managed:serena:start -->')
    expect(text).toContain('<!-- specrails-hub-managed:serena:end -->')
    expect(text).toContain('## hello')
  })

  it('appends block to existing CLAUDE.md preserving user content', async () => {
    fs.writeFileSync(claudeMdFile(), '# My project\n\nUser content here.\n')
    await upsertBlock(projectPath, 'serena', '## hello')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).toMatch(/# My project[\s\S]*User content here/)
    expect(text).toContain('## hello')
  })

  it('replaces existing block content for same plugin', async () => {
    await upsertBlock(projectPath, 'serena', 'v1 content')
    await upsertBlock(projectPath, 'serena', 'v2 content')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).toContain('v2 content')
    expect(text).not.toContain('v1 content')
  })

  it('coexists with blocks from other plugins (additivity)', async () => {
    await upsertBlock(projectPath, 'serena', 'serena content')
    await upsertBlock(projectPath, 'foo', 'foo content')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).toContain('serena content')
    expect(text).toContain('foo content')
    expect(text).toContain('<!-- specrails-hub-managed:serena:start -->')
    expect(text).toContain('<!-- specrails-hub-managed:foo:start -->')
  })
})

describe('getBlockContent', () => {
  it('returns null when CLAUDE.md missing', () => {
    expect(getBlockContent(projectPath, 'serena')).toBeNull()
  })

  it('returns null when block absent', async () => {
    fs.writeFileSync(claudeMdFile(), '# project')
    expect(getBlockContent(projectPath, 'serena')).toBeNull()
  })

  it('returns block content for installed plugin', async () => {
    await upsertBlock(projectPath, 'serena', '## serena hints')
    expect(getBlockContent(projectPath, 'serena')).toContain('## serena hints')
  })
})

describe('removeBlock', () => {
  it('is no-op when CLAUDE.md missing', async () => {
    await removeBlock(projectPath, 'serena')
    expect(fs.existsSync(claudeMdFile())).toBe(false)
  })

  it('removes only the targeted plugin block, preserves others', async () => {
    await upsertBlock(projectPath, 'serena', 'serena content')
    await upsertBlock(projectPath, 'foo', 'foo content')
    await removeBlock(projectPath, 'serena')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).not.toContain('serena content')
    expect(text).not.toContain('specrails-hub-managed:serena')
    expect(text).toContain('foo content')
  })

  it('preserves user content when removing block', async () => {
    fs.writeFileSync(claudeMdFile(), '# project\n\nUser line.\n')
    await upsertBlock(projectPath, 'serena', 'plugin content')
    await removeBlock(projectPath, 'serena')
    const text = fs.readFileSync(claudeMdFile(), 'utf8')
    expect(text).toContain('User line.')
    expect(text).not.toContain('plugin content')
  })
})
