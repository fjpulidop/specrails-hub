import { describe, it, expect, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { initDesktopDb } from '../desktop-db'
import type { DbInstance } from '../db'
import { createDevice, hashToken } from './mobile-devices'
import { extractBearer, resolveDevice, createMobileAuthMiddleware } from './mobile-auth'

function fakeReq(over: Partial<{ headers: Record<string, string>; remoteAddress: string }> = {}): Request {
  return {
    headers: over.headers ?? {},
    socket: { remoteAddress: over.remoteAddress ?? '1.2.3.4' },
  } as unknown as Request
}

function fakeRes(): { res: Response; captured: { status: number; body: unknown } } {
  const captured = { status: 200, body: undefined as unknown }
  const res = {
    status(code: number) { captured.status = code; return this },
    json(obj: unknown) { captured.body = obj; return this },
  } as unknown as Response
  return { res, captured }
}

describe('mobile-auth', () => {
  let db: DbInstance
  beforeEach(() => { db = initDesktopDb(':memory:') })

  it('extractBearer parses the Authorization header', () => {
    expect(extractBearer(fakeReq({ headers: { authorization: 'Bearer abc' } }))).toBe('abc')
    expect(extractBearer(fakeReq({ headers: { authorization: 'Basic xyz' } }))).toBeNull()
    expect(extractBearer(fakeReq())).toBeNull()
  })

  it('resolveDevice requires a known, non-revoked, fingerprint-matching token', () => {
    createDevice(db, { name: 'A', platform: 'ios', tokenHash: hashToken('tok'), certFingerprint: 'fp1' })
    expect(resolveDevice(db, 'tok', 'fp1')?.name).toBe('A')
    expect(resolveDevice(db, 'tok', 'fp2')).toBeNull() // cert rotated
    expect(resolveDevice(db, 'wrong', 'fp1')).toBeNull()
    expect(resolveDevice(db, null, 'fp1')).toBeNull()
  })

  it('middleware: 403 on Origin, 401 on bad token, next on valid', () => {
    createDevice(db, { name: 'A', platform: 'ios', tokenHash: hashToken('tok'), certFingerprint: 'fp' })
    const mw = createMobileAuthMiddleware({ db, currentFingerprint: () => 'fp' })

    // Origin present → 403
    {
      const { res, captured } = fakeRes()
      let nexted = false
      mw(fakeReq({ headers: { origin: 'http://evil', authorization: 'Bearer tok' } }), res, () => { nexted = true })
      expect(captured.status).toBe(403)
      expect(nexted).toBe(false)
    }
    // Bad token → 401
    {
      const { res, captured } = fakeRes()
      mw(fakeReq({ headers: { authorization: 'Bearer nope' } }), res, () => { /* noop */ })
      expect(captured.status).toBe(401)
    }
    // Valid → next + req.mobileDevice set
    {
      const { res } = fakeRes()
      const req = fakeReq({ headers: { authorization: 'Bearer tok' } })
      let nexted = false
      mw(req, res, () => { nexted = true })
      expect(nexted).toBe(true)
      expect((req as unknown as { mobileDevice?: { name: string } }).mobileDevice?.name).toBe('A')
    }
  })

  it('middleware enforces a per-IP rate limit', () => {
    createDevice(db, { name: 'A', platform: 'ios', tokenHash: hashToken('tok'), certFingerprint: 'fp' })
    const t = 1000
    const mw = createMobileAuthMiddleware({ db, currentFingerprint: () => 'fp', ratePerMinute: 3, clock: () => t })
    let lastStatus = 0
    for (let i = 0; i < 5; i++) {
      const { res, captured } = fakeRes()
      mw(fakeReq({ headers: { authorization: 'Bearer tok' }, remoteAddress: '5.5.5.5' }), res, () => { captured.status = 200 })
      lastStatus = captured.status
    }
    expect(lastStatus).toBe(429)
  })
})
