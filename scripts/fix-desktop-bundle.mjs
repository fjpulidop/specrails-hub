/**
 * fix-desktop-bundle.mjs
 *
 * Post-`tauri build` step: copies `src-tauri/binaries/node-pty/` into the bundled
 * app's resources while preserving directory structure. Tauri's glob-based resource
 * mechanism flattens nested directories, which breaks node-pty's runtime path
 * resolution (specifically `prebuilds/<platform>-<arch>/spawn-helper` and
 * `native.dir` lookups). This script is the reliable workaround.
 *
 * macOS:   <bundle>/Contents/Resources/node-pty/
 * Linux:   resources/node-pty/ (alongside the binary in the AppImage/deb)
 * Windows: resources/node-pty/ (alongside the .exe in the install dir)
 *
 * For now this implementation handles macOS `.app` bundles. Linux/Windows
 * follow-up as needed.
 *
 * Also ensures `spawn-helper` retains its executable bit, since some bundling
 * steps drop mode bits.
 *
 * Re-signs pty.node + spawn-helper in the node-pty copy if APPLE_SIGNING_IDENTITY
 * is set, so notarization accepts them.
 */

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const NODE_PTY_SRC = path.join(ROOT, 'src-tauri', 'binaries', 'node-pty')
const BUNDLE_DIR = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle')

function log(msg) { console.log(`[fix-desktop-bundle] ${msg}`) }

function copyDirPreservingStructure(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true, dereference: false })
}

function ensureSpawnHelperExecutable(nodePtyRoot) {
  if (process.platform === 'win32') return
  const prebuildsDir = path.join(nodePtyRoot, 'prebuilds')
  if (!fs.existsSync(prebuildsDir)) return
  for (const entry of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, entry, 'spawn-helper')
    if (fs.existsSync(helper)) {
      try { fs.chmodSync(helper, 0o755); log(`+x ${helper}`) } catch { /* ignore */ }
    }
  }
}

function codesignNodePty(nodePtyRoot) {
  const identity = process.env.APPLE_SIGNING_IDENTITY
  if (process.platform !== 'darwin' || !identity) return
  const entitlementsPath = path.join(ROOT, 'src-tauri', 'entitlements.plist')
  const prebuildsDir = path.join(nodePtyRoot, 'prebuilds')
  if (!fs.existsSync(prebuildsDir)) return
  for (const entry of fs.readdirSync(prebuildsDir)) {
    const dir = path.join(prebuildsDir, entry)
    const pty = path.join(dir, 'pty.node')
    const helper = path.join(dir, 'spawn-helper')
    if (fs.existsSync(pty)) {
      execSync(`codesign --force --sign "${identity}" --timestamp "${pty}"`, { stdio: 'inherit' })
    }
    if (fs.existsSync(helper)) {
      execSync(`codesign --force --sign "${identity}" --options runtime --entitlements "${entitlementsPath}" --timestamp "${helper}"`, { stdio: 'inherit' })
    }
  }
}

function findMacAppBundles() {
  const macosDir = path.join(BUNDLE_DIR, 'macos')
  if (!fs.existsSync(macosDir)) return []
  return fs.readdirSync(macosDir)
    .filter((n) => n.endsWith('.app'))
    .map((n) => path.join(macosDir, n))
}

function patchMacApp(appPath) {
  const resources = path.join(appPath, 'Contents', 'Resources')
  const dest = path.join(resources, 'node-pty')
  log(`Copying node-pty → ${dest}`)
  copyDirPreservingStructure(NODE_PTY_SRC, dest)
  ensureSpawnHelperExecutable(dest)
  codesignNodePty(dest)
}

function main() {
  if (!fs.existsSync(NODE_PTY_SRC)) {
    log(`ERROR: ${NODE_PTY_SRC} does not exist — run build:sidecar first`)
    process.exit(1)
  }
  if (process.platform === 'darwin') {
    const apps = findMacAppBundles()
    if (apps.length === 0) {
      log(`WARN: no .app bundle found under ${BUNDLE_DIR}/macos/ — nothing to patch`)
      return
    }
    for (const app of apps) patchMacApp(app)
    log(`Done. Patched ${apps.length} .app bundle(s).`)
  } else {
    log(`NOTE: post-bundle node-pty fix not implemented for ${process.platform} yet — panel may not work in packaged build.`)
  }
}

main()
