/**
 * build-sidecar.mjs
 *
 * Builds the specrails-hub Express server as a self-contained native binary
 * and places it in src-tauri/binaries/ following Tauri's sidecar naming:
 *   specrails-server-<rustc-target-triple>
 *
 * Steps:
 *   1. Bundle server/index.ts → build/server-bundle.js  (via esbuild, CJS)
 *   2. Package with @yao-pkg/pkg → native binary (downloads pre-patched Node)
 *   3. Copy better-sqlite3 .node prebuilt addon alongside the binary
 *
 * Environment variables:
 *   TARGET_TRIPLE — override the Rust target triple (default: auto-detect via rustc)
 */

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
const BINARIES_DIR = path.join(ROOT, 'src-tauri', 'binaries')
const BUNDLE_PATH = path.join(BUILD_DIR, 'server-bundle.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts })
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function getTargetTriple() {
  if (process.env.TARGET_TRIPLE) return process.env.TARGET_TRIPLE
  try {
    const output = execSync('rustc -vV', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
    const match = output.match(/^host:\s+(.+)$/m)
    if (match) return match[1].trim()
  } catch {}
  const p = process.platform, a = process.arch
  if (p === 'darwin' && a === 'arm64') return 'aarch64-apple-darwin'
  if (p === 'darwin' && a === 'x64')   return 'x86_64-apple-darwin'
  if (p === 'win32'  && a === 'x64')   return 'x86_64-pc-windows-msvc'
  if (p === 'linux'  && a === 'x64')   return 'x86_64-unknown-linux-gnu'
  throw new Error(`Cannot determine Rust target triple for platform=${p} arch=${a}`)
}

// Map Rust target triple → @yao-pkg/pkg target
function getPkgTarget(triple) {
  const map = {
    'aarch64-apple-darwin':       'node22-macos-arm64',
    'x86_64-apple-darwin':        'node22-macos-x64',
    'x86_64-pc-windows-msvc':     'node22-win-x64',
    'x86_64-unknown-linux-gnu':   'node22-linux-x64',
    'aarch64-unknown-linux-gnu':  'node22-linux-arm64',
  }
  const target = map[triple]
  if (!target) throw new Error(`No pkg target mapping for triple: ${triple}`)
  return target
}

// ─── Download better-sqlite3 Node 22 compatible prebuild ─────────────────────
// pkg uses Node 22 (MODULE_VERSION 127). The locally compiled .node may target
// a different Node version. Always download the matching prebuild from GitHub.

async function downloadSqliteAddonForNode22(triple) {
  // Map Rust triple → better-sqlite3 prebuild platform-arch
  const platformMap = {
    'aarch64-apple-darwin':       { platform: 'darwin', arch: 'arm64' },
    'x86_64-apple-darwin':        { platform: 'darwin', arch: 'x64' },
    'x86_64-pc-windows-msvc':     { platform: 'win32',  arch: 'x64' },
    'x86_64-unknown-linux-gnu':   { platform: 'linux',  arch: 'x64' },
    'aarch64-unknown-linux-gnu':  { platform: 'linux',  arch: 'arm64' },
  }
  const plat = platformMap[triple]
  if (!plat) throw new Error(`No platform mapping for triple: ${triple}`)

  // better-sqlite3 version from package.json
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'better-sqlite3', 'package.json'), 'utf8'))
  const bsVersion = pkgJson.version  // e.g. "12.8.0"
  // Node 22 MODULE_VERSION = 127
  const nodeModuleVersion = 127
  const fileName = `better-sqlite3-v${bsVersion}-node-v${nodeModuleVersion}-${plat.platform}-${plat.arch}.tar.gz`
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsVersion}/${fileName}`

  const destDir = path.join(BUILD_DIR, 'sqlite-prebuild')
  const tarPath = path.join(destDir, fileName)
  const addonPath = path.join(destDir, 'better_sqlite3.node')

  // Return cached download if present
  if (fs.existsSync(addonPath)) {
    console.log(`  Cached prebuild: ${addonPath}`)
    return addonPath
  }

  fs.mkdirSync(destDir, { recursive: true })

  console.log(`  Downloading ${url}`)
  // Use curl (available on all target platforms in CI)
  execSync(`curl -fsSL "${url}" -o "${tarPath}"`, { stdio: 'inherit' })

  // Extract: the .node file is at build/Release/better_sqlite3.node inside the tarball
  // --strip-components=2 removes "build/Release/" prefix → file lands as better_sqlite3.node
  execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=2 build/Release/better_sqlite3.node`, { stdio: 'inherit' })

  if (!fs.existsSync(addonPath)) {
    throw new Error(`Extraction failed — ${addonPath} not found after tar`)
  }
  console.log(`  Extracted to ${addonPath}`)
  return addonPath
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== SpecRails Hub Sidecar Build ===\n')

  const triple = getTargetTriple()
  const pkgTarget = getPkgTarget(triple)
  console.log(`Rust target:  ${triple}`)
  console.log(`pkg target:   ${pkgTarget}`)
  console.log(`Node:         ${process.version}`)

  ensureDir(BUILD_DIR)
  ensureDir(BINARIES_DIR)

  // Step 1: Bundle with esbuild
  console.log('\n[1/3] Bundling server with esbuild...')
  const { build } = await import('esbuild')
  await build({
    entryPoints: [path.join(ROOT, 'server', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: BUNDLE_PATH,
    external: ['better-sqlite3', 'fsevents'],
    minify: false,
    sourcemap: false,
    target: 'node22',
    logLevel: 'info',
  })
  console.log(`  Bundled to ${BUNDLE_PATH}`)

  // Step 2: Package with @yao-pkg/pkg
  console.log('\n[2/3] Packaging with @yao-pkg/pkg...')
  console.log('  (First run downloads a pre-patched Node binary — may take a moment)')

  const isWindows = process.platform === 'win32'
  const binaryExt = isWindows ? '.exe' : ''
  const outputName = `specrails-server-${triple}${binaryExt}`
  const outputPath = path.join(BINARIES_DIR, outputName)

  // Download Node 22 compatible better-sqlite3 prebuild (MODULE_VERSION 127)
  // pkg bundles Node 22 — we must use a .node compiled for that ABI, not the
  // locally installed one which may target a different Node version.
  const sqliteAddon = await downloadSqliteAddonForNode22(triple)

  // Write a pkg config so the .node addon lands at the virtual path
  // that node-gyp-build expects: /snapshot/node_modules/better-sqlite3/build/Release/
  const pkgConfigPath = path.join(ROOT, 'pkg.config.json')
  const pkgConfig = {
    assets: [
      'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'docs/**/*',
    ],
  }
  fs.writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2))
  console.log(`  pkg config: ${pkgConfigPath}`)

  run(
    `npx --yes @yao-pkg/pkg "${BUNDLE_PATH}" --targets ${pkgTarget} --output "${outputPath}" --no-bytecode --public --config "${pkgConfigPath}"`.trim()
  )
  console.log(`  Binary: ${outputPath}`)

  // Step 3: Copy better-sqlite3 .node addon alongside binary (runtime fallback)
  console.log('\n[3/3] Copying better-sqlite3 native addon (Node 22 compatible)...')
  const addonDest = path.join(BINARIES_DIR, 'better_sqlite3.node')
  fs.copyFileSync(sqliteAddon, addonDest)
  console.log(`  ${sqliteAddon} → ${addonDest}`)

  console.log(`\n=== Sidecar build complete ===`)
  console.log(`  Binary: ${outputPath}`)
  console.log('')
}

main().catch((err) => {
  console.error('\nSidecar build failed:', err.message || err)
  process.exit(1)
})
