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
  setStatusMap: ReturnType<typeof vi.fn>
  listStatusesForConnection: ReturnType<typeof vi.fn>
  discardSpec: ReturnType<typeof vi.fn>
  getSpecDetails: ReturnType<typeof vi.fn>
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
    setStatusMap: vi.fn(),
    listStatusesForConnection: vi.fn(),
    discardSpec: vi.fn(),
    getSpecDetails: vi.fn(),
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

// ─── GET /specs/:localId/details ─────────────────────────────────────────────────

describe('GET /specs/:localId/details', () => {
  const DETAILS = {
    fields: [
      { label: 'Status', value: 'In Progress' },
      { label: 'Assignee', value: 'Ada Lovelace' },
      { label: 'Reporter', value: 'Grace Hopper' },
      { label: 'Epic Link', value: 'PROJ-1', href: 'https://acme.atlassian.net/browse/PROJ-1' },
    ],
    development: {
      pullRequests: [
        {
          id: '1',
          title: 'Add feature',
          url: 'https://github.com/acme/repo/pull/1',
          status: 'OPEN',
          sourceBranch: 'feature/x',
          destBranch: 'main',
          author: 'Ada',
          lastUpdate: '2026-06-01T12:00:00Z',
        },
      ],
      branches: [
        {
          name: 'feature/x',
          url: 'https://github.com/acme/repo/tree/feature/x',
          createPullRequestUrl: null,
          repo: 'acme/repo',
          repoUrl: 'https://github.com/acme/repo',
          lastCommit: null,
        },
      ],
      commits: [
        {
          id: 'abc123',
          displayId: 'abc123',
          message: 'Initial commit',
          url: 'https://github.com/acme/repo/commit/abc123',
          author: 'Ada',
          timestamp: '2026-06-01T11:00:00Z',
        },
      ],
    },
  }

  it('200s and returns the stub details body', async () => {
    seedConnection()
    syncStub.getSpecDetails.mockResolvedValue({ ok: true, details: DETAILS })
    const res = await request(app).get('/jira/specs/7/details')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(DETAILS)
    expect(syncStub.getSpecDetails).toHaveBeenCalledWith(7)
  })

  it('400s on a non-numeric id without calling the manager', async () => {
    seedConnection()
    const res = await request(app).get('/jira/specs/abc/details')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid spec id')
    expect(syncStub.getSpecDetails).not.toHaveBeenCalled()
  })

  it('404s when getSpecDetails fails with reason no-link', async () => {
    seedConnection()
    syncStub.getSpecDetails.mockResolvedValue({ ok: false, reason: 'no-link' })
    const res = await request(app).get('/jira/specs/7/details')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('no-link')
  })

  it('409s when getSpecDetails fails with reason not-active', async () => {
    seedConnection()
    syncStub.getSpecDetails.mockResolvedValue({ ok: false, reason: 'not-active' })
    const res = await request(app).get('/jira/specs/7/details')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('not-active')
  })

  it('502s when getSpecDetails fails with reason issue-error', async () => {
    seedConnection()
    syncStub.getSpecDetails.mockResolvedValue({ ok: false, reason: 'issue-error' })
    const res = await request(app).get('/jira/specs/7/details')
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('issue-error')
  })

  it('uses the explicit status when issue-error carries one', async () => {
    seedConnection()
    syncStub.getSpecDetails.mockResolvedValue({ ok: false, reason: 'issue-error', status: 401 })
    const res = await request(app).get('/jira/specs/7/details')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('issue-error')
  })
})
