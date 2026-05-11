import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import request from 'supertest'

import { createProjectRouter } from './project-router'
import { initDb } from './db'
import { initHubDb } from './hub-db'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import type { DbInstance } from './db'

function makeContext(db: DbInstance, projectPath: string): ProjectContext {
  return {
    project: { id: 'proj-1', slug: 'proj', name: 'Test', path: projectPath, db_path: ':memory:', added_at: '', last_seen_at: '' },
    db,
    queueManager: { enqueue: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), reorder: vi.fn(), getJobs: vi.fn(() => []), isPaused: vi.fn(() => false), getActiveJobId: vi.fn(() => null), phasesForCommand: vi.fn(() => []) } as any,
    chatManager: { isActive: vi.fn(() => false), sendMessage: vi.fn(), abort: vi.fn(), forgetSpecDraft: vi.fn() } as any,
    setupManager: {} as any,
    proposalManager: {} as any,
    specLauncherManager: {} as any,
    ticketWatcher: { notifyHubWrite: vi.fn(), start: vi.fn(), close: vi.fn() } as any,
    broadcast: vi.fn(),
  }
}

function makeRegistry(ctx: ProjectContext): ProjectRegistry {
  const hubDb = initHubDb(':memory:')
  const map = new Map([[ctx.project.id, ctx]])
  return {
    hubDb,
    getContext: vi.fn((id: string) => map.get(id)),
    getContextByPath: vi.fn(() => undefined),
    addProject: vi.fn() as any,
    removeProject: vi.fn(),
    touchProject: vi.fn(),
    listContexts: vi.fn(() => Array.from(map.values())),
  } as unknown as ProjectRegistry
}

function createApp(ctx: ProjectContext) {
  const registry = makeRegistry(ctx)
  const router = createProjectRouter(registry)
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return app
}

describe('POST /tickets/from-draft', () => {
  let tmpDir: string
  let db: DbInstance
  let ctx: ProjectContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fromdraft-'))
    db = initDb(':memory:')
    ctx = makeContext(db, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a ticket with the supplied fields and returns 201', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({
        title: 'Add dark mode',
        description: '## Problem Statement\nUsers cannot override OS theme.\n\n## Proposed Solution\nA toggle in settings.',
        labels: ['ui', 'theme'],
        priority: 'high',
        acceptanceCriteria: ['Toggle visible', 'Persists across reload'],
      })
    expect(res.status).toBe(201)
    expect(res.body.ticket.title).toBe('Add dark mode')
    expect(res.body.ticket.priority).toBe('high')
    expect(res.body.ticket.labels).toEqual(['ui', 'theme'])
    expect(res.body.ticket.source).toBe('propose-spec')
    expect(res.body.ticket.created_by).toBe('sr-explore-spec')
    // Title is its own field — must NOT be echoed as `## Spec Title` heading.
    expect(res.body.ticket.description).not.toContain('## Spec Title')
    expect(res.body.ticket.description).toContain('## Problem Statement')
    expect(res.body.ticket.description).toContain('## Proposed Solution')
    expect(res.body.ticket.description).toContain('## Acceptance Criteria')
    expect(res.body.ticket.description).toContain('- Toggle visible')
  })

  it('rejects empty title with 400', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('title')
  })

  it('rejects whitespace-only title with 400', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('normalises invalid priority to medium', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'X', priority: 'urgent' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.priority).toBe('medium')
  })

  it('defaults missing labels and acceptanceCriteria', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Y' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.labels).toEqual([])
    // No body / AC supplied → description is empty (title lives in its own field).
    expect(res.body.ticket.description).toBe('')
  })

  it('assigns monotonic ids when called twice', async () => {
    const app = createApp(ctx)
    const r1 = await request(app).post('/api/projects/proj-1/tickets/from-draft').send({ title: 'A' })
    const r2 = await request(app).post('/api/projects/proj-1/tickets/from-draft').send({ title: 'B' })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.ticket.id).toBe(r1.body.ticket.id + 1)
  })

  it('broadcasts a ticket_created WS message', async () => {
    const app = createApp(ctx)
    await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Z' })
    expect(ctx.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket_created', projectId: 'proj-1' }),
    )
  })

  it('drops non-string labels', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'X', labels: ['ui', 42, null, 'theme'] })
    expect(res.status).toBe(201)
    expect(res.body.ticket.labels).toEqual(['ui', 'theme'])
  })

  it('accepts pendingSpecId without crashing when no attachments exist', async () => {
    // Migration is a no-op when the pending dir is empty (renameTicketDir
    // returns []). The endpoint must still succeed and produce a ticket.
    // Full attachment-migration coverage lives in attachment-manager tests
    // because the path resolves under the user's home dir, which we don't
    // override here.
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Pending OK', pendingSpecId: 'pending-zzz' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.title).toBe('Pending OK')
  })
})

// ─── Flip-in-place path (save-as-draft → from-draft) ─────────────────────────

import { mutateStore, resolveTicketStoragePath } from './ticket-store'
import { addMessage, createConversation } from './db'

describe('POST /tickets/from-draft — flip-in-place', () => {
  let tmpDir: string
  let db: DbInstance
  let ctx: ProjectContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fromdraft-flip-'))
    db = initDb(':memory:')
    ctx = makeContext(db, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function seedDraft(opts: { conversationId: string; title?: string }): number {
    const filePath = resolveTicketStoragePath(tmpDir)
    let id = 0
    mutateStore(filePath, (s) => {
      id = s.next_id++
      s.tickets[String(id)] = {
        id,
        title: opts.title ?? 'Draft seed',
        description: '',
        status: 'draft',
        priority: null,
        labels: [],
        assignee: null,
        prerequisites: [],
        metadata: {},
        comments: [],
        origin_conversation_id: opts.conversationId,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: 'sr-explore-spec',
        source: 'explore-draft',
      }
    })
    return id
  }

  it('flips an existing draft ticket to todo in place', async () => {
    const draftId = seedDraft({ conversationId: 'conv-A' })
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Final', description: 'Body', priority: 'high', draftTicketId: draftId })
    expect(res.status).toBe(201)
    expect(res.body.ticket.id).toBe(draftId)
    expect(res.body.ticket.status).toBe('todo')
    expect(res.body.ticket.priority).toBe('high')
    expect(res.body.ticket.title).toBe('Final')
  })

  it('preserves origin_conversation_id across the flip', async () => {
    const draftId = seedDraft({ conversationId: 'conv-keep' })
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Final', priority: 'medium', draftTicketId: draftId })
    expect(res.status).toBe(201)
    expect(res.body.ticket.origin_conversation_id).toBe('conv-keep')
  })

  it('falls back to looking up the draft by conversationId', async () => {
    const draftId = seedDraft({ conversationId: 'conv-fallback' })
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Final', priority: 'low', conversationId: 'conv-fallback' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.id).toBe(draftId)
    expect(res.body.ticket.status).toBe('todo')
  })

  it('legacy path (no draftTicketId, no matching draft) still inserts a new ticket', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Legacy' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('todo')
    expect(res.body.ticket.priority).toBe('medium')
  })

  it('returns 404 when explicit draftTicketId points at a non-existent ticket', async () => {
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'X', draftTicketId: 9999 })
    expect(res.status).toBe(404)
  })

  it('broadcasts a ticket_updated message on flip (not ticket_created)', async () => {
    const draftId = seedDraft({ conversationId: 'conv-bc' })
    const app = createApp(ctx)
    await request(app)
      .post('/api/projects/proj-1/tickets/from-draft')
      .send({ title: 'Bc', draftTicketId: draftId, priority: 'medium' })
    expect(ctx.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket_updated', projectId: 'proj-1' }),
    )
  })
})

// ─── POST /tickets/save-as-draft ─────────────────────────────────────────────

describe('POST /tickets/save-as-draft', () => {
  let tmpDir: string
  let db: DbInstance
  let ctx: ProjectContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'savedraft-'))
    db = initDb(':memory:')
    ctx = makeContext(db, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function seedConv(id: string, userText: string) {
    createConversation(db, { id, model: 'sonnet', kind: 'explore' })
    addMessage(db, { conversation_id: id, role: 'user', content: userText })
  }

  it('400 when conversationId is missing', async () => {
    const app = createApp(ctx)
    const res = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({})
    expect(res.status).toBe(400)
  })

  it('400 when the conversation has no user-submitted turn', async () => {
    createConversation(db, { id: 'empty-c', model: 'sonnet', kind: 'explore' })
    const app = createApp(ctx)
    const res = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'empty-c' })
    expect(res.status).toBe(400)
  })

  it('happy path persists a draft ticket with auto-title', async () => {
    seedConv('c1', 'Build a settings page with persistence')
    const app = createApp(ctx)
    const res = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c1' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('draft')
    expect(res.body.ticket.priority).toBeNull()
    expect(res.body.ticket.origin_conversation_id).toBe('c1')
    expect(typeof res.body.ticket.title).toBe('string')
    expect(res.body.ticket.title.length).toBeGreaterThan(0)
  })

  it('user-supplied title is honoured verbatim', async () => {
    seedConv('c2', 'something')
    const app = createApp(ctx)
    const res = await request(app)
      .post('/api/projects/proj-1/tickets/save-as-draft')
      .send({ conversationId: 'c2', title: 'My exact title' })
    expect(res.status).toBe(201)
    expect(res.body.ticket.title).toBe('My exact title')
  })

  it('idempotent on conversationId — second save updates existing draft', async () => {
    seedConv('c3', 'first')
    const app = createApp(ctx)
    const r1 = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c3' })
    const r2 = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c3', title: 'Renamed' })
    expect(r1.body.ticket.id).toBe(r2.body.ticket.id)
    expect(r2.body.ticket.title).toBe('Renamed')
  })

  it('broadcasts a ticket_created the first time', async () => {
    seedConv('c4', 'x')
    const app = createApp(ctx)
    await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c4' })
    expect(ctx.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket_created', projectId: 'proj-1' }),
    )
  })
})

// ─── Cascade behaviour ───────────────────────────────────────────────────────

describe('cascade: conversation delete clears origin_conversation_id', () => {
  let tmpDir: string
  let db: DbInstance
  let ctx: ProjectContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cascade-'))
    db = initDb(':memory:')
    ctx = makeContext(db, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('clears origin_conversation_id on referencing tickets when the conversation is deleted', async () => {
    createConversation(db, { id: 'c-X', model: 'sonnet', kind: 'explore' })
    addMessage(db, { conversation_id: 'c-X', role: 'user', content: 'hi' })
    const app = createApp(ctx)
    const save = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c-X' })
    expect(save.status).toBe(201)
    const ticketId = save.body.ticket.id
    const del = await request(app).delete('/api/projects/proj-1/chat/conversations/c-X')
    expect(del.status).toBe(200)
    const get = await request(app).get(`/api/projects/proj-1/tickets/${ticketId}`)
    expect(get.status).toBe(200)
    expect(get.body.ticket.origin_conversation_id).toBeNull()
  })

  it('deleting a draft ticket cascades to its orphan Explore conversation', async () => {
    createConversation(db, { id: 'c-orphan', model: 'sonnet', kind: 'explore' })
    addMessage(db, { conversation_id: 'c-orphan', role: 'user', content: 'idea' })
    const app = createApp(ctx)
    const save = await request(app).post('/api/projects/proj-1/tickets/save-as-draft').send({ conversationId: 'c-orphan' })
    const ticketId = save.body.ticket.id
    await request(app).delete(`/api/projects/proj-1/tickets/${ticketId}`)
    // Conversation should be gone — re-fetching returns 404
    const conv = await request(app).get('/api/projects/proj-1/chat/conversations/c-orphan')
    expect(conv.status).toBe(404)
  })
})
