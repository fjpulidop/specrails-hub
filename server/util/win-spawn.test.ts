import { describe, it, expect, beforeEach } from 'vitest'
import { spawnCli, resolveWindowsBinary } from './win-spawn'

describe('resolveWindowsBinary', () => {
  it('returns the input unchanged on POSIX (no-op)', () => {
    // Test runs on the host platform; on POSIX runners (CI is Linux,
    // dev is macOS) the helper short-circuits.
    if (process.platform === 'win32') return
    expect(resolveWindowsBinary('claude')).toBe('claude')
    expect(resolveWindowsBinary('codex')).toBe('codex')
    expect(resolveWindowsBinary('does-not-exist-anywhere')).toBe('does-not-exist-anywhere')
  })
})

describe('spawnCli', () => {
  // POSIX-only — Windows path uses cross-spawn which we don't exercise here.
  beforeEach(() => {
    if (process.platform === 'win32') return
  })

  it('spawns a real binary and resolves child output on POSIX', async () => {
    if (process.platform === 'win32') return
    const child = spawnCli('echo', ['hello world'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout!.on('data', (b: Buffer) => { out += b.toString() })
    const code: number = await new Promise((resolve) => child.on('close', (c) => resolve(c ?? -1)))
    expect(code).toBe(0)
    expect(out.trim()).toBe('hello world')
  })

  it('emits an error event when the binary is missing on POSIX', async () => {
    if (process.platform === 'win32') return
    const child = spawnCli('definitely-not-a-real-binary-xyz', [], { stdio: ['ignore', 'pipe', 'pipe'] })
    const err: Error = await new Promise((resolve) => child.on('error', resolve))
    expect(err).toBeInstanceOf(Error)
    expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
  })
})
