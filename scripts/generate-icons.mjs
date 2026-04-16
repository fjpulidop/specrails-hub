/**
 * generate-icons.mjs
 *
 * Generates all required Tauri app icons from src-tauri/icons/icon.svg
 * using the @tauri-apps/cli `tauri icon` command.
 *
 * Usage:
 *   npm run generate-icons
 *
 * Prerequisites:
 *   @tauri-apps/cli must be installed (it is added as a devDependency in
 *   package.json). Rust toolchain must be available for the tauri command.
 *
 * Output:
 *   src-tauri/icons/32x32.png
 *   src-tauri/icons/128x128.png
 *   src-tauri/icons/128x128@2x.png
 *   src-tauri/icons/icon.icns   (macOS)
 *   src-tauri/icons/icon.ico    (Windows)
 *   src-tauri/icons/icon.png    (Linux)
 */

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const svgPath = path.join(root, 'src-tauri', 'icons', 'icon.svg')

console.log('Generating Tauri icons from', svgPath)

try {
  execSync(`npx tauri icon "${svgPath}"`, {
    cwd: root,
    stdio: 'inherit',
  })
  console.log('Icons generated successfully in src-tauri/icons/')
} catch (err) {
  console.error('Icon generation failed:', err.message)
  console.error(
    'Ensure @tauri-apps/cli is installed and the Rust toolchain is available.'
  )
  process.exit(1)
}
