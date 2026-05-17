import { describe, it, expect, beforeEach } from 'vitest'
import {
  applySpecSort,
  loadSpecSort,
  saveSpecSort,
  sortByPriority,
  sortByTicketId,
} from '../spec-sort'
import type { LocalTicket, TicketPriority } from '../../types'

function makeTicket(id: number, priority: TicketPriority | null = 'medium'): LocalTicket {
  return {
    id,
    title: `t-${id}`,
    description: '',
    status: 'todo',
    priority,
    labels: [],
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '',
    updated_at: '',
    created_by: 'test',
    source: 'manual',
  }
}

describe('sortByTicketId', () => {
  it('asc returns negative when a.id < b.id', () => {
    expect(sortByTicketId(makeTicket(1), makeTicket(2), 'asc')).toBeLessThan(0)
  })
  it('desc returns positive when a.id < b.id', () => {
    expect(sortByTicketId(makeTicket(1), makeTicket(2), 'desc')).toBeGreaterThan(0)
  })
  it('returns 0 for equal ids', () => {
    expect(sortByTicketId(makeTicket(5), makeTicket(5), 'asc')).toBe(0)
  })
})

describe('sortByPriority', () => {
  it('desc puts critical before high before medium before low before null', () => {
    const ts = [
      makeTicket(1, 'low'),
      makeTicket(2, 'critical'),
      makeTicket(3, null),
      makeTicket(4, 'high'),
      makeTicket(5, 'medium'),
    ]
    const sorted = [...ts].sort((a, b) => sortByPriority(a, b, 'desc'))
    expect(sorted.map((t) => t.priority)).toEqual(['critical', 'high', 'medium', 'low', null])
  })

  it('asc puts null first then low → critical last', () => {
    const ts = [
      makeTicket(1, 'low'),
      makeTicket(2, 'critical'),
      makeTicket(3, null),
      makeTicket(4, 'high'),
      makeTicket(5, 'medium'),
    ]
    const sorted = [...ts].sort((a, b) => sortByPriority(a, b, 'asc'))
    expect(sorted.map((t) => t.priority)).toEqual([null, 'low', 'medium', 'high', 'critical'])
  })

  it('tiebreaker by id ascending in desc direction', () => {
    const ts = [makeTicket(3, 'high'), makeTicket(1, 'high'), makeTicket(2, 'high')]
    const sorted = [...ts].sort((a, b) => sortByPriority(a, b, 'desc'))
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('tiebreaker by id ascending in asc direction (stable)', () => {
    const ts = [makeTicket(3, 'low'), makeTicket(1, 'low'), makeTicket(2, 'low')]
    const sorted = [...ts].sort((a, b) => sortByPriority(a, b, 'asc'))
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('null bucket placement: nulls last in desc, first in asc', () => {
    const ts = [makeTicket(1, null), makeTicket(2, 'medium'), makeTicket(3, null)]
    const desc = [...ts].sort((a, b) => sortByPriority(a, b, 'desc'))
    expect(desc.map((t) => t.priority)).toEqual(['medium', null, null])
    const asc = [...ts].sort((a, b) => sortByPriority(a, b, 'asc'))
    expect(asc.map((t) => t.priority)).toEqual([null, null, 'medium'])
  })
})

describe('applySpecSort', () => {
  const tickets = [
    makeTicket(3, 'low'),
    makeTicket(1, 'critical'),
    makeTicket(2, 'medium'),
  ]

  it('mode=default returns input unchanged (same reference)', () => {
    expect(applySpecSort(tickets, 'default', 'desc')).toBe(tickets)
  })

  it('mode=ticket-id sorts by id', () => {
    expect(applySpecSort(tickets, 'ticket-id', 'asc').map((t) => t.id)).toEqual([1, 2, 3])
    expect(applySpecSort(tickets, 'ticket-id', 'desc').map((t) => t.id)).toEqual([3, 2, 1])
  })

  it('mode=priority sorts by bucket', () => {
    expect(applySpecSort(tickets, 'priority', 'desc').map((t) => t.priority)).toEqual([
      'critical',
      'medium',
      'low',
    ])
  })

  it('does not mutate input', () => {
    const original = tickets.map((t) => t.id)
    applySpecSort(tickets, 'ticket-id', 'asc')
    expect(tickets.map((t) => t.id)).toEqual(original)
  })
})

describe('loadSpecSort / saveSpecSort', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when no value stored', () => {
    expect(loadSpecSort('p1')).toEqual({ mode: 'default', dir: 'desc' })
  })

  it('returns defaults when projectId is null', () => {
    expect(loadSpecSort(null)).toEqual({ mode: 'default', dir: 'desc' })
  })

  it('round-trips a sorted mode', () => {
    saveSpecSort('p1', 'priority', 'asc')
    expect(loadSpecSort('p1')).toEqual({ mode: 'priority', dir: 'asc' })
  })

  it('falls back to default mode on invalid stored value', () => {
    localStorage.setItem('specrails-hub:spec-sort-mode:p1', 'bogus')
    localStorage.setItem('specrails-hub:spec-sort-dir:p1', 'asc')
    expect(loadSpecSort('p1')).toEqual({ mode: 'default', dir: 'asc' })
  })

  it('saveSpecSort is a no-op when projectId is null', () => {
    saveSpecSort(null, 'priority', 'asc')
    expect(localStorage.length).toBe(0)
  })

  it('persists each project independently', () => {
    saveSpecSort('p1', 'ticket-id', 'desc')
    saveSpecSort('p2', 'priority', 'asc')
    expect(loadSpecSort('p1')).toEqual({ mode: 'ticket-id', dir: 'desc' })
    expect(loadSpecSort('p2')).toEqual({ mode: 'priority', dir: 'asc' })
  })
})

describe('SMASH children ordering', () => {
  // SMASH inserts children sorted by executionOrder, so their ids are
  // sequential. The default sort preserves insertion order; ticket-id sort
  // (asc) lines them up naturally; the modal's Hijos section handles the
  // canonical execution_order sort independently. These tests guard 9.6.
  function smashChildren(parentId: number, count: number): LocalTicket[] {
    return Array.from({ length: count }, (_, i) => {
      const t = makeTicket(parentId + 1 + i, 'medium')
      t.parent_epic_id = parentId
      t.execution_order = i + 1
      return t
    })
  }

  it('default mode preserves smash insertion order (execution_order alignment)', () => {
    const epic = makeTicket(10)
    epic.is_epic = true
    const tickets = [epic, ...smashChildren(10, 4)]
    const sorted = applySpecSort(tickets, 'default', 'asc')
    expect(sorted.map((t) => t.id)).toEqual([10, 11, 12, 13, 14])
    expect(sorted.slice(1).map((t) => t.execution_order)).toEqual([1, 2, 3, 4])
  })

  it('ticket-id asc keeps smash children contiguous after the épica', () => {
    const epic = makeTicket(10)
    epic.is_epic = true
    const tickets = [...smashChildren(10, 3), epic]
    const sorted = applySpecSort(tickets, 'ticket-id', 'asc')
    expect(sorted.map((t) => t.id)).toEqual([10, 11, 12, 13])
  })
})
