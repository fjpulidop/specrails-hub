import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import {
  discoverChromiumExecutable,
  resolveBundledChromiumPath,
  resolveBundledChromiumExecutable,
} from './chromium-resolver'

describe('chromium-resolver', () => {
  const savedDesktop = process.env.SPECRAILS_IS_DESKTOP
  const savedRuntimes = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  const savedCache = process.env.SPECRAILS_CHROMIUM_CACHE_DIR
  let tmp: string

  // Build a fake Playwright-style chromium tree for the current platform and
  // return the expected executable path.
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

  // The single platform folder name inside makeChromiumTree (chrome-mac-arm64 / …).
  function platformFolder(): string {
    if (process.platform === 'win32') return 'chrome-win'
    if (process.platform === 'darwin') return 'chrome-mac-arm64'
    return 'chrome-linux'
  }

  // Pack a fake chromium tree into <runtimes>/chromium/chromium.tar.gz using system tar.
  function makeArchive(runtimesPath: string): string {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-stage-'))
    makeChromiumTree(staging)
    const chromiumDir = path.join(runtimesPath, 'chromium')
    fs.mkdirSync(chromiumDir, { recursive: true })
    const archive = path.join(chromiumDir, 'chromium.tar.gz')
    const r = spawnSync('tar', ['-czf', archive, '-C', staging, platformFolder()])
    fs.rmSync(staging, { recursive: true, force: true })
    if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`)
    return archive
  }

  // Pack a fake chromium tree into <runtimes>/chromium/chromium.pak via the REAL
  // CI obfuscation script — proving the script's XOR key matches the resolver's.
  function makeObfuscatedArchive(runtimesPath: string): string {
    const tarGz = makeArchive(runtimesPath)
    const pak = path.join(runtimesPath, 'chromium', 'chromium.pak')
    const r = spawnSync('node', ['scripts/obfuscate-chromium.mjs', tarGz, pak])
    if (r.status !== 0) throw new Error(`obfuscate failed: ${r.stderr}`)
    fs.rmSync(tarGz, { force: true }) // ship only the .pak
    return pak
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-resolver-'))
    process.env.SPECRAILS_CHROMIUM_CACHE_DIR = path.join(tmp, 'cache')
  })
  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    restore('SPECRAILS_IS_DESKTOP', savedDesktop)
    restore('SPECRAILS_BUNDLED_RUNTIMES_PATH', savedRuntimes)
    restore('SPECRAILS_CHROMIUM_CACHE_DIR', savedCache)
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

  // ── resolveBundledChromiumPath (sync, unpacked-only) ───────────────────────

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

  it('resolves the unpacked bundled chromium when present (desktop mode)', () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    const exe = makeChromiumTree(path.join(tmp, 'chromium'))
    expect(resolveBundledChromiumPath()).toBe(exe)
  })

  // ── resolveBundledChromiumExecutable (async, extracts archive) ─────────────

  it('async resolver returns null when not in desktop mode', async () => {
    delete process.env.SPECRAILS_IS_DESKTOP
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    makeArchive(tmp)
    expect(await resolveBundledChromiumExecutable()).toBeNull()
  })

  it('async resolver returns null when runtimes path is unset', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    delete process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
    expect(await resolveBundledChromiumExecutable()).toBeNull()
  })

  it('async resolver falls back to an unpacked tree when no archive is shipped', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    const exe = makeChromiumTree(path.join(tmp, 'chromium'))
    expect(await resolveBundledChromiumExecutable()).toBe(exe)
  })

  it('async resolver extracts the shipped archive and returns the executable', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    makeArchive(tmp)
    const exe = await resolveBundledChromiumExecutable()
    expect(exe).toBeTruthy()
    // Extracted under the cache dir, not the read-only runtimes path.
    expect(exe!.startsWith(process.env.SPECRAILS_CHROMIUM_CACHE_DIR!)).toBe(true)
    expect(fs.existsSync(exe!)).toBe(true)
    // Marker written so a later run can skip re-extraction.
    expect(fs.existsSync(path.join(process.env.SPECRAILS_CHROMIUM_CACHE_DIR!, '.source'))).toBe(true)
  })

  it('async resolver de-obfuscates and extracts a chromium.pak blob', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    const pak = makeObfuscatedArchive(tmp)
    // The .pak must not be a readable gzip/tar (else the notary would recurse it).
    expect(fs.readFileSync(pak).subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))).toBe(false)
    const exe = await resolveBundledChromiumExecutable()
    expect(exe).toBeTruthy()
    expect(exe!.startsWith(process.env.SPECRAILS_CHROMIUM_CACHE_DIR!)).toBe(true)
    expect(fs.existsSync(exe!)).toBe(true)
  })

  it('async resolver reuses the extracted cache when the marker matches (no re-extract)', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    // Ship a JUNK archive (not a valid tar) but pre-populate the cache + matching marker.
    const chromiumDir = path.join(tmp, 'chromium')
    fs.mkdirSync(chromiumDir, { recursive: true })
    const archive = path.join(chromiumDir, 'chromium.tar.gz')
    fs.writeFileSync(archive, 'not-a-real-tar')
    const cache = process.env.SPECRAILS_CHROMIUM_CACHE_DIR!
    const exe = makeChromiumTree(cache)
    const st = fs.statSync(archive)
    fs.writeFileSync(path.join(cache, '.source'), `${st.size}:${Math.round(st.mtimeMs)}`)

    // Returns the cached exe purely from the marker — extracting the junk archive would throw.
    expect(await resolveBundledChromiumExecutable()).toBe(exe)
  })

  it('async resolver returns null when the archive is corrupt and no fallback exists', async () => {
    process.env.SPECRAILS_IS_DESKTOP = '1'
    process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH = tmp
    const chromiumDir = path.join(tmp, 'chromium')
    fs.mkdirSync(chromiumDir, { recursive: true })
    fs.writeFileSync(path.join(chromiumDir, 'chromium.tar.gz'), 'corrupt')
    expect(await resolveBundledChromiumExecutable()).toBeNull()
  })
})
