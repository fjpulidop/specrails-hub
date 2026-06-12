import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'

/**
 * Resolve the Chromium executable the browser-capture feature should launch.
 *
 * In desktop mode (`SPECRAILS_IS_DESKTOP=1`) we ship Chromium INSIDE the app, but
 * NOT as an unpacked directory: Tauri's resource bundler dereferences symlinks when
 * it copies `bundle.resources` into the .app (tauri-apps/tauri#13219), which mangles
 * Chromium's versioned `*.framework` (the `Versions/Current` + top-level symlinks
 * become flat duplicate copies) and invalidates its code signature — macOS
 * notarization then rejects the app ("The signature of the binary is invalid").
 *
 * So we ship Chromium as a single OPAQUE, OBFUSCATED blob
 * (`<runtimes>/chromium/chromium.pak`):
 *   - It is an XOR-transformed `chromium.tar.gz`. The notarization service recursively
 *     unpacks archives it recognises (.zip → .tar.gz → .tar → …) and validates every
 *     Mach-O inside; Chromium's ~50 nested binaries are only ad-hoc ("linker") signed
 *     by Google, so a plain archive fails notarization. XOR-ing breaks the gzip/tar
 *     magic, so the notary cannot identify the file as a container and treats it as
 *     opaque data — nothing inside is inspected, and the app notarizes with NO
 *     Developer-ID signing of Chromium. (Obfuscation, not security: the key is public.)
 *   - Tauri also copies it as one regular file — nothing to dereference.
 *   - At first use we reverse the XOR and extract it to a writable cache
 *     (`~/.specrails/runtimes/chromium`), restoring the framework symlinks intact. The
 *     extracted Chromium keeps Google's ad-hoc signature, which is sufficient to execute
 *     on Apple Silicon, and — being self-extracted rather than downloaded — carries no
 *     `com.apple.quarantine` xattr, so Gatekeeper does not block it.
 *
 * A plain `chromium.tar.gz`/`chromium.tar` is also accepted (e.g. unobfuscated local
 * builds). When no archive is present (dev, a runtimes-less build, a partial
 * extraction) we fall back to discovering an UNPACKED `<runtimes>/chromium` tree, and
 * finally to `null` so Playwright uses its own managed browser — never dead-ending.
 *
 * We DISCOVER rather than hard-code the executable path because Playwright's layout
 * changes across versions (`chrome-mac/Chromium.app` → `chrome-mac-arm64/Google Chrome
 * for Testing.app`, `chrome-win/chrome.exe`, `chrome-linux/chrome`).
 */

const MAX_DEPTH = 6

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile() } catch { return false }
}

/** Depth-bounded search for the first file whose basename satisfies `match`. */
function findFirstFile(root: string, match: (name: string) => boolean, depth = 0): string | null {
  if (depth > MAX_DEPTH) return null
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return null }
  // Files first (cheap), then recurse into dirs.
  for (const e of entries) {
    if (e.isFile() && match(e.name)) return path.join(root, e.name)
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = findFirstFile(path.join(root, e.name), match, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/** On macOS: locate the main executable inside the first `*.app` under `root`. */
function findMacAppExecutable(root: string, depth = 0): string | null {
  if (depth > MAX_DEPTH) return null
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return null }
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith('.app')) {
      const macosDir = path.join(root, e.name, 'Contents', 'MacOS')
      // The main binary is conventionally named like the app (sans ".app");
      // fall back to the first regular file in MacOS/.
      const preferred = path.join(macosDir, e.name.slice(0, -'.app'.length))
      if (isFile(preferred)) return preferred
      try {
        for (const inner of fs.readdirSync(macosDir, { withFileTypes: true })) {
          if (inner.isFile()) return path.join(macosDir, inner.name)
        }
      } catch { /* keep searching */ }
    }
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.endsWith('.app')) {
      const hit = findMacAppExecutable(path.join(root, e.name), depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/** Find the bundled Chromium executable under `<chromiumRoot>`, or null. */
export function discoverChromiumExecutable(chromiumRoot: string): string | null {
  if (!fs.existsSync(chromiumRoot)) return null
  if (process.platform === 'win32') {
    return findFirstFile(chromiumRoot, (n) => n === 'chrome.exe' || n === 'chromium.exe')
  }
  if (process.platform === 'darwin') {
    return (
      findMacAppExecutable(chromiumRoot) ??
      findFirstFile(chromiumRoot, (n) => n === 'Chromium' || n === 'chromium' || n === 'chrome')
    )
  }
  // linux
  return findFirstFile(chromiumRoot, (n) => n === 'chrome' || n === 'chromium' || n === 'chrome-wrapper')
}

/**
 * Returns the absolute path to an UNPACKED bundled Chromium binary, or `null`.
 *
 * This is the synchronous, no-extraction path: it only inspects a chromium tree that
 * already exists on disk under `<runtimes>/chromium`. Prefer the async
 * `resolveBundledChromiumExecutable()` for the launch path — it additionally extracts
 * the shipped `chromium.tar.gz` archive. Kept for the unpacked fallback (local builds)
 * and never throws.
 */
export function resolveBundledChromiumPath(): string | null {
  if (process.env.SPECRAILS_IS_DESKTOP !== '1') return null
  const runtimesPath = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  if (!runtimesPath) return null
  try {
    return discoverChromiumExecutable(path.join(runtimesPath, 'chromium'))
  } catch {
    return null
  }
}

/** Candidate archive names under `<runtimes>/chromium`, in preference order. */
const ARCHIVE_NAMES = ['chromium.pak', 'chromium.tar.gz', 'chromium.tar']

// XOR key for the obfuscated `chromium.pak` blob. Keep byte-identical to KEY in
// scripts/obfuscate-chromium.mjs — the round-trip is covered by a unit test.
// (Safe to have changed at the rebrand: the .pak and this binary always ship
// together in the same bundle, and the extraction cache re-extracts on a new
// archive via the `.source` marker.)
const OBFUSCATION_KEY = Buffer.from('specrails-desktop-chromium-pack-v1', 'utf8')

/** Streaming XOR transform (symmetric: packs and unpacks). */
function xorStream(): Transform {
  let offset = 0
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const out = Buffer.allocUnsafe(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        out[i] = chunk[i] ^ OBFUSCATION_KEY[(offset + i) % OBFUSCATION_KEY.length]
      }
      offset += chunk.length
      cb(null, out)
    },
  })
}

/** De-obfuscate a `.pak` blob into a real `.tar.gz` at `outPath`. */
async function deobfuscate(pakPath: string, outPath: string): Promise<void> {
  await pipeline(fs.createReadStream(pakPath), xorStream(), fs.createWriteStream(outPath))
}

/** Writable extraction destination (overridable for tests via env). */
function chromiumCacheDir(): string {
  return (
    process.env.SPECRAILS_CHROMIUM_CACHE_DIR ||
    path.join(os.homedir(), '.specrails', 'runtimes', 'chromium')
  )
}

/** Identity string for an archive (size:mtime) used to skip re-extraction. */
function archiveIdentity(archivePath: string): string {
  const st = fs.statSync(archivePath)
  return `${st.size}:${Math.round(st.mtimeMs)}`
}

/** Resolve the platform `tar` binary. macOS/Linux ship `/usr/bin/tar`; Windows 10+ ships `tar` (bsdtar) on PATH. */
function tarBinary(): string {
  if (process.platform !== 'win32' && isFile('/usr/bin/tar')) return '/usr/bin/tar'
  return 'tar'
}

/** Extract `archivePath` into `destDir` using the system tar (auto-detects gzip). */
function runTarExtract(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tarBinary(), ['-xf', archivePath, '-C', destDir], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited ${code}: ${stderr.trim().slice(0, 500)}`))
    })
  })
}

// In-process single-slot cache so concurrent / StrictMode double-invokes share one
// extraction instead of racing. Keyed by archive identity; invalidated if it changes.
let _extractInflight: { identity: string; promise: Promise<string | null> } | null = null

/** First archive that exists under `<runtimes>/chromium`, or null. */
function findBundledArchive(runtimesPath: string): string | null {
  for (const name of ARCHIVE_NAMES) {
    const p = path.join(runtimesPath, 'chromium', name)
    if (isFile(p)) return p
  }
  return null
}

async function extractAndDiscover(archivePath: string, identity: string): Promise<string | null> {
  const destRoot = chromiumCacheDir()
  const marker = path.join(destRoot, '.source')

  // Fast path: already extracted from this exact archive.
  try {
    if (fs.readFileSync(marker, 'utf8') === identity) {
      const exe = discoverChromiumExecutable(destRoot)
      if (exe) return exe
    }
  } catch { /* not yet extracted / stale → fall through */ }

  // Extract to a temp sibling, then atomically swap in.
  const tmpDir = `${destRoot}.tmp-${process.pid}`
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })
  // An obfuscated `.pak` is XOR-decoded to a real `.tar.gz` first; plain archives
  // are fed straight to tar.
  const isPak = archivePath.endsWith('.pak')
  const decodedTar = isPak ? `${tmpDir}.tar.gz` : null
  try {
    let tarSource = archivePath
    if (decodedTar) {
      await deobfuscate(archivePath, decodedTar)
      tarSource = decodedTar
    }
    await runTarExtract(tarSource, tmpDir)
    const exeInTmp = discoverChromiumExecutable(tmpDir)
    if (!exeInTmp) throw new Error('no chromium executable found after extraction')
    try { fs.chmodSync(exeInTmp, 0o755) } catch { /* perms best-effort */ }

    fs.rmSync(destRoot, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(destRoot), { recursive: true })
    fs.renameSync(tmpDir, destRoot)
    fs.writeFileSync(marker, identity)
    return discoverChromiumExecutable(destRoot)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (decodedTar) fs.rmSync(decodedTar, { force: true })
  }
}

/**
 * Resolve the bundled Chromium executable for the launch path, extracting the
 * shipped archive on first use. Returns `null` (never throws) when not in desktop
 * mode, when no bundle is present, or when extraction fails — so Playwright falls
 * back to its managed browser rather than dead-ending.
 */
export async function resolveBundledChromiumExecutable(): Promise<string | null> {
  if (process.env.SPECRAILS_IS_DESKTOP !== '1') return null
  const runtimesPath = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  if (!runtimesPath) return null

  let archivePath: string | null = null
  try { archivePath = findBundledArchive(runtimesPath) } catch { archivePath = null }

  // No archive shipped → fall back to an unpacked tree (local/dev builds).
  if (!archivePath) return resolveBundledChromiumPath()

  let identity: string
  try { identity = archiveIdentity(archivePath) } catch { return resolveBundledChromiumPath() }

  if (_extractInflight && _extractInflight.identity === identity) {
    return _extractInflight.promise
  }
  const promise = extractAndDiscover(archivePath, identity).catch((err) => {
    console.error('[chromium-resolver] extraction failed:', err instanceof Error ? err.message : err)
    _extractInflight = null // allow a later retry
    return resolveBundledChromiumPath()
  })
  _extractInflight = { identity, promise }
  return promise
}
