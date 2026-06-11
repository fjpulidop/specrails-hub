import { describe, it, expect, beforeEach } from 'vitest'
import { PairingManager, type PairingDeps } from './mobile-pairing'

// Deterministic byte source: returns predictable buffers so secrets are known.
function makeDeps(over: Partial<PairingDeps> = {}): { mgr: PairingManager; created: Array<{ name: string; token: string }>; claimed: string[] } {
  const created: Array<{ name: string; token: string }> = []
  const claimed: string[] = []
  let counter = 0
  const mgr = new PairingManager({
    certFingerprint: () => 'fp-current',
    hubInstanceId: () => 'hub-1',
    hubName: () => 'Mac',
    port: () => 4202,
    lanAddresses: () => ['192.168.1.10'],
    createDevice: (o) => { created.push({ name: o.name, token: o.token }); return `dev-${created.length}` },
    onClaimed: (d) => { claimed.push(d.name) },
    // Each call returns a unique deterministic buffer so secret != claimId != token.
    genBytes: (n) => Buffer.alloc(n, (counter++ % 250) + 1),
    clock: () => 1_000_000,
    ...over,
  })
  return { mgr, created, claimed }
}

describe('PairingManager', () => {
  it('creates a session with a QR payload carrying fp/secret/claimId/exp', () => {
    const { mgr } = makeDeps()
    const qr = mgr.createSession()
    expect(qr.v).toBe(1)
    expect(qr.fp).toBe('fp-current')
    expect(qr.addrs).toEqual(['192.168.1.10'])
    expect(qr.port).toBe(4202)
    expect(qr.secret).toBeTruthy()
    expect(qr.claimId).toBeTruthy()
    expect(qr.secret).not.toBe(qr.claimId)
    expect(qr.exp).toBe(Math.floor((1_000_000 + 300_000) / 1000))
  })

  it('full happy path: claim → approve → token delivered exactly once', () => {
    const { mgr, created, claimed } = makeDeps()
    const qr = mgr.createSession()
    expect(mgr.claim(qr.secret, { name: 'iPhone de Javi', platform: 'ios' }, '1.2.3.4')).toEqual({ ok: true })
    expect(claimed).toEqual(['iPhone de Javi'])
    expect(mgr.getDesktopState()?.status).toBe('claimed')

    expect(mgr.approve()).toEqual({ ok: true })
    expect(created).toHaveLength(1)

    const first = mgr.pollStatus(qr.claimId)
    expect('approved' in first && first.approved).toBe(true)
    if ('deviceToken' in first) {
      expect(first.deviceToken).toBeTruthy()
      expect(first.deviceId).toBe('dev-1')
    }
    // Second poll must NOT return the token again.
    const second = mgr.pollStatus(qr.claimId)
    expect('status' in second && second.status).toBe('expired')
  })

  it('rejects a wrong secret and locks the IP after 5 failures', () => {
    const { mgr } = makeDeps()
    const qr = mgr.createSession()
    for (let i = 0; i < 4; i++) {
      expect(mgr.claim('wrong', { name: 'x', platform: 'ios' }, '9.9.9.9')).toEqual({ ok: false, reason: 'invalid' })
    }
    // 5th wrong → still invalid but now locks.
    expect(mgr.claim('wrong', { name: 'x', platform: 'ios' }, '9.9.9.9')).toEqual({ ok: false, reason: 'invalid' })
    // 6th attempt from the same IP → locked, even with the RIGHT secret.
    expect(mgr.claim(qr.secret, { name: 'x', platform: 'ios' }, '9.9.9.9')).toEqual({ ok: false, reason: 'locked' })
  })

  it('global attempt cap destroys the session (defeats IP rotation)', () => {
    const { mgr } = makeDeps()
    const qr = mgr.createSession()
    // 21 attempts from distinct IPs trips the global cap (>20).
    let lastReason = ''
    for (let i = 0; i < 21; i++) {
      const r = mgr.claim('wrong', { name: 'x', platform: 'ios' }, `10.0.0.${i}`)
      if (!r.ok) lastReason = r.reason
    }
    expect(lastReason).toBe('locked')
    // Session destroyed → a correct secret now finds no session.
    expect(mgr.claim(qr.secret, { name: 'x', platform: 'ios' }, '1.1.1.1')).toEqual({ ok: false, reason: 'no-session' })
  })

  it('expires after the TTL', () => {
    let t = 1_000_000
    const { mgr } = makeDeps({ clock: () => t })
    const qr = mgr.createSession()
    t += 301_000
    expect(mgr.claim(qr.secret, { name: 'x', platform: 'ios' }, '1.1.1.1')).toEqual({ ok: false, reason: 'expired' })
    expect(mgr.pollStatus(qr.claimId).status ?? '').toBe('expired')
  })

  it('claim without a session, approve without a claim, deny + cancel', () => {
    const { mgr } = makeDeps()
    expect(mgr.claim('x', { name: 'a', platform: 'ios' }, 'ip')).toEqual({ ok: false, reason: 'no-session' })
    expect(mgr.approve()).toEqual({ ok: false, reason: 'no-session' })
    const qr = mgr.createSession()
    expect(mgr.approve()).toEqual({ ok: false, reason: 'not-claimed' })
    mgr.claim(qr.secret, { name: 'a', platform: 'ios' }, 'ip')
    mgr.deny()
    expect(mgr.pollStatus(qr.claimId).status).toBe('denied')
    mgr.cancel()
    expect(mgr.getDesktopState()).toBeNull()
  })

  it('a second claim on an already-claimed session is rejected', () => {
    const { mgr } = makeDeps()
    const qr = mgr.createSession()
    mgr.claim(qr.secret, { name: 'a', platform: 'ios' }, 'ip')
    expect(mgr.claim(qr.secret, { name: 'b', platform: 'android' }, 'ip')).toEqual({ ok: false, reason: 'already-claimed' })
  })

  it('pollStatus with an unknown claimId returns expired', () => {
    const { mgr } = makeDeps()
    mgr.createSession()
    expect(mgr.pollStatus('not-the-claim-id').status ?? '').toBe('expired')
  })
})
