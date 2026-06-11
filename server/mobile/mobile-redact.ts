import os from 'os'

// Information-minimisation for everything the gateway hands a phone. Two rules:
//   1. Drop same-machine keys outright (filesystem paths, db handles).
//   2. Replace the user's home directory inside any remaining string with `~`
//      so a `command` like `/specrails:implement #34` keeps its useful shape but
//      an embedded absolute path (or a stray cwd) leaks no local layout.
//
// Applied to EVERY proxied REST JSON body and EVERY outbound WS payload.

const SENSITIVE_KEYS = new Set(['path', 'db_path', 'dbPath', 'absolutePath', 'cwd', 'filePath', 'projectPath'])

function homeDir(): string {
  try {
    return os.homedir()
  } catch {
    return ''
  }
}

/** Replace occurrences of the user's home dir with `~` (covers the common leak:
 *  project paths live under ~/...). Cheap and safe — never mangles normal text. */
export function stripHome(s: string): string {
  const home = homeDir()
  if (!home) return s
  return s.split(home).join('~')
}

/** Deep-redact a JSON-serialisable value: drop sensitive keys, scrub home dir in
 *  strings. Returns a new structure; never mutates the input. */
export function redact<T>(value: T): T {
  return _redact(value) as T
}

function _redact(value: unknown): unknown {
  if (typeof value === 'string') return stripHome(value)
  if (Array.isArray(value)) return value.map(_redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue
      out[k] = _redact(v)
    }
    return out
  }
  return value
}
