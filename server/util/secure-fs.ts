import fs from 'fs'

/**
 * Best-effort filesystem hardening for the ~/.specrails data stores (H-13).
 *
 * The auth token is deliberately persisted 0600, but the SQLite databases were
 * created with the default umask (typically dir 0755 / file 0644), leaving
 * webhook HMAC secrets, chat transcripts, and verbatim terminal command history
 * world-readable on a multi-user machine. These helpers restrict the data dir to
 * owner-only and the db files (plus their WAL sidecars) to owner read/write.
 *
 * POSIX permission bits are a no-op on Windows (NTFS uses ACLs and the per-user
 * profile already isolates the home dir), so both helpers early-return there —
 * we never pretend a chmod that did nothing succeeded.
 */

/** Restrict a directory to owner-only (0700). No-op on Windows / on error. */
export function secureDir(dir: string): void {
  if (process.platform === 'win32') return
  try {
    fs.chmodSync(dir, 0o700)
  } catch {
    // Best-effort: a chmod failure must never crash startup.
  }
}

/**
 * Restrict a SQLite db file and its `-wal`/`-shm` sidecars to 0600.
 * No-op on Windows, for `:memory:`, and on error (sidecars may not exist yet).
 */
export function secureDbFile(dbPath: string): void {
  if (process.platform === 'win32') return
  if (dbPath === ':memory:') return
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      // Sidecar may not exist yet, or fs may reject — best-effort.
    }
  }
}
