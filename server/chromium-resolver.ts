import fs from 'fs'
import path from 'path'

/**
 * Resolve the Chromium executable the browser-capture feature should launch.
 *
 * Mirrors the bundled-runtime resolution used by `path-resolver.ts` for node/git:
 * in desktop mode (`SPECRAILS_IS_DESKTOP=1`) we DISCOVER a bundled Chromium shipped
 * under `<runtimes>/chromium/` (declared in tauri.conf.json via the `runtimes/**`
 * glob, codesigned in CI before `tauri build`). When no bundle is present (dev, a
 * runtimes-less build, or a partial extraction) we return `null` so Playwright
 * falls back to its own managed browser — never dead-ending the feature.
 *
 * We DISCOVER rather than hard-code the path because Playwright's layout changes
 * across versions (e.g. `chrome-mac/Chromium.app` → `chrome-mac-arm64/Google Chrome
 * for Testing.app`, `chrome-win/chrome.exe`, `chrome-linux/chrome`). The CI assembly
 * copies Playwright's platform folder verbatim under `<runtimes>/chromium/`; this
 * walks that tree to find the real executable.
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
 * Returns the absolute path to the bundled Chromium binary, or `null` when no
 * bundle is present (so Playwright uses its managed browser). Never throws.
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
