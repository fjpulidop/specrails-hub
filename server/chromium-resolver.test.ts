import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { discoverChromiumExecutable, resolveBundledChromiumPath } from './chromium-resolver'

describe('chromium-resolver', () => {
  const savedDesktop = process.env.SPECRAILS_IS_DESKTOP
  const savedRuntimes = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  let tmp: string

  // Build a fake Playwright-style chromium tree for the current platform and
  // return [chromiumRoot, expectedExecutablePath].
  function makeChromiumTree(root: string): string {
    fs.mkdirSync(root, { recursive: true })
    if (process.platform === 'win32') {
      const dir = path.join(root, 'chrome-win')
      fs.mkdirSync(dir, { recursive: true })
      const exe = path.join(dir, 'chrome.exe')
      fs.writeFileSync(exe, 'x')
      return exe
    }
    if (process.platform === 'darwin') {
      const macos = path.join(root, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS')
      fs.mkdirSync(macos, { recursive: true })
      const exe = path.join(macos, 'Google Chrome for Testing')
      fs.writeFileSync(exe, 'x')
      return exe
    }
    const dir = path.join(root, 'chrome-linux')
    fs.mkdirSync(dir, { recursive: true })
    const exe = path.join(dir, 'chrome')
    fs.writeFileSync(exe, 'x')
    return exe
  }

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

  it('discovers the bundled chromium executable for the current platform', () => {
    const root = path.join(tmp, 'chromium')
    const exe = makeChromiumTree(root)
    expect(discoverChromiumExecutable(root)).toBe(exe)
  })

  it('discoverChromiumExecutable returns null for an empty/missing tree', () => {
    expect(discoverChromiumExecutable(path.join(tmp, 'nope'))).toBeNull()
    fs.mkdirSync(path.join(tmp, 'empty'))
    expect(discoverChromiumExecutable(path.join(tmp, 'empty'))).toBeNull()
  })

  it('returns null when not in desktop mode', () => {
    delete process.env.SPECRAILS_IS_DESKTOP
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    makeChromiumTree(path.join(tmp, 'chromium'))
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('returns null when the runtimes path is unset', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    delete process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('returns null when no bundled chromium exists', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    expect(resolveBundledChromiumPath()).toBeNull()
  })

  it('resolves the bundled chromium when present (desktop mode)', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    const exe = makeChromiumTree(path.join(tmp, 'chromium'))
    expect(resolveBundledChromiumPath()).toBe(exe)
  })
})
