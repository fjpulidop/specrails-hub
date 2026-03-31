import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

import {
  readStore,
  mutateStore,
  withLock,
  filterTickets,
  resolveTicketStoragePath,
  isValidStatus,
  isValidPriority,
  type Ticket,
  type TicketStore,
} from './ticket-store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 1,
    title: 'Test ticket',
    description: 'A description',
    status: 'todo',
    priority: 'medium',
    labels: [],
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user',
    source: 'manual',
    ...overrides,
  }
}

function writeStore(filePath: string, store: TicketStore): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

function makeStore(overrides: Partial<TicketStore> = {}): TicketStore {
  return {
    schema_version: '1.0',
    revision: 0,
    last_updated: '2026-01-01T00:00:00Z',
    next_id: 1,
    tickets: {},
    ...overrides,
  }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-store-unit-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── readStore ────────────────────────────────────────────────────────────────

describe('readStore', () => {
  it('returns empty store when file does not exist', () => {
    const result = readStore(path.join(tmpDir, 'nonexistent.json'))
    expect(result.revision).toBe(0)
    expect(result.tickets).toEqual({})
    expect(result.next_id).toBe(1)
  })

  it('returns parsed store from valid file', () => {
    const filePath = path.join(tmpDir, 'tickets.json')
    const store = makeStore({
      revision: 5,
      next_id: 3,
      tickets: { '1': makeTicket(), '2': makeTicket({ id: 2, title: 'Second' }) },
    })
    writeStore(filePath, store)

    const result = readStore(filePath)
    expect(result.revision).toBe(5)
    expect(result.next_id).toBe(3)
    expect(Object.keys(result.tickets)).toHaveLength(2)
  })

  it('returns empty store when file contains invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json')
    fs.writeFileSync(filePath, '{ not valid json }', 'utf-8')
    const result = readStore(filePath)
    expect(result.revision).toBe(0)
    expect(result.tickets).toEqual({})
  })

  it('returns empty store when file is missing tickets field', () => {
    const filePath = path.join(tmpDir, 'partial.json')
    fs.writeFileSync(filePath, JSON.stringify({ revision: 1 }), 'utf-8')
    const result = readStore(filePath)
    expect(result.revision).toBe(0)
  })

  it('returns empty store when revision is not a number', () => {
    const filePath = path.join(tmpDir, 'bad-rev.json')
    fs.writeFileSync(filePath, JSON.stringify({ tickets: {}, revision: 'bad' }), 'utf-8')
    const result = readStore(filePath)
    expect(result.revision).toBe(0)
  })

  it('preserves all ticket fields', () => {
    const filePath = path.join(tmpDir, 'tickets.json')
    const ticket = makeTicket({
      id: 7,
      title: 'Full ticket',
      description: 'desc',
      status: 'in_progress',
      priority: 'critical',
      labels: ['bug', 'area:frontend'],
      assignee: 'alice',
      prerequisites: [1, 2],
      metadata: { effort_level: 'Large' },
      source: 'hub',
    })
    writeStore(filePath, makeStore({ tickets: { '7': ticket } }))

    const result = readStore(filePath)
    const t = result.tickets['7']
    expect(t.id).toBe(7)
    expect(t.title).toBe('Full ticket')
    expect(t.status).toBe('in_progress')
    expect(t.priority).toBe('critical')
    expect(t.labels).toEqual(['bug', 'area:frontend'])
    expect(t.assignee).toBe('alice')
    expect(t.prerequisites).toEqual([1, 2])
    expect(t.metadata.effort_level).toBe('Large')
    expect(t.source).toBe('hub')
  })
})

// ─── mutateStore ──────────────────────────────────────────────────────────────

describe('mutateStore', () => {
  it('calls the mutator function with the current store', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    let seenRevision: number | undefined
    mutateStore(filePath, (store) => {
      seenRevision = store.revision
    })
    expect(seenRevision).toBe(0) // empty store starts at 0
  })

  it('persists the mutation to disk', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    mutateStore(filePath, (store) => {
      store.tickets['1'] = makeTicket()
    })
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(raw.tickets['1'].title).toBe('Test ticket')
  })

  it('increments revision on each call', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    mutateStore(filePath, () => {})
    mutateStore(filePath, () => {})
    mutateStore(filePath, () => {})
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(raw.revision).toBe(3)
  })

  it('returns the store after mutation', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const result = mutateStore(filePath, (store) => {
      store.tickets['1'] = makeTicket({ title: 'Returned' })
    })
    expect(result.tickets['1'].title).toBe('Returned')
  })

  it('reads from existing file before mutating', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    writeStore(filePath, makeStore({ revision: 3, next_id: 5, tickets: { '4': makeTicket({ id: 4 }) } }))

    let seenRevision: number | undefined
    let seenNextId: number | undefined
    mutateStore(filePath, (store) => {
      seenRevision = store.revision  // snapshot before writeStore increments
      seenNextId = store.next_id
    })
    expect(seenRevision).toBe(3)
    expect(seenNextId).toBe(5)
  })

  it('creates parent directories if they do not exist', () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'tickets.json')
    mutateStore(filePath, (store) => {
      store.tickets['1'] = makeTicket()
    })
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('cleans up lock file after mutator throws', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    expect(() =>
      mutateStore(filePath, () => {
        throw new Error('mutator error')
      })
    ).toThrow('mutator error')
    const lockPath = filePath + '.lock'
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('allows subsequent calls after a mutator throws', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    expect(() => mutateStore(filePath, () => { throw new Error('fail') })).toThrow()
    // Should not throw — lock was cleaned up
    expect(() => mutateStore(filePath, (store) => { store.next_id = 99 })).not.toThrow()
  })

  it('updates last_updated timestamp', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const before = new Date().toISOString()
    mutateStore(filePath, () => {})
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(raw.last_updated >= before).toBe(true)
  })
})

// ─── withLock ─────────────────────────────────────────────────────────────────

describe('withLock', () => {
  it('passes current store to the function', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    writeStore(filePath, makeStore({ revision: 7 }))

    const result = withLock(filePath, (store) => store.revision)
    expect(result).toBe(7)
  })

  it('returns the function result', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const result = withLock(filePath, () => 'hello')
    expect(result).toBe('hello')
  })

  it('does NOT persist mutations (read-only helper)', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    writeStore(filePath, makeStore({ revision: 2 }))

    withLock(filePath, (store) => {
      store.revision = 999 // mutate in-memory but not written
    })

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(raw.revision).toBe(2) // unchanged on disk
  })

  it('cleans up lock after fn throws', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    expect(() => withLock(filePath, () => { throw new Error('oops') })).toThrow('oops')
    expect(fs.existsSync(filePath + '.lock')).toBe(false)
  })
})

// ─── Advisory locking — stale lock detection ─────────────────────────────────

describe('advisory locking', () => {
  it('overrides stale lock (age > 10s) and proceeds', () => {
    const filePath = path.join(tmpDir, '.claude', 'tickets.json')
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })

    // Create a stale lock (mtime 11 seconds ago)
    const lockPath = filePath + '.lock'
    const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY)
    fs.writeSync(fd, '99999')
    fs.closeSync(fd)
    const staleTime = new Date(Date.now() - 11_000)
    fs.utimesSync(lockPath, staleTime, staleTime)

    // Should succeed, overriding the stale lock
    expect(() => mutateStore(filePath, () => {})).not.toThrow()
  })
})

// ─── filterTickets ────────────────────────────────────────────────────────────

describe('filterTickets', () => {
  const tickets: Ticket[] = [
    makeTicket({ id: 1, title: 'Fix login bug', status: 'todo', labels: ['bug', 'area:frontend'] }),
    makeTicket({ id: 2, title: 'Add dashboard', status: 'in_progress', labels: ['area:frontend'] }),
    makeTicket({ id: 3, title: 'DB migration', status: 'done', labels: ['area:backend'] }),
    makeTicket({ id: 4, title: 'Auth refactor', status: 'todo', labels: ['area:backend', 'bug'], description: 'login related' }),
  ]

  it('returns all tickets with no filters', () => {
    expect(filterTickets(tickets, {})).toHaveLength(4)
  })

  it('filters by single status', () => {
    const result = filterTickets(tickets, { status: 'todo' })
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === 'todo')).toBe(true)
  })

  it('filters by multiple statuses (comma-separated)', () => {
    const result = filterTickets(tickets, { status: 'todo,in_progress' })
    expect(result).toHaveLength(3)
  })

  it('filters by label', () => {
    const result = filterTickets(tickets, { label: 'bug' })
    expect(result).toHaveLength(2)
    expect(result.map(t => t.id).sort()).toEqual([1, 4])
  })

  it('filters by multiple labels (comma-separated, OR logic)', () => {
    const result = filterTickets(tickets, { label: 'bug,area:backend' })
    // Tickets with 'bug' OR 'area:backend': ids 1, 3, 4
    expect(result).toHaveLength(3)
  })

  it('label filter is case-insensitive', () => {
    const result = filterTickets(tickets, { label: 'AREA:FRONTEND' })
    expect(result).toHaveLength(2)
  })

  it('filters by search query on title', () => {
    const result = filterTickets(tickets, { q: 'login' })
    expect(result.map(t => t.id).sort()).toEqual([1, 4]) // title + description match
  })

  it('filters by search query on description', () => {
    const result = filterTickets(tickets, { q: 'related' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(4)
  })

  it('search query is case-insensitive', () => {
    const result = filterTickets(tickets, { q: 'DASHBOARD' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('combines status and label filters', () => {
    const result = filterTickets(tickets, { status: 'todo', label: 'bug' })
    expect(result.map(t => t.id).sort()).toEqual([1, 4])
  })

  it('returns empty array when no tickets match', () => {
    expect(filterTickets(tickets, { status: 'cancelled' })).toEqual([])
  })

  it('handles empty input array', () => {
    expect(filterTickets([], { status: 'todo' })).toEqual([])
  })
})

// ─── resolveTicketStoragePath ─────────────────────────────────────────────────

describe('resolveTicketStoragePath', () => {
  it('returns default path when no integration-contract.json exists', () => {
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(path.resolve(tmpDir, '.claude/local-tickets.json'))
  })

  it('returns default path when contract has no ticketProvider', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), JSON.stringify({
      schemaVersion: '1.0',
    }))
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(path.resolve(tmpDir, '.claude/local-tickets.json'))
  })

  it('returns default path when contract has no storagePath', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), JSON.stringify({
      ticketProvider: { type: 'local' },
    }))
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(path.resolve(tmpDir, '.claude/local-tickets.json'))
  })

  it('returns custom path from integration-contract.json', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), JSON.stringify({
      ticketProvider: {
        type: 'local',
        storagePath: '.claude/local-tickets.json',
      },
    }))
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(path.resolve(tmpDir, '.claude/local-tickets.json'))
  })

  it('returns custom absolute storagePath unchanged', () => {
    const customPath = path.join(tmpDir, 'custom', 'tickets.json')
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), JSON.stringify({
      ticketProvider: { storagePath: customPath },
    }))
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(customPath)
  })

  it('returns default path when contract JSON is invalid', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'integration-contract.json'), 'not json')
    const result = resolveTicketStoragePath(tmpDir)
    expect(result).toBe(path.resolve(tmpDir, '.claude/local-tickets.json'))
  })
})

// ─── isValidStatus / isValidPriority ─────────────────────────────────────────

describe('isValidStatus', () => {
  it('accepts todo', () => expect(isValidStatus('todo')).toBe(true))
  it('accepts in_progress', () => expect(isValidStatus('in_progress')).toBe(true))
  it('accepts done', () => expect(isValidStatus('done')).toBe(true))
  it('accepts cancelled', () => expect(isValidStatus('cancelled')).toBe(true))
  it('rejects invalid string', () => expect(isValidStatus('invalid')).toBe(false))
  it('rejects number', () => expect(isValidStatus(1)).toBe(false))
  it('rejects null', () => expect(isValidStatus(null)).toBe(false))
  it('rejects undefined', () => expect(isValidStatus(undefined)).toBe(false))
})

describe('isValidPriority', () => {
  it('accepts critical', () => expect(isValidPriority('critical')).toBe(true))
  it('accepts high', () => expect(isValidPriority('high')).toBe(true))
  it('accepts medium', () => expect(isValidPriority('medium')).toBe(true))
  it('accepts low', () => expect(isValidPriority('low')).toBe(true))
  it('rejects invalid string', () => expect(isValidPriority('extreme')).toBe(false))
  it('rejects number', () => expect(isValidPriority(0)).toBe(false))
  it('rejects null', () => expect(isValidPriority(null)).toBe(false))
})
