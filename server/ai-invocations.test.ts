import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, type DbInstance } from './db'
import {
  recordInvocation,
  updateTicketIdForConversation,
  listInvocationsForConversation,
  getTicketSpendingSummary,
  InvalidSurfaceError,
} from './ai-invocations'

function fixedInput(overrides: Partial<Parameters<typeof recordInvocation>[1]> = {}) {
  return {
    id: 'inv-1',
    project_id: 'p1',
    surface: 'job' as const,
    status: 'success' as const,
    started_at: '2026-05-06T10:00:00Z',
    finished_at: '2026-05-06T10:00:30Z',
    model: 'claude-sonnet-4-6',
    tokens_in: 100,
    tokens_out: 50,
    total_cost_usd: 0.1,
    num_turns: 1,
    duration_ms: 30000,
    ...overrides,
  }
}

describe('ai-invocations', () => {
  let db: DbInstance

  beforeEach(() => {
    db = initDb(':memory:')
  })

  it('round-trips an insert', () => {
    recordInvocation(db, fixedInput())
    const row = db.prepare('SELECT * FROM ai_invocations WHERE id = ?').get('inv-1') as Record<string, unknown>
    expect(row.surface).toBe('job')
    expect(row.total_cost_usd).toBe(0.1)
    expect(row.tokens_in).toBe(100)
    expect(row.status).toBe('success')
  })

  it('rejects invalid surface', () => {
    expect(() =>
      recordInvocation(db, fixedInput({ surface: 'chat' as unknown as 'job' }))
    ).toThrow(InvalidSurfaceError)
  })

  it('persists NULL metrics for failed status', () => {
    recordInvocation(db, {
      id: 'inv-2',
      project_id: 'p1',
      surface: 'job',
      status: 'failed',
      started_at: '2026-05-06T10:00:00Z',
    })
    const row = db.prepare('SELECT * FROM ai_invocations WHERE id = ?').get('inv-2') as Record<string, unknown>
    expect(row.status).toBe('failed')
    expect(row.total_cost_usd).toBeNull()
    expect(row.tokens_in).toBeNull()
    expect(row.num_turns).toBeNull()
  })

  it('back-fills ticket_id for a conversation', () => {
    recordInvocation(db, fixedInput({ id: 'a', surface: 'explore-spec', conversation_id: 'c1', ticket_id: null }))
    recordInvocation(db, fixedInput({ id: 'b', surface: 'explore-spec', conversation_id: 'c1', ticket_id: null }))
    recordInvocation(db, fixedInput({ id: 'c', surface: 'explore-spec', conversation_id: 'c2', ticket_id: null }))
    const changes = updateTicketIdForConversation(db, 'c1', 42)
    expect(changes).toBe(2)
    const c1Rows = listInvocationsForConversation(db, 'c1')
    expect(c1Rows.every((r) => r.ticket_id === 42)).toBe(true)
    const c2Rows = listInvocationsForConversation(db, 'c2')
    expect(c2Rows[0].ticket_id).toBeNull()
  })

  it('does not overwrite an already-set ticket_id', () => {
    recordInvocation(db, fixedInput({ id: 'a', surface: 'explore-spec', conversation_id: 'c1', ticket_id: 99 }))
    recordInvocation(db, fixedInput({ id: 'b', surface: 'explore-spec', conversation_id: 'c1', ticket_id: null }))
    updateTicketIdForConversation(db, 'c1', 42)
    const rows = listInvocationsForConversation(db, 'c1')
    const a = rows.find((r) => r.id === 'a')!
    const b = rows.find((r) => r.id === 'b')!
    expect(a.ticket_id).toBe(99)
    expect(b.ticket_id).toBe(42)
  })

  it('aggregates ticket spending across surfaces', () => {
    recordInvocation(db, fixedInput({ id: 'j1', surface: 'job', ticket_id: 7, total_cost_usd: 1.0, num_turns: 2, duration_ms: 1000 }))
    recordInvocation(db, fixedInput({ id: 'j2', surface: 'job', ticket_id: 7, total_cost_usd: 2.0, num_turns: 3, duration_ms: 2000 }))
    recordInvocation(db, fixedInput({ id: 'e1', surface: 'explore-spec', ticket_id: 7, total_cost_usd: 0.5, num_turns: 4, duration_ms: 500 }))
    const summary = getTicketSpendingSummary(db, 7)
    expect(summary.totalRuns).toBe(3)
    expect(summary.totalCostUsd).toBeCloseTo(3.5)
    expect(summary.totalTurns).toBe(9)
    expect(summary.activeDurationMs).toBe(3500)
    expect(summary.bySurface.job.count).toBe(2)
    expect(summary.bySurface.job.costUsd).toBeCloseTo(3.0)
    expect(summary.bySurface['explore-spec'].count).toBe(1)
    expect(summary.bySurface['quick-spec'].count).toBe(0)
  })
})
