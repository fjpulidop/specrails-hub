import { describe, it, expect, vi } from 'vitest'
import * as registry from '../providers/registry'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const fakeStdout = { [Symbol.asyncIterator]: async function* () { yield Buffer.from('{"type":"result","data":{}}\n') } }
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    return {
      stdout: fakeStdout,
      stderr: {
        on: vi.fn(),
        [Symbol.asyncIterator]: async function* () { /* empty */ },
      },
      kill: vi.fn(),
      once: vi.fn((evt: string, cb: (...args: unknown[]) => void) => { handlers[evt] = cb; if (evt === 'exit') setTimeout(() => cb(0, null), 0) }),
    }
  }),
}))

describe('spawnOneShot', () => {
  it('builds argv via adapter.buildArgs and resolves on child exit', async () => {
    vi.spyOn(registry, 'getAdapter').mockReturnValue({
      id: 'claude',
      binary: 'claude',
      buildArgs: vi.fn(() => ['-p', 'hi']),
      parseStreamLine: vi.fn(() => ({ kind: 'other' as const, type: 'noop', raw: {} })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const { spawnOneShot } = await import('./spawn-one-shot')
    const h = spawnOneShot({ providerId: 'claude', model: 'haiku', systemPrompt: 'sys', userPrompt: 'u', cwd: '/tmp' })
    const exit = await h.done
    expect(exit.code).toBe(0)
  })
})
