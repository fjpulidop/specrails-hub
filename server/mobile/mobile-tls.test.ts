import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadOrCreateCert, rotateCert, fingerprintOf } from './mobile-tls'

describe('mobile-tls', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobtls-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates and persists an ECDSA cert with a 64-hex fingerprint', async () => {
    const cert = await loadOrCreateCert(dir)
    expect(cert.certPem).toContain('BEGIN CERTIFICATE')
    expect(cert.keyPem).toContain('PRIVATE KEY')
    expect(cert.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.existsSync(path.join(dir, 'tls-cert.pem'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'tls-key.pem'))).toBe(true)
  })

  it('returns the SAME cert on a second load (persisted, not regenerated)', async () => {
    const a = await loadOrCreateCert(dir)
    const b = await loadOrCreateCert(dir)
    expect(b.fingerprint).toBe(a.fingerprint)
    expect(b.certPem).toBe(a.certPem)
  })

  it('fingerprintOf is consistent with the loaded cert', async () => {
    const cert = await loadOrCreateCert(dir)
    expect(fingerprintOf(cert.certPem)).toBe(cert.fingerprint)
  })

  it('rotateCert produces a different identity', async () => {
    const a = await loadOrCreateCert(dir)
    const b = await rotateCert(dir)
    expect(b.fingerprint).not.toBe(a.fingerprint)
    // The on-disk cert is now the rotated one.
    const c = await loadOrCreateCert(dir)
    expect(c.fingerprint).toBe(b.fingerprint)
  })

  it('regenerates if the stored files are corrupt', async () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'tls-cert.pem'), 'garbage')
    fs.writeFileSync(path.join(dir, 'tls-key.pem'), 'garbage')
    const cert = await loadOrCreateCert(dir)
    expect(cert.certPem).toContain('BEGIN CERTIFICATE')
  })
})
