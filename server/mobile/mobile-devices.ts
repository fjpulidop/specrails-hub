import { createHash, randomUUID } from 'crypto'
import type { DbInstance } from '../db'
import type { MobileDeviceRow, MobileDevicePublic, MobilePlatform } from './mobile-types'

// CRUD over hub.sqlite `mobile_devices` (table created by hub migration 12).
// Tokens are stored ONLY as sha256 hashes; the plaintext token is shown to the
// phone exactly once at approval and never persisted.

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createDevice(
  db: DbInstance,
  opts: { name: string; platform: MobilePlatform; tokenHash: string; certFingerprint: string },
): MobileDeviceRow {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO mobile_devices (id, name, platform, token_hash, scopes, cert_fingerprint)
     VALUES (?, ?, ?, ?, 'companion', ?)`,
  ).run(id, opts.name, opts.platform, opts.tokenHash, opts.certFingerprint)
  return db.prepare('SELECT * FROM mobile_devices WHERE id = ?').get(id) as MobileDeviceRow
}

/** Look up a device by its token hash. Returns undefined if unknown OR revoked —
 *  a revoked device must behave as if it never existed. */
export function getActiveDeviceByTokenHash(db: DbInstance, tokenHash: string): MobileDeviceRow | undefined {
  const row = db
    .prepare('SELECT * FROM mobile_devices WHERE token_hash = ?')
    .get(tokenHash) as MobileDeviceRow | undefined
  if (!row || row.revoked_at) return undefined
  return row
}

export function listDevices(db: DbInstance): MobileDevicePublic[] {
  const rows = db
    .prepare('SELECT * FROM mobile_devices ORDER BY created_at DESC')
    .all() as MobileDeviceRow[]
  return rows.map(toPublic)
}

export function toPublic(row: MobileDeviceRow): MobileDevicePublic {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    scopes: row.scopes,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    lastIp: row.last_ip,
    revoked: !!row.revoked_at,
  }
}

/** Mark a device revoked (idempotent). Returns true if a row was affected. */
export function revokeDevice(db: DbInstance, id: string): boolean {
  const res = db
    .prepare("UPDATE mobile_devices SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
    .run(id)
  return res.changes > 0
}

/** Revoke EVERY device — used by cert rotation ("Reset mobile identity"). */
export function revokeAllDevices(db: DbInstance): number {
  const res = db
    .prepare("UPDATE mobile_devices SET revoked_at = datetime('now') WHERE revoked_at IS NULL")
    .run()
  return res.changes
}

/** Refresh last_seen_at/last_ip. Callers throttle this to ~1/min per device. */
export function touchDevice(db: DbInstance, id: string, ip: string | undefined): void {
  db.prepare("UPDATE mobile_devices SET last_seen_at = datetime('now'), last_ip = ? WHERE id = ?").run(ip ?? null, id)
}

/** Sliding-expiry sweep: revoke devices unseen for `days` (default 90). Devices
 *  that have never connected are measured from created_at. Returns count revoked. */
export function sweepExpiredDevices(db: DbInstance, days = 90): number {
  const res = db
    .prepare(
      `UPDATE mobile_devices SET revoked_at = datetime('now')
       WHERE revoked_at IS NULL
         AND COALESCE(last_seen_at, created_at) < datetime('now', ?)`,
    )
    .run(`-${days} days`)
  return res.changes
}
