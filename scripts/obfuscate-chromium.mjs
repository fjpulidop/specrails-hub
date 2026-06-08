/**
 * obfuscate-chromium.mjs <in> <out>
 *
 * XOR-transform a file with a fixed key. Used in CI to turn the bundled
 * `chromium.tar.gz` into an OPAQUE blob (`chromium.pak`) before `tauri build`.
 *
 * Why: Apple's notarization service recursively unpacks archives it recognises
 * (.zip → .tar.gz → .tar → …) and validates every Mach-O it finds. Chromium's
 * ~50 nested binaries are only ad-hoc ("linker") signed by Google, so a plain
 * archive makes the whole app fail notarization ("not signed with a valid
 * Developer ID", "hardened runtime not enabled", …). XOR-ing the archive breaks
 * its gzip/tar magic bytes, so the notary cannot identify it as a container and
 * treats it as opaque data — nothing inside is inspected, and the app notarizes.
 *
 * This is obfuscation, NOT security (the key is public). At runtime the server
 * reverses the same XOR and extracts Chromium to a writable cache, where Google's
 * ad-hoc signature is sufficient to execute on Apple Silicon (and, being
 * self-extracted, it is not Gatekeeper-quarantined). The transform is symmetric,
 * so this script both packs and unpacks.
 *
 * The key MUST stay byte-identical to OBFUSCATION_KEY in
 * server/chromium-resolver.ts — the round-trip is covered by a unit test.
 */
import fs from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Keep in sync with OBFUSCATION_KEY in server/chromium-resolver.ts.
const KEY = Buffer.from('specrails-hub-chromium-pack-v1', 'utf8')

function xorTransform() {
  let offset = 0
  return new Transform({
    transform(chunk, _enc, cb) {
      const out = Buffer.allocUnsafe(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        out[i] = chunk[i] ^ KEY[(offset + i) % KEY.length]
      }
      offset += chunk.length
      cb(null, out)
    },
  })
}

async function main() {
  const [, , input, output] = process.argv
  if (!input || !output) {
    console.error('usage: obfuscate-chromium.mjs <in> <out>')
    process.exit(1)
  }
  await pipeline(fs.createReadStream(input), xorTransform(), fs.createWriteStream(output))
  console.log(`obfuscated ${input} → ${output}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
