import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { bundledChromiumCandidates, resolveBundledChromiumPath } from './chromium-resolver'

describe('chromium-resolver', () => {
  const savedDesktop = process.env.SPECRAILS_IS_DESKTOP
  const savedRuntimes = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-resolver-'))
  })

  afterEach(() => {
    if (savedDesktop === undefined) delete process.env.SPECRAILS_IS_DESKTOP
    else process.env.SPECRAILS_IS_DESKTOP = savedDesktop
    if (savedRuntimes === undefined) delete process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
    else process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = savedRuntimes
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns platform-appropriate candidate paths under chromium/', () => {
    const c = bundledChromiumCandidates('/runtimes')
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((p) => p.includes(path.join('/runtimes', 'chromium')))).toBe(true)
    if (process.platform === 'darwin') {
      expect(c.some((p) => p.includes('Chromium.app'))).toBe(true)
    } else if (process.platform === 'win32') {
      expect(c.some((p) => p.endsWith('.exe'))).toBe(true)
    } else {
      expect(c.some((p) => p.includes('chrome-linux'))).toBe(true)
    }
  })

  it('returns null when not in desktop mode', () => {
    delete process.env.SPECRAILS_IS_DESKTOP
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('returns null when the runtimes path is unset', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    delete process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('returns null when no bundled chromium file exists', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('resolves the bundled chromium when a candidate file exists', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    // Create the first candidate file for the current platform.
    const candidate = bundledChromiumCandidates(tmp)[0]
    fs.mkdirSync(path.dirname(candidate), { recursive: true })
    fs.writeFileSync(candidate, 'binary')
    expect(resolveBundledChromiumPath()).toBe(candidate)
  })
})
