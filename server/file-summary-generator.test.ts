import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

vi.mock('tree-kill', () => ({ default: vi.fn() }))

import treeKill from 'tree-kill'
import { createFileSummaryGenerator } from './file-summary-generator'
import { getAdapter } from './providers'

function fakeChild() {
  const c = new EventEmitter() as any
  c.stdout = new Readable({ read() {} })
  c.stderr = new Readable({ read() {} })
  c.pid = 55555
  c.kill = vi.fn()
  return c
}

const INPUT = { relPath: 'a.ts', contents: 'const x = 1', language: 'en' as const }

describe('createFileSummaryGenerator', () => {
  beforeEach(() => { vi.mocked(treeKill).mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('on timeout tree-kills with SIGTERM then escalates to SIGKILL', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    const gen = createFileSummaryGenerator({
      adapter: getAdapter('claude'),
      cwd: '/tmp',
      spawn: (() => child) as any,
      timeoutMs: 1000,
    })
    const settled = gen(INPUT).then(() => 'ok', (e: Error) => e.message)

    await vi.advanceTimersByTimeAsync(1000) // fire the timeout
    expect(treeKill).toHaveBeenCalledWith(55555, 'SIGTERM')
    expect(vi.mocked(treeKill).mock.calls.some((c) => c[1] === 'SIGKILL')).toBe(false)

    await vi.advanceTimersByTimeAsync(2000) // fire the SIGKILL grace
    expect(vi.mocked(treeKill).mock.calls.some((c) => c[1] === 'SIGKILL')).toBe(true)

    expect(await settled).toContain('timeout')
  })

  it('resolves with the trimmed summary on a clean exit', async () => {
    const child = fakeChild()
    const gen = createFileSummaryGenerator({
      adapter: getAdapter('claude'),
      cwd: '/tmp',
      spawn: (() => child) as any,
    })
    const p = gen(INPUT)
    child.stdout.push(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'This file declares a constant.' }] } }) + '\n',
    )
    child.stdout.push(JSON.stringify({ type: 'result', total_cost_usd: 0.0001 }) + '\n')
    child.stdout.push(null)
    await new Promise((r) => setImmediate(r))
    child.emit('close', 0)

    const out = await p
    expect(out.summary).toBe('This file declares a constant.')
    expect(out.provider).toBe('claude')
  })

  it('rejects on a non-zero exit', async () => {
    const child = fakeChild()
    const gen = createFileSummaryGenerator({
      adapter: getAdapter('claude'),
      cwd: '/tmp',
      spawn: (() => child) as any,
    })
    const p = gen(INPUT).then(() => 'ok', (e: Error) => e.message)
    child.stderr.push('boom\n')
    child.stdout.push(null)
    await new Promise((r) => setImmediate(r))
    child.emit('close', 2)
    expect(await p).toContain('exit code=2')
  })
})
