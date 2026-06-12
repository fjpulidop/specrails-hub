import fs from 'fs'
import path from 'path'

/**
 * In-process mutex keyed by absolute file path. The app runs as a single
 * Node process so cross-process locking (proper-lockfile, flock) is not
 * required for v1: every install / uninstall path goes through this module.
 *
 * If the architecture ever moves to multi-process or parallel test workers
 * sharing a project directory, swap this for an advisory file lock. The API
 * surface (`withFileLock`) is intentionally narrow so the swap is mechanical.
 */
const _locks = new Map<string, Promise<unknown>>()

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath)
  const previous = _locks.get(key) ?? Promise.resolve()
  let release: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  // B74: hold the SAME promise reference we store, so the finally can compare by
  // identity. The old code rebuilt `previous.then(() => next)` in the finally — a
  // fresh promise that never matched, so the cleanup never ran and `_locks` grew
  // one entry per distinct file path forever.
  const chained = previous.then(() => next)
  _locks.set(key, chained)
  try {
    await previous
    return await fn()
  } finally {
    release!()
    // Drop the entry only if no later caller has chained onto us (i.e. we are
    // still the tail). Otherwise their chain depends on ours — leave it.
    if (_locks.get(key) === chained) {
      _locks.delete(key)
    }
  }
}

/** Atomically replace a file's bytes by writing a sibling temp file and renaming.
 *  Accepts a raw Buffer for byte-identical restores (rollback of snapshots that
 *  may contain non-UTF8 bytes); a string is written as UTF-8. */
export function atomicWriteFileSync(filePath: string, body: string | Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  // Node ignores the encoding option for Buffer payloads; only set it for strings.
  const opts: fs.WriteFileOptions = Buffer.isBuffer(body)
    ? (mode != null ? { mode } : {})
    : (mode != null ? { encoding: 'utf8', mode } : { encoding: 'utf8' })
  fs.writeFileSync(tmp, body, opts)
  fs.renameSync(tmp, filePath)
}

/** Read+parse JSON; returns `defaultValue` when the file is missing. Throws on malformed JSON. */
export function readJsonOr<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) return defaultValue
  const raw = fs.readFileSync(filePath, 'utf8')
  if (!raw.trim()) return defaultValue
  return JSON.parse(raw) as T
}

/**
 * Surgically merge a JSON file by passing the parsed object (or `null` when
 * absent) to `mutator` and atomically writing back the result. The mutator
 * MUST return the new object to write, or `null` to delete the file.
 *
 * Holds an in-process file lock for the whole read-modify-write round trip.
 */
export async function surgicalMergeJson(
  filePath: string,
  mutator: (current: Record<string, unknown> | null) => Record<string, unknown> | null,
): Promise<void> {
  await withFileLock(filePath, async () => {
    let current: Record<string, unknown> | null = null
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      current = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : null
    }
    const next = mutator(current)
    if (next === null) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    }
    atomicWriteFileSync(filePath, JSON.stringify(next, null, 2) + '\n')
  })
}

/**
 * Surgically remove top-level or nested keys from a JSON file. `paths` is a
 * list of dot-separated paths (e.g., "mcpServers.serena"). Missing paths are
 * a no-op. The file is not removed even when emptied — callers preserve the
 * "state file always survives" invariant.
 */
export async function surgicalRemoveKeys(filePath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await surgicalMergeJson(filePath, (current) => {
    if (!current) return current
    for (const p of paths) {
      const segments = p.split('.')
      let cursor: Record<string, unknown> | undefined = current
      for (let i = 0; i < segments.length - 1; i++) {
        const next = cursor?.[segments[i]]
        if (typeof next !== 'object' || next === null) { cursor = undefined; break }
        cursor = next as Record<string, unknown>
      }
      if (cursor) delete cursor[segments[segments.length - 1]]
    }
    return current
  })
}
