import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import {
  resolveStartupPath,
  augmentPathFromLoginShell,
  parseLoginShellOutput,
  getPathDiagnostic,
  __resetPathResolverForTest,
} from './path-resolver'

const ORIGINAL_PATH = process.env.PATH
const ORIGINAL_PLATFORM = process.platform

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value })
}

describe('resolveStartupPath (fast path)', () => {
  beforeEach(() => {
    __resetPathResolverForTest()
  })

  afterEach(() => {
    process.env.PATH = ORIGINAL_PATH
    setPlatform(ORIGINAL_PLATFORM)
  })

  it('prepends missing brew Apple Silicon dirs on darwin', () => {
    setPlatform('darwin')
    process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
    resolveStartupPath()
    expect(process.env.PATH?.startsWith('/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:')).toBe(true)
    expect(process.env.PATH).toContain('/usr/bin')
  })

  it('is idempotent when dirs already present', () => {
    setPlatform('darwin')
    process.env.PATH = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin'
    const before = process.env.PATH
    resolveStartupPath()
    expect(process.env.PATH).toBe(before)
  })

  it('is no-op on win32', () => {
    setPlatform('win32')
    const before = 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd'
    process.env.PATH = before
    resolveStartupPath()
    expect(process.env.PATH).toBe(before)
  })

  it('records path sources in diagnostic', () => {
    setPlatform('darwin')
    process.env.PATH = '/usr/bin:/bin'
    resolveStartupPath()
    const diag = getPathDiagnostic()
    expect(diag.pathSegments[0]).toBe('/opt/homebrew/bin')
    expect(diag.pathSources[0]).toBe('fast-path')
    expect(diag.pathSources[diag.pathSources.length - 1]).toBe('inherited')
  })
})

describe('parseLoginShellOutput', () => {
  it('extracts content between sentinels and ignores noise', () => {
    const stdout = 'rc-file noise here\nNVM warning\n__SRH_PATH_BEGIN__/Users/me/.volta/bin:/usr/bin:/bin__SRH_PATH_END__\nmore noise'
    expect(parseLoginShellOutput(stdout)).toBe('/Users/me/.volta/bin:/usr/bin:/bin')
  })

  it('returns null when sentinels missing', () => {
    expect(parseLoginShellOutput('no sentinels here')).toBeNull()
    expect(parseLoginShellOutput('__SRH_PATH_BEGIN__incomplete')).toBeNull()
  })
})

describe('augmentPathFromLoginShell', () => {
  beforeEach(() => {
    __resetPathResolverForTest()
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.PATH = ORIGINAL_PATH
    setPlatform(ORIGINAL_PLATFORM)
    process.env.VITEST = 'true'
    process.env.NODE_ENV = 'test'
  })

  it('skips spawn under VITEST=true', async () => {
    process.env.VITEST = 'true'
    setPlatform('darwin')
    process.env.PATH = '/usr/bin'
    const spawnFn = vi.fn()
    await augmentPathFromLoginShell({ spawnFn: spawnFn as any })
    expect(spawnFn).not.toHaveBeenCalled()
    expect(getPathDiagnostic().loginShellStatus).toBe('skipped')
  })

  it('merges new segments from login shell output', async () => {
    setPlatform('darwin')
    process.env.PATH = '/usr/bin:/bin'
    const fakeSpawn = makeFakeSpawn({
      stdout: '__SRH_PATH_BEGIN__/Users/me/.volta/bin:/usr/bin:/bin__SRH_PATH_END__',
      exitCode: 0,
    })
    await augmentPathFromLoginShell({ spawnFn: fakeSpawn as any })
    expect(process.env.PATH?.startsWith('/Users/me/.volta/bin:')).toBe(true)
    expect(getPathDiagnostic().loginShellStatus).toBe('ok')
  })

  it('leaves PATH unchanged on timeout', async () => {
    setPlatform('darwin')
    process.env.PATH = '/usr/bin:/bin'
    const before = process.env.PATH
    const hangingSpawn = makeFakeSpawn({ stdout: '', exitCode: null, hang: true })
    await augmentPathFromLoginShell({ spawnFn: hangingSpawn as any, timeoutMs: 30 })
    expect(process.env.PATH).toBe(before)
    expect(getPathDiagnostic().loginShellStatus).toBe('timeout')
  })

  it('reports error when spawn fails', async () => {
    setPlatform('darwin')
    process.env.PATH = '/usr/bin'
    const errorSpawn = (() => {
      const child: any = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => { /* noop */ }
      setImmediate(() => child.emit('error', new Error('boom')))
      return () => child
    })()
    await augmentPathFromLoginShell({ spawnFn: errorSpawn as any })
    expect(getPathDiagnostic().loginShellStatus).toBe('error')
  })

  it('is no-op on win32', async () => {
    setPlatform('win32')
    const before = process.env.PATH
    const spawnFn = vi.fn()
    await augmentPathFromLoginShell({ spawnFn: spawnFn as any })
    expect(spawnFn).not.toHaveBeenCalled()
    expect(process.env.PATH).toBe(before)
  })
})

function makeFakeSpawn(opts: { stdout: string; exitCode: number | null; hang?: boolean }) {
  return () => {
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    let killed = false
    child.kill = () => {
      killed = true
      setImmediate(() => child.emit('close', null))
    }
    if (!opts.hang) {
      setImmediate(() => {
        if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout, 'utf-8'))
        child.emit('close', opts.exitCode)
      })
    }
    // When hang=true, only resolves via kill triggered by timeout
    void killed
    return child
  }
}
