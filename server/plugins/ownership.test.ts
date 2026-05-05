import { describe, it, expect } from 'vitest'
import type { Plugin } from '../types'
import { buildOwnershipMap, PluginOwnershipConflictError } from './ownership'

function stub(name: string, owns: Plugin['manifest']['owns']): Plugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      description: '',
      whatItDoes: [],
      owns,
    },
    install: async () => {},
    uninstall: async () => {},
    verify: async () => ({ ok: true, checkedAt: new Date().toISOString() }),
  }
}

describe('buildOwnershipMap', () => {
  it('handles empty registry', () => {
    const map = buildOwnershipMap([])
    expect(map.mcpServers.size).toBe(0)
    expect(map.agentFragments.size).toBe(0)
    expect(map.byName.size).toBe(0)
  })

  it('records ownership for a single plugin', () => {
    const plugin = stub('serena', {
      mcpServers: ['serena'],
      agentFragments: ['.claude/agents/custom-serena.md'],
    })
    const map = buildOwnershipMap([plugin])
    expect(map.mcpServers.get('serena')).toBe('serena')
    expect(map.agentFragments.get('.claude/agents/custom-serena.md')).toBe('serena')
    expect(map.byName.get('serena')).toBe(plugin)
  })

  it('accepts two plugins with disjoint ownership', () => {
    const a = stub('a', { mcpServers: ['x'], agentFragments: ['.claude/agents/custom-a.md'] })
    const b = stub('b', { mcpServers: ['y'], agentFragments: ['.claude/agents/custom-b.md'] })
    const map = buildOwnershipMap([a, b])
    expect(map.mcpServers.get('x')).toBe('a')
    expect(map.mcpServers.get('y')).toBe('b')
    expect(map.byName.size).toBe(2)
  })

  it('throws when two plugins claim the same mcpServers key', () => {
    const a = stub('a', { mcpServers: ['shared'] })
    const b = stub('b', { mcpServers: ['shared'] })
    let err: unknown
    try { buildOwnershipMap([a, b]) } catch (e) { err = e }
    expect(err).toBeInstanceOf(PluginOwnershipConflictError)
    const ce = err as PluginOwnershipConflictError
    expect(ce.conflicts).toHaveLength(1)
    expect(ce.conflicts[0].kind).toBe('mcpServers')
    expect(ce.conflicts[0].key).toBe('shared')
    expect(ce.conflicts[0].plugins.sort()).toEqual(['a', 'b'])
    expect(ce.message).toContain('a')
    expect(ce.message).toContain('b')
    expect(ce.message).toContain('shared')
  })

  it('throws when two plugins claim the same agent fragment path', () => {
    const a = stub('a', { agentFragments: ['.claude/agents/custom-shared.md'] })
    const b = stub('b', { agentFragments: ['.claude/agents/custom-shared.md'] })
    expect(() => buildOwnershipMap([a, b])).toThrow(PluginOwnershipConflictError)
  })

  it('throws when two plugins claim the same configKeys entry', () => {
    const a = stub('a', { configKeys: ['x'] })
    const b = stub('b', { configKeys: ['x'] })
    expect(() => buildOwnershipMap([a, b])).toThrow(PluginOwnershipConflictError)
  })

  it('throws on duplicate plugin names', () => {
    const a = stub('serena', { mcpServers: ['a'] })
    const b = stub('serena', { mcpServers: ['b'] })
    expect(() => buildOwnershipMap([a, b])).toThrow(/duplicate plugin name/)
  })

  it('throws when manifest is missing required fields', () => {
    const broken = { manifest: { name: '', version: '1', description: '', whatItDoes: [], owns: {} } } as unknown as Plugin
    expect(() => buildOwnershipMap([broken])).toThrow(/missing required field: name/)
  })
})
