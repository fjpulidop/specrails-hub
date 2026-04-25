// Windows .cmd resolution helper.
//
// `spawn(name, args, { shell: true })` on Windows finds .cmd shims
// but concatenates args into a single command line — multi-line
// strings (e.g. claude's `--system-prompt`) get truncated at the
// first newline by cmd.exe.
//
// `spawn(name, args, { shell: false })` preserves args correctly but
// can't resolve .cmd shims on Windows.
//
// This helper bridges the gap: probe `where <name>` once to get the
// absolute path of the .cmd shim, then callers can spawn that path
// with shell:false and intact args.

import { spawnSync } from 'child_process'

const cache = new Map<string, string>()

export function resolveWindowsBinary(name: string): string {
  if (process.platform !== 'win32') return name
  const cached = cache.get(name)
  if (cached !== undefined) return cached

  const result = spawnSync('where', [name], {
    encoding: 'utf-8',
    shell: false,
  })
  if (result.error || (result.status ?? 1) !== 0) {
    cache.set(name, name)
    return name
  }

  // `where claude` typically returns multiple lines:
  //   C:\Users\x\AppData\Roaming\npm\claude       (sh script — fails ENOENT on spawn)
  //   C:\Users\x\AppData\Roaming\npm\claude.cmd   (the one Node can spawn directly)
  //   C:\Users\x\AppData\Roaming\npm\claude.ps1
  // Prefer Windows-executable extensions; the bare entry is a sh script
  // and Node cannot exec it without a shell.
  const lines = `${result.stdout ?? ''}`
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const exeExt = /\.(cmd|bat|exe|com)$/i
  const preferred = lines.find((p) => exeExt.test(p)) ?? lines[0]
  const resolved = preferred && preferred.length > 0 ? preferred : name
  cache.set(name, resolved)
  return resolved
}
