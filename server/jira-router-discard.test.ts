import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, type DbInstance } from './db'
import { createJiraRouter } from './jira-router'
import { upsertConnection } from './jira/jira-db'
import { setSecretStore, type SecretStore } from './jira/jira-credential-store'
import type { ProjectContext } from './project-registry'

// Deterministic, in-memory secret store so tests never touch the real keyfile.
const fakeSecretStore: SecretStore = {
  encrypt: (plaintext: string) => `enc:${plaintext}`,
  decrypt: (blob: string) => blob.replace(/^enc:/, ''),
}

const PROJECT_ID = 'p1'

type JiraSyncManagerStub = {
  probeCredentials: ReturnType<typeof vi.fn>
  discoverProjects: ReturnType<typeof vi.fn>
  discoverStatuses: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  setEnabled: ReturnType<typeof vi.fn>
  setDiscardStatus: ReturnType<typeof vi.fn>
  listStatusesForConnection: ReturnType<typeof vi.fn>
  discardSpec: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  resumeAfterReauth: ReturnType<typeof vi.fn>
  pollOnce: ReturnType<typeof vi.fn>
  listOutbox: ReturnType<typeof vi.fn>
  outboxCounts: ReturnType<typeof vi.fn>
  drainOnce: ReturnType<typeof vi.fn>
  createSpec: ReturnType<typeof vi.fn>
  listLinks: ReturnType<typeof vi.fn>
}

let db: DbInstance
let app: express.Express
let syncStub: JiraSyncManagerStub

function makeStub(): JiraSyncManagerStub {
  return {
    probeCredentials: vi.fn(),
    discoverProjects: vi.fn(),
    discoverStatuses: vi.fn(),
    connect: vi.fn(),
    setEnabled: vi.fn(),
    setDiscardStatus: vi.fn(),
    listStatusesForConnection: vi.fn(),
    discardSpec: vi.fn(),
    disconnect: vi.fn(),
    resumeAfterReauth: vi.fn(),
    pollOnce: vi.fn(),
    listOutbox: vi.fn(() => []),
    outboxCounts: vi.fn(() => ({ pending: 0, inflight: 0, done: 0, dead: 0 })),
    drainOnce: vi.fn(() => Promise.resolve()),
    createSpec: vi.fn(),
    listLinks: vi.fn(() => []),
  }
}

/** Insert a real connection row so getConnectionPublic returns a populated shape. */
function seedConnection(): void {
  upsertConnection(db, {
    projectId: PROJECT_ID,
    baseUrl: 'https://acme.atlassian.net',
    deployment: 'cloud',
    apiVersion: '3',
    authScheme: 'basic',
    accountEmail: 'pm@acme.com',
    jiraProjectKey: 'PROJ',
    jiraProjectId: '10001',
    token: 'secret-token',
    enabled: true,
    statusMap: null,
  })
}

function mountApp(): void {
  syncStub = makeStub()
  app = express()
  app.use(express.json())
  const ctx = {
    project: { id: PROJECT_ID },
    db,
    jiraSyncManager: syncStub,
  } as unknown as ProjectContext
  app.use(
    '/jira',
    (req, _res, next) => {
      ;(req as unknown as { projectCtx: ProjectContext }).projectCtx = ctx
      next()
    },
    createJiraRouter()
  )
}

beforeEach(() => {
  setSecretStore(fakeSecretStore)
  db = initDb(':memory:')
  mountApp()
})

afterEach(() => {
  setSecretStore(null)
  vi.clearAllMocks()
})

// ─── POST /connect forwards discardStatus ────────────────────────────────────────

describe('POST /connect — discardStatus forwarding', () => {
  it('forwards a trimmed discardStatus to connect', async () => {
    syncStub.connect.mockImplementation(async () => {
      seedConnection()
      return { ok: true, connection: {} }
    })
    const res = await request(app)
      .post('/jira/connect')
      .send({
        baseUrl: 'https://acme.atlassian.net',
        token: 'tok',
        jiraProjectKey: 'PROJ',
        discardStatus: '  Cancelled  ',
      })
    expect(res.status).toBe(201)
    expect(syncStub.connect).toHaveBeenCalledWith(
      expect.objectContaining({ discardStatus: 'Cancelled' })
    )
  })

  it('passes discardStatus null when omitted', async () => {
    syncStub.connect.mockImplementation(async () => {
      seedConnection()
      return { ok: true, connection: {} }
    })
    await request(app)
      .post('/jira/connect')
      .send({ baseUrl: 'https://acme.atlassian.net', token: 'tok', jiraProjectKey: 'PROJ' })
    expect(syncStub.connect).toHaveBeenCalledWith(
      expect.objectContaining({ discardStatus: null })
    )
  })

  it('passes discardStatus null when empty/whitespace', async () => {
    syncStub.connect.mockImplementation(async () => {
      seedConnection()
      return { ok: true, connection: {} }
    })
    await request(app)
      .post('/jira/connect')
      .send({
        baseUrl: 'https://acme.atlassian.net',
        token: 'tok',
        jiraProjectKey: 'PROJ',
        discardStatus: '   ',
      })
    expect(syncStub.connect).toHaveBeenCalledWith(
      expect.objectContaining({ discardStatus: null })
    )
  })
})

// ─── PATCH /connection — discardStatus ───────────────────────────────────────────

describe('PATCH /connection — discardStatus', () => {
  it('calls setDiscardStatus with the trimmed string and 200s', async () => {
    seedConnection()
    const res = await request(app)
      .patch('/jira/connection')
      .send({ discardStatus: '  Cancelled  ' })
    expect(res.status).toBe(200)
    expect(res.body.connection.jiraProjectKey).toBe('PROJ')
    expect(syncStub.setDiscardStatus).toHaveBeenCalledWith('Cancelled')
  })

  it('calls setDiscardStatus(null) when discardStatus is an empty string', async () => {
    seedConnection()
    const res = await request(app).patch('/jira/connection').send({ discardStatus: '' })
    expect(res.status).toBe(200)
    expect(syncStub.setDiscardStatus).toHaveBeenCalledWith(null)
  })

  it('calls setDiscardStatus(null) when discardStatus is null', async () => {
    seedConnection()
    const res = await request(app).patch('/jira/connection').send({ discardStatus: null })
    expect(res.status).toBe(200)
    expect(syncStub.setDiscardStatus).toHaveBeenCalledWith(null)
  })

  it('does NOT call setDiscardStatus when discardStatus is undefined (still 200)', async () => {
    seedConnection()
    const res = await request(app).patch('/jira/connection').send({ enabled: false })
    expect(res.status).toBe(200)
    expect(res.body.connection.jiraProjectKey).toBe('PROJ')
    expect(syncStub.setDiscardStatus).not.toHaveBeenCalled()
  })
})

// ─── GET /statuses ───────────────────────────────────────────────────────────────

describe('GET /statuses', () => {
  it('200s with statuses when the manager returns ok', async () => {
    syncStub.listStatusesForConnection.mockResolvedValue({
      ok: true,
      statuses: [
        { id: '1', name: 'To Do', category: 'new' },
        { id: '2', name: 'Cancelled', category: 'done' },
      ],
    })
    const res = await request(app).get('/jira/statuses')
    expect(res.status).toBe(200)
    expect(res.body.statuses).toHaveLength(2)
    expect(res.body.statuses[1]).toEqual({ id: '2', name: 'Cancelled', category: 'done' })
    expect(syncStub.listStatusesForConnection).toHaveBeenCalled()
  })

  it('400s when the manager returns not ok', async () => {
    syncStub.listStatusesForConnection.mockResolvedValue({ ok: false, error: 'no connection' })
    const res = await request(app).get('/jira/statuses')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('no connection')
  })
})

// ─── POST /specs/:localId/discard ────────────────────────────────────────────────

describe('POST /specs/:localId/discard', () => {
  it('400s on a non-numeric id', async () => {
    const res = await request(app).post('/jira/specs/abc/discard').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid spec id')
    expect(syncStub.discardSpec).not.toHaveBeenCalled()
  })

  it('202s with { ok: true } and forwards the comment from the body', async () => {
    syncStub.discardSpec.mockReturnValue({ ok: true })
    const res = await request(app)
      .post('/jira/specs/7/discard')
      .send({ comment: 'Superseded by PROJ-9' })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true })
    expect(syncStub.discardSpec).toHaveBeenCalledWith(7, 'Superseded by PROJ-9')
  })

  it('202s and forwards comment null when the body has no comment', async () => {
    syncStub.discardSpec.mockReturnValue({ ok: true })
    const res = await request(app).post('/jira/specs/7/discard').send({})
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true })
    expect(syncStub.discardSpec).toHaveBeenCalledWith(7, null)
  })

  it('404s when discardSpec fails with reason no-link', async () => {
    syncStub.discardSpec.mockReturnValue({ ok: false, reason: 'no-link' })
    const res = await request(app).post('/jira/specs/7/discard').send({})
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('no-link')
  })

  it('409s when discardSpec fails with reason not-configured', async () => {
    syncStub.discardSpec.mockReturnValue({ ok: false, reason: 'not-configured' })
    const res = await request(app).post('/jira/specs/7/discard').send({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('not-configured')
  })

  it('409s when discardSpec fails with reason not-active', async () => {
    syncStub.discardSpec.mockReturnValue({ ok: false, reason: 'not-active' })
    const res = await request(app).post('/jira/specs/7/discard').send({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('not-active')
  })
})
