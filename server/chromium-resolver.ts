import fs from 'fs'
import path from 'path'

/**
 * Resolve the Chromium executable the browser-capture feature should launch.
 *
 * Mirrors the bundled-runtime resolution used by `path-resolver.ts` for node/git:
 * in desktop mode (`SPECRAILS_IS_DESKTOP=1`) we existence-gate a bundled Chromium
 * shipped under `<runtimes>/chromium/` (declared in tauri.conf.json via the
 * `runtimes/**` glob, codesigned in CI before `tauri build`). When the bundled
 * binary is absent (dev, a runtimes-less build, or a partial extraction) we return
 * `null` so Playwright falls back to its own managed Chromium download — never
 * dead-ending the feature.
 *
 * Layout (matches the CI assembly + smoke test):
 *   macOS/Linux: runtimes/chromium/chrome-<plat>/Chromium.app/Contents/MacOS/Chromium
 *                or runtimes/chromium/bin/chromium
 *   Windows:     runtimes/chromium/chrome-win/chrome.exe
 *                or runtimes/chromium/bin/chromium.exe
 *
 * Multiple candidate paths are probed so the exact Playwright tarball layout
 * (which nests under chrome-<platform>/) and a flattened bin/ layout both work.
 */
function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

export function bundledChromiumCandidates(runtimesPath: string): string[] {
  const root = path.join(runtimesPath, 'chromium')
  if (process.platform === 'win32') {
    return [
      path.join(root, 'bin', 'chromium.exe'),
      path.join(root, 'chrome-win', 'chrome.exe'),
      path.join(root, 'chrome.exe'),
    ]
  }
  if (process.platform === 'darwin') {
    return [
      path.join(root, 'bin', 'chromium'),
      path.join(root, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(root, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]
  }
  // linux
  return [
    path.join(root, 'bin', 'chromium'),
    path.join(root, 'chrome-linux', 'chrome'),
    path.join(root, 'chrome'),
  ]
}

/**
 * Returns the absolute path to the bundled Chromium binary, or `null` when no
 * bundle is present (so Playwright uses its managed browser). Never throws.
 */
export function resolveBundledChromiumPath(): string | null {
  if (process.env.SPECRAILS_IS_DESKTOP !== '1') return null
  const runtimesPath = process.env.SPECRAILS_BUNDLED_RUNTIMES_PATH
  if (!runtimesPath) return null
  for (const candidate of bundledChromiumCandidates(runtimesPath)) {
    if (fileExists(candidate)) return candidate
  }
  return null
}
