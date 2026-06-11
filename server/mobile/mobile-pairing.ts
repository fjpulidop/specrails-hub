import { randomBytes } from 'crypto'
import { safeEqual } from '../auth'
import type { MobilePlatform, QrPayload, PairingSessionState, PairApprovedResult } from './mobile-types'

// In-memory pairing state machine. At most one pairing session is open at a time
// (the desktop opens it when the user clicks "Pair device"). Sessions, lockout
// counters, and the one-time token delivery live ONLY in memory — they are voided
// by a process restart/sleep/self-update, which is acceptable (paired devices
// survive in hub.sqlite; an in-progress pair just restarts).
//
// Security (verified gaps from the adversarial review):
//  - secret: 16 random bytes (128-bit), single-use, 60s TTL → no PAKE needed.
//  - claimId: separate 16-byte handle; the token is delivered EXACTLY ONCE then
//    scrubbed (a later poll returns approved-without-token).
//  - lockout: per-IP (5 bad secrets → 60s) AND a global attempt cap (defeats
//    IPv6 privacy-address rotation) that destroys the session on breach.
//  - desktop Approve click gates token issuance (QR possession is not enough).

// 5 minutes: long enough for a manual copy→paste→type flow (e.g. pairing a
// simulator with no camera) while still single-use + gated by the desktop
// approval click + a 128-bit secret, so the leaked-QR window stays small.
const DEFAULT_TTL_MS = 300_000
const PER_IP_MAX_FAILS = 5
const PER_IP_LOCKOUT_MS = 60_000
const GLOBAL_WINDOW_MS = 60_000
const GLOBAL_MAX_ATTEMPTS = 20

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'no-session' | 'expired' | 'locked' | 'invalid' | 'already-claimed' }

export interface PairingDeps {
  certFingerprint: () => string
  hubInstanceId: () => string
  hubName: () => string
  port: () => number
  lanAddresses: () => string[]
  /** Persists an approved device, returns its new id. */
  createDevice: (opts: { name: string; platform: MobilePlatform; token: string; certFingerprint: string }) => string
  /** Fired when a phone successfully claims (desktop shows "X wants to pair"). */
  onClaimed?: (device: { name: string; platform: MobilePlatform }) => void
  clock?: () => number
  genBytes?: (n: number) => Buffer
  ttlMs?: number
}

interface Session {
  secret: string
  claimId: string
  exp: number
  status: 'pending' | 'claimed' | 'approved' | 'denied'
  device?: { name: string; platform: MobilePlatform }
  approved?: PairApprovedResult
  delivered: boolean
}

export class PairingManager {
  private _session: Session | null = null
  private _perIp = new Map<string, { count: number; until: number }>()
  private _globalAttempts: number[] = []
  private readonly _deps: Required<Pick<PairingDeps, 'clock' | 'genBytes' | 'ttlMs'>> & PairingDeps

  constructor(deps: PairingDeps) {
    this._deps = {
      ...deps,
      clock: deps.clock ?? (() => Date.now()),
      genBytes: deps.genBytes ?? ((n) => randomBytes(n)),
      ttlMs: deps.ttlMs ?? DEFAULT_TTL_MS,
    }
  }

  private now(): number {
    return this._deps.clock()
  }

  private b64url(n: number): string {
    return this._deps.genBytes(n).toString('base64url')
  }

  /** Open (or replace) a pairing session and return the QR payload to render. */
  createSession(): QrPayload {
    const now = this.now()
    const session: Session = {
      secret: this.b64url(16),
      claimId: this.b64url(16),
      exp: now + this._deps.ttlMs,
      status: 'pending',
      delivered: false,
    }
    this._session = session
    this._perIp.clear()
    this._globalAttempts = []
    return {
      v: 1,
      hub: this._deps.hubInstanceId(),
      name: this._deps.hubName(),
      addrs: this._deps.lanAddresses(),
      port: this._deps.port(),
      fp: this._deps.certFingerprint(),
      secret: session.secret,
      claimId: session.claimId,
      exp: Math.floor(session.exp / 1000),
    }
  }

  private isExpired(s: Session): boolean {
    return this.now() > s.exp && s.status !== 'approved'
  }

  /** Phone submits the QR secret. Enforces lockout + single-claim. */
  claim(secret: string, device: { name: string; platform: MobilePlatform }, ip: string): ClaimResult {
    const s = this._session
    if (!s) return { ok: false, reason: 'no-session' }
    if (this.isExpired(s)) {
      this._session = null
      return { ok: false, reason: 'expired' }
    }

    // Per-IP lockout
    const rec = this._perIp.get(ip)
    if (rec && rec.until > this.now()) return { ok: false, reason: 'locked' }

    // Global attempt cap (sliding 60s window) — defeats IPv6 privacy rotation.
    const now = this.now()
    this._globalAttempts = this._globalAttempts.filter((t) => now - t < GLOBAL_WINDOW_MS)
    this._globalAttempts.push(now)
    if (this._globalAttempts.length > GLOBAL_MAX_ATTEMPTS) {
      this._session = null
      return { ok: false, reason: 'locked' }
    }

    if (s.status !== 'pending') return { ok: false, reason: 'already-claimed' }

    if (!safeEqual(secret, s.secret)) {
      const next = { count: (rec?.count ?? 0) + 1, until: rec?.until ?? 0 }
      if (next.count >= PER_IP_MAX_FAILS) next.until = now + PER_IP_LOCKOUT_MS
      this._perIp.set(ip, next)
      return { ok: false, reason: 'invalid' }
    }

    s.status = 'claimed'
    s.device = { name: device.name.slice(0, 80) || 'Unknown device', platform: device.platform }
    try { this._deps.onClaimed?.(s.device) } catch { /* non-fatal */ }
    return { ok: true }
  }

  /** Desktop approves → issue a per-device token (delivered once via pollStatus). */
  approve(): { ok: true } | { ok: false; reason: 'no-session' | 'not-claimed' } {
    const s = this._session
    if (!s) return { ok: false, reason: 'no-session' }
    if (s.status !== 'claimed' || !s.device) return { ok: false, reason: 'not-claimed' }
    const token = this._deps.genBytes(32).toString('hex')
    const deviceId = this._deps.createDevice({
      name: s.device.name,
      platform: s.device.platform,
      token,
      certFingerprint: this._deps.certFingerprint(),
    })
    s.approved = {
      approved: true,
      deviceToken: token,
      deviceId,
      hubName: this._deps.hubName(),
      hubInstanceId: this._deps.hubInstanceId(),
    }
    s.status = 'approved'
    return { ok: true }
  }

  deny(): void {
    if (this._session) this._session.status = 'denied'
  }

  cancel(): void {
    this._session = null
  }

  /** Desktop UI poll. */
  getDesktopState(): PairingSessionState | null {
    const s = this._session
    if (!s) return null
    const status = this.isExpired(s) ? 'expired' : s.status
    return { status, claimId: s.claimId, device: s.device }
  }

  /** Phone poll. Delivers the token EXACTLY ONCE, then scrubs it. */
  pollStatus(claimId: string): { status: 'pending' | 'claimed' | 'denied' | 'expired' } | PairApprovedResult {
    const s = this._session
    if (!s || !safeEqual(claimId, s.claimId)) return { status: 'expired' }
    if (s.status === 'approved' && s.approved) {
      if (!s.delivered) {
        s.delivered = true
        const result = s.approved
        // Scrub the token from memory after the single delivery.
        s.approved = { ...result, deviceToken: '' }
        return result
      }
      // Already delivered — never hand the token out twice.
      return { status: 'expired' }
    }
    if (this.isExpired(s)) return { status: 'expired' }
    if (s.status === 'denied') return { status: 'denied' }
    if (s.status === 'claimed') return { status: 'claimed' }
    return { status: 'pending' }
  }
}
