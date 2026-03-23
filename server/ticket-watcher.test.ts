import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { TicketWatcher } from './ticket-watcher'
import type { WsMessage, LocalTicket } from './types'

function makeTicketFile(dir: string, revision: number, tickets: Record<string, unknown> = {}): string {
  const claudeDir = path.join(dir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  const filePath = path.join(claudeDir, 'local-tickets.json')
  const data = {
    schema_version: '1.0',
    revision,
    last_updated: new Date().toISOString(),
    next_id: Object.keys(tickets).length + 1,
    tickets,
  }
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
  return filePath
}

describe('TicketWatcher', () => {
  let tmpDir: string
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-watcher-test-'))
    broadcast = vi.fn()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates without error', () => {
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    expect(watcher).toBeDefined()
  })

  it('start and close work without ticket file', async () => {
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()
    await watcher.close()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('start and close work with existing ticket file', async () => {
    makeTicketFile(tmpDir, 1)
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()
    await watcher.close()
    // No broadcasts for initial state
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('close is idempotent', async () => {
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()
    await watcher.close()
    await watcher.close() // second close should not throw
  })

  it('notifyHubWrite updates internal revision', async () => {
    makeTicketFile(tmpDir, 1)
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()
    watcher.notifyHubWrite(5)
    await watcher.close()
  })

  it('does not start if already closed', () => {
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    // Close before start
    watcher.close()
    watcher.start()
    // Should not have created a file watcher internally
  })

  it('detects file change and broadcasts ticket_updated', async () => {
    const filePath = makeTicketFile(tmpDir, 1)
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()

    // Wait for chokidar to be ready
    await new Promise((r) => setTimeout(r, 300))

    // Simulate external write with bumped revision
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    data.revision = 2
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')

    // Wait for debounce (400ms) + awaitWriteFinish (200ms) + buffer
    await new Promise((r) => setTimeout(r, 1200))

    await watcher.close()

    expect(broadcast).toHaveBeenCalled()
    const msg = broadcast.mock.calls[0][0] as WsMessage
    expect(msg.type).toBe('ticket_updated')
    expect((msg as any).projectId).toBe('proj-1')
  })

  it('suppresses echo when notifyHubWrite matches revision', async () => {
    const filePath = makeTicketFile(tmpDir, 1)
    const watcher = new TicketWatcher(tmpDir, 'proj-1', broadcast)
    watcher.start()

    await new Promise((r) => setTimeout(r, 300))

    // Hub writes and notifies the watcher
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    data.revision = 2
    watcher.notifyHubWrite(2)
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')

    await new Promise((r) => setTimeout(r, 1200))

    await watcher.close()

    // Should NOT have broadcast since revision was pre-notified
    expect(broadcast).not.toHaveBeenCalled()
  })
})

describe('ticket-broadcast helpers', () => {
  // These are pure functions that just call broadcast — test the message shape
  let broadcastFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    broadcastFn = vi.fn()
  })

  it('broadcastTicketCreated sends correct message shape', async () => {
    const { broadcastTicketCreated } = await import('./ticket-broadcast')
    const mockCtx = {
      project: { id: 'proj-1' },
      ticketWatcher: { notifyHubWrite: vi.fn() },
      broadcast: broadcastFn,
    } as any

    const ticket: LocalTicket = {
      id: 1,
      title: 'Test ticket',
      description: 'A test',
      status: 'todo',
      priority: 'medium',
      labels: [],
      assignee: null,
      prerequisites: [],
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'user',
      source: 'manual',
    }

    broadcastTicketCreated(mockCtx, ticket, 2)

    expect(mockCtx.ticketWatcher.notifyHubWrite).toHaveBeenCalledWith(2)
    expect(broadcastFn).toHaveBeenCalledOnce()
    const msg = broadcastFn.mock.calls[0][0]
    expect(msg.type).toBe('ticket_created')
    expect(msg.projectId).toBe('proj-1')
    expect(msg.ticket).toEqual(ticket)
    expect(msg.timestamp).toBeDefined()
  })

  it('broadcastTicketUpdated sends correct message shape', async () => {
    const { broadcastTicketUpdated } = await import('./ticket-broadcast')
    const mockCtx = {
      project: { id: 'proj-2' },
      ticketWatcher: { notifyHubWrite: vi.fn() },
      broadcast: broadcastFn,
    } as any

    const ticket: LocalTicket = {
      id: 3,
      title: 'Updated',
      description: '',
      status: 'in_progress',
      priority: 'high',
      labels: ['area:backend'],
      assignee: null,
      prerequisites: [],
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'agent',
      source: 'product-backlog',
    }

    broadcastTicketUpdated(mockCtx, ticket, 5)

    expect(broadcastFn).toHaveBeenCalledOnce()
    const msg = broadcastFn.mock.calls[0][0]
    expect(msg.type).toBe('ticket_updated')
    expect(msg.ticket.id).toBe(3)
  })

  it('broadcastTicketDeleted sends correct message shape', async () => {
    const { broadcastTicketDeleted } = await import('./ticket-broadcast')
    const mockCtx = {
      project: { id: 'proj-3' },
      ticketWatcher: { notifyHubWrite: vi.fn() },
      broadcast: broadcastFn,
    } as any

    broadcastTicketDeleted(mockCtx, 7, 10)

    expect(mockCtx.ticketWatcher.notifyHubWrite).toHaveBeenCalledWith(10)
    expect(broadcastFn).toHaveBeenCalledOnce()
    const msg = broadcastFn.mock.calls[0][0]
    expect(msg.type).toBe('ticket_deleted')
    expect(msg.projectId).toBe('proj-3')
    expect(msg.ticketId).toBe(7)
  })
})
