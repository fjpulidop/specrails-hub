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

  const first = `${result.stdout ?? ''}`
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0)

  const resolved = first && first.length > 0 ? first : name
  cache.set(name, resolved)
  return resolved
}
