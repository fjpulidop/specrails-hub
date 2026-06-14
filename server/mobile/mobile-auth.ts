import type { Request, Response, NextFunction } from 'express'
import type { DbInstance } from '../db'
import type { MobileDeviceRow } from './mobile-types'
import { hashToken, getActiveDeviceByTokenHash, touchDevice } from './mobile-devices'

// Auth for the gateway's /v1 surface and WS upgrades. A request is authenticated
// iff it carries `Authorization: Bearer <deviceToken>` whose sha256 matches a
// non-revoked row in mobile_devices AND that row's cert_fingerprint equals the
// gateway's CURRENT cert fingerprint (so rotating the cert instantly invalidates
// every device — the KDE-Connect-2025 lesson: verify identity + credential
// together, every request).
//
// Additional guards:
//  - Reject any request carrying an `Origin` header. Native clients never set
//    one; a browser does. Combined with the gateway sending no CORS headers, this
//    closes the DNS-rebinding / drive-by vector (the browser couldn't read the
//    response anyway, but we refuse to even process it).
//  - Per-IP request rate limit (coarse) to blunt floods.

export interface MobileAuthedRequest extends Request {
  mobileDevice?: MobileDeviceRow
}

export function extractBearer(req: Request): string | null {
  const h = req.headers['authorization']
  if (typeof h === 'string' && h.startsWith('Bearer ')) {
    const t = h.slice(7).trim()
    return t.length > 0 ? t : null
  }
  return null
}

/** Resolve a device from a raw token against the current cert fingerprint, or
 *  null. Shared by the REST middleware and the WS upgrade check. */
export function resolveDevice(
  db: DbInstance,
  token: string | null,
  currentFingerprint: string,
): MobileDeviceRow | null {
  if (!token) return null
  const row = getActiveDeviceByTokenHash(db, hashToken(token))
  if (!row) return null
  if (row.cert_fingerprint !== currentFingerprint) return null
  return row
}

export interface MobileAuthOptions {
  db: DbInstance
  currentFingerprint: () => string
  /** Coarse per-IP requests/minute cap (default 600). */
  ratePerMinute?: number
  clock?: () => number
}

export function createMobileAuthMiddleware(opts: MobileAuthOptions) {
  const ratePerMinute = opts.ratePerMinute ?? 600
  const clock = opts.clock ?? (() => Date.now())
  const lastTouch = new Map<string, number>()
  const ipHits = new Map<string, number[]>()
  // Periodically evict stale keys so these maps can't grow unbounded under a
  // multi-source flood (each per-IP timestamp array self-bounds to the 60s
  // window, but the Map KEYS would otherwise live forever, one per distinct IP).
  let lastSweep = clock()

  return function mobileAuth(req: Request, res: Response, next: NextFunction): void {
    // 1. Refuse browser-origin requests outright.
    if (req.headers['origin']) {
      res.status(403).json({ error: 'Forbidden: origin not allowed' })
      return
    }

    // 2. Coarse per-IP rate limit.
    const ip = req.socket?.remoteAddress ?? 'unknown'
    const now = clock()
    // Sweep stale tracking at most once per window (cheap, amortized O(1)).
    if (now - lastSweep > 60_000) {
      lastSweep = now
      for (const [k, v] of ipHits) {
        if (v.length === 0 || now - v[v.length - 1] >= 60_000) ipHits.delete(k)
      }
      for (const [k, t] of lastTouch) {
        if (now - t >= 3_600_000) lastTouch.delete(k) // drop device touch-cache after 1h idle
      }
    }
    const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 60_000)
    hits.push(now)
    ipHits.set(ip, hits)
    if (hits.length > ratePerMinute) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    // 3. Token → device, fingerprint-bound.
    const device = resolveDevice(opts.db, extractBearer(req), opts.currentFingerprint())
    if (!device) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // 4. Throttled last-seen update (≤1/min per device).
    const prev = lastTouch.get(device.id) ?? 0
    if (now - prev > 60_000) {
      lastTouch.set(device.id, now)
      try { touchDevice(opts.db, device.id, ip) } catch { /* non-fatal */ }
    }

    ;(req as MobileAuthedRequest).mobileDevice = device
    next()
  }
}
