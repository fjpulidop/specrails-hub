import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeContextBudget, getContextBudget, clearContextBudgetCache } from './context-budget'

describe('context-budget', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'ctxbudget-'))
    clearContextBudgetCache()
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns zeros for an empty project', () => {
    const b = computeContextBudget(tmp)
    expect(b.specrailsTicketsTokens).toBe(0)
    expect(b.openspecSpecsTokens).toBe(0)
    expect(b.codebaseFileCount).toBe(0)
    expect(b.codebaseEstimatedTokens).toBe(0)
    expect(b.mcpServers).toEqual([])
  })

  it('counts specrails tickets tokens from local-tickets.json', () => {
    const dir = join(tmp, '.specrails')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'local-tickets.json'), JSON.stringify({
      tickets: [{ id: 1, title: 'A test ticket', status: 'todo', priority: 'high', labels: ['ui'], description: 'hello world body' }],
    }))
    const b = computeContextBudget(tmp)
    expect(b.specrailsTicketsTokens).toBeGreaterThan(0)
    expect(b.openspecSpecsTokens).toBe(0)
  })

  it('counts openspec spec tokens', () => {
    const d = join(tmp, 'openspec', 'specs', 'foo')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'spec.md'), 'y'.repeat(800))
    const b = computeContextBudget(tmp)
    expect(b.openspecSpecsTokens).toBeGreaterThan(0)
    expect(b.specrailsTicketsTokens).toBe(0)
  })

  it('walks codebase and counts source files', () => {
    writeFileSync(join(tmp, 'index.ts'), 'export const x = 1')
    mkdirSync(join(tmp, 'src'))
    writeFileSync(join(tmp, 'src', 'app.tsx'), 'export default function App() { return null }')
    writeFileSync(join(tmp, 'binary.png'), 'fake-binary')
    const b = computeContextBudget(tmp)
    expect(b.codebaseFileCount).toBe(2)
    expect(b.codebaseEstimatedTokens).toBeGreaterThan(0)
  })

  it('skips node_modules and dot directories', () => {
    mkdirSync(join(tmp, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(tmp, 'node_modules', 'pkg', 'index.js'), 'huge'.repeat(10000))
    mkdirSync(join(tmp, '.git'))
    writeFileSync(join(tmp, '.git', 'HEAD'), 'ref')
    writeFileSync(join(tmp, 'real.ts'), 'export const x = 1')
    const b = computeContextBudget(tmp)
    expect(b.codebaseFileCount).toBe(1)
  })

  it('reads mcpServers from .mcp.json', () => {
    writeFileSync(join(tmp, '.mcp.json'), JSON.stringify({ mcpServers: { serena: {}, github: {} } }))
    const b = computeContextBudget(tmp)
    expect(b.mcpServers).toEqual(['github', 'serena'])
  })

  it('survives malformed .mcp.json', () => {
    writeFileSync(join(tmp, '.mcp.json'), '{not-json')
    expect(computeContextBudget(tmp).mcpServers).toEqual([])
  })

  it('caches per-project for 60s and invalidates on demand', () => {
    writeFileSync(join(tmp, 'a.ts'), 'x')
    const first = getContextBudget('proj-1', tmp)
    writeFileSync(join(tmp, 'b.ts'), 'y')
    // Still cached
    const second = getContextBudget('proj-1', tmp)
    expect(second.codebaseFileCount).toBe(first.codebaseFileCount)
    clearContextBudgetCache('proj-1')
    const third = getContextBudget('proj-1', tmp)
    expect(third.codebaseFileCount).toBe(2)
  })

  it('cache TTL expires past 60s', () => {
    vi.useFakeTimers()
    try {
      writeFileSync(join(tmp, 'a.ts'), 'x')
      const first = getContextBudget('proj-2', tmp)
      writeFileSync(join(tmp, 'b.ts'), 'y')
      vi.advanceTimersByTime(61_000)
      const second = getContextBudget('proj-2', tmp)
      expect(second.codebaseFileCount).toBe(first.codebaseFileCount + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})
