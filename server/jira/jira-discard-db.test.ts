// Tests for the Jira "Move to <status>" discard data-access additions
// (migration 31: jira_connection.discard_status) plus the discard comment
// idempotency marker in jira-adf.ts.
//
// Mirrors jira-db.test.ts: initDb(':memory:') (migration 31 adds the
// discard_status column) + a deterministic in-memory secret store so token
// crypto is reversible and assertable. This file is additive — it does not edit
// any existing test.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDb, type DbInstance } from '../db'
import { setSecretStore } from './jira-credential-store'
import {
  upsertConnection,
  getConnection,
  getConnectionPublic,
  setDiscardStatus,
  type UpsertConnectionInput,
} from './jira-db'
import { discardCommentMarker, bodyContainsMarker } from './jira-adf'

let db: DbInstance

beforeEach(() => {
  db = initDb(':memory:')
  // Deterministic, reversible crypto: encrypt('x') === 'e:x'; decrypt('e:x') === 'x'.
  setSecretStore({ encrypt: (s) => 'e:' + s, decrypt: (s) => s.slice(2) })
})

afterEach(() => {
  setSecretStore(null)
  db.close()
})

const baseInput = (over: Partial<UpsertConnectionInput> = {}): UpsertConnectionInput => ({
  projectId: 'proj-1',
  baseUrl: 'https://acme.atlassian.net',
  deployment: 'cloud',
  apiVersion: '3',
  authScheme: 'basic',
  accountEmail: 'me@acme.com',
  jiraProjectKey: 'PROJ',
  jiraProjectId: '10001',
  ...over,
})

// ─── setDiscardStatus ──────────────────────────────────────────────────────────

describe('setDiscardStatus', () => {
  it("stores a non-empty status verbatim and getConnection round-trips it", () => {
    upsertConnection(db, baseInput({ token: 't' }))
    // Note: "Won't Do" contains an apostrophe — verifies parameterized storage.
    setDiscardStatus(db, 'proj-1', "Won't Do")
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe("Won't Do")
  })

  it('trims surrounding whitespace before storing', () => {
    upsertConnection(db, baseInput({ token: 't' }))
    setDiscardStatus(db, 'proj-1', '  Done  ')
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe('Done')
  })

  it('stores null when the status is whitespace-only (trim → empty → null)', () => {
    upsertConnection(db, baseInput({ token: 't' }))
    // First set a real value, then clear it with whitespace-only input.
    setDiscardStatus(db, 'proj-1', 'Done')
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe('Done')
    setDiscardStatus(db, 'proj-1', '   ')
    expect(getConnection(db, 'proj-1')!.discardStatus).toBeNull()
  })

  it('stores null when the status is explicitly null', () => {
    upsertConnection(db, baseInput({ token: 't' }))
    setDiscardStatus(db, 'proj-1', 'Cancelled')
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe('Cancelled')
    setDiscardStatus(db, 'proj-1', null)
    expect(getConnection(db, 'proj-1')!.discardStatus).toBeNull()
  })

  it('overwrites a previously-set status with a new value', () => {
    upsertConnection(db, baseInput({ token: 't' }))
    setDiscardStatus(db, 'proj-1', 'Cancelled')
    setDiscardStatus(db, 'proj-1', 'Done')
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe('Done')
  })
})

// ─── mapConnection / discardStatus default ──────────────────────────────────────

describe('mapConnection discardStatus', () => {
  it('defaults discardStatus to null on a freshly upserted connection', () => {
    const conn = upsertConnection(db, baseInput({ token: 't' }))
    expect(conn.discardStatus).toBeNull()
    // Persisted, not just returned by the upsert call.
    expect(getConnection(db, 'proj-1')!.discardStatus).toBeNull()
  })

  it('getConnectionPublic includes discardStatus (and reflects a set value)', () => {
    upsertConnection(db, baseInput({ token: 'secret-token' }))
    let pub = getConnectionPublic(db, 'proj-1')
    expect(pub).not.toBeNull()
    expect(pub!.discardStatus).toBeNull()
    expect('discardStatus' in (pub as object)).toBe(true)

    setDiscardStatus(db, 'proj-1', 'Cancelled')
    pub = getConnectionPublic(db, 'proj-1')
    expect(pub!.discardStatus).toBe('Cancelled')
    // The public shape still never leaks the token.
    expect(pub!.hasToken).toBe(true)
    expect(JSON.stringify(pub)).not.toContain('secret-token')
  })

  it('an upsert that omits discardStatus preserves a previously-set value', () => {
    upsertConnection(db, baseInput({ token: 't' }))
    setDiscardStatus(db, 'proj-1', 'Done')
    // upsertConnection does not touch discard_status, so the value survives.
    upsertConnection(db, baseInput({ token: 't', accountEmail: 'changed@acme.com' }))
    expect(getConnection(db, 'proj-1')!.discardStatus).toBe('Done')
  })
})

// ─── discardCommentMarker / bodyContainsMarker ──────────────────────────────────

describe('discardCommentMarker', () => {
  it('renders the expected [specrails:discard=<nonce>:ticket=<id>] string', () => {
    expect(discardCommentMarker(42, 'abc123')).toBe('[specrails:discard=abc123:ticket=42]')
  })

  it('bodyContainsMarker matches the marker inside a plain wiki-string body', () => {
    const marker = discardCommentMarker(7, 'nonce-7')
    const body = `Moved by Specrails.\n${marker}`
    expect(bodyContainsMarker(body, marker)).toBe(true)
  })

  it('bodyContainsMarker matches the marker inside an ADF doc body', () => {
    const marker = discardCommentMarker(99, 'xyz')
    const adfBody = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `note ${marker}` }] }],
    }
    expect(bodyContainsMarker(adfBody, marker)).toBe(true)
  })

  it('bodyContainsMarker is false when the marker is absent', () => {
    const marker = discardCommentMarker(7, 'nonce-7')
    expect(bodyContainsMarker('unrelated comment', marker)).toBe(false)
    // A discard marker with a different nonce must not match (re-discard distinctness).
    expect(bodyContainsMarker(discardCommentMarker(7, 'other-nonce'), marker)).toBe(false)
  })
})
