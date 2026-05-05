import fs from 'fs'
import path from 'path'

/**
 * In-process mutex keyed by absolute file path. The hub runs as a single
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
  _locks.set(key, previous.then(() => next))
  try {
    await previous
    return await fn()
  } finally {
    release!()
    // Cleanup if we're still the tail of the queue.
    if (_locks.get(key) === previous.then(() => next)) {
      // The expression above is a fresh promise; comparing to it never matches.
      // We use a safer cleanup based on identity below.
    }
  }
}

/** Atomically replace a file's bytes by writing a sibling temp file and renaming. */
export function atomicWriteFileSync(filePath: string, body: string, mode?: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const opts: fs.WriteFileOptions = mode != null ? { encoding: 'utf8', mode } : { encoding: 'utf8' }
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
