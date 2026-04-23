import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, type DbInstance } from './db'
import {
  getRails,
  getRail,
  setRailTickets,
  setRailProfile,
} from './rails-store'

let db: DbInstance

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('getRails', () => {
  it('returns three empty rails by default', () => {
    const rails = getRails(db)
    expect(rails).toHaveLength(3)
    expect(rails.map((r) => r.railIndex)).toEqual([0, 1, 2])
    for (const r of rails) {
      expect(r.ticketIds).toEqual([])
      expect(r.mode).toBe('implement')
      expect(r.profileName).toBeNull()
    }
  })

  it('returns ticket ids in assigned order', () => {
    setRailTickets(db, 0, [10, 20, 30])
    const rails = getRails(db)
    expect(rails[0].ticketIds).toEqual([10, 20, 30])
    expect(rails[1].ticketIds).toEqual([])
  })
})

describe('getRail', () => {
  it('returns empty state for an unassigned rail', () => {
    const rail = getRail(db, 1)
    expect(rail.railIndex).toBe(1)
    expect(rail.ticketIds).toEqual([])
    expect(rail.mode).toBe('implement')
    expect(rail.profileName).toBeNull()
  })

  it('returns assigned tickets in position order', () => {
    setRailTickets(db, 2, [5, 15, 25], 'batch-implement')
    const rail = getRail(db, 2)
    expect(rail.ticketIds).toEqual([5, 15, 25])
    expect(rail.mode).toBe('batch-implement')
  })
})

describe('setRailTickets', () => {
  it('persists mode', () => {
    setRailTickets(db, 0, [1], 'batch-implement')
    expect(getRail(db, 0).mode).toBe('batch-implement')
  })

  it('defaults mode to implement when omitted', () => {
    setRailTickets(db, 0, [1])
    expect(getRail(db, 0).mode).toBe('implement')
  })

  it('replaces tickets entirely (not additive)', () => {
    setRailTickets(db, 0, [1, 2, 3])
    setRailTickets(db, 0, [4, 5])
    expect(getRail(db, 0).ticketIds).toEqual([4, 5])
  })

  it('clears tickets when called with empty array', () => {
    setRailTickets(db, 0, [1, 2, 3])
    setRailTickets(db, 0, [])
    expect(getRail(db, 0).ticketIds).toEqual([])
  })

  it('persists profileName when provided', () => {
    setRailTickets(db, 0, [1, 2], 'implement', 'data-heavy')
    expect(getRail(db, 0).profileName).toBe('data-heavy')
  })

  it('treats undefined profileName as null (legacy)', () => {
    setRailTickets(db, 0, [1, 2])
    expect(getRail(db, 0).profileName).toBeNull()
  })

  it('persists null profileName explicitly', () => {
    setRailTickets(db, 0, [1, 2], 'implement', null)
    expect(getRail(db, 0).profileName).toBeNull()
  })

  it('isolates rails from each other', () => {
    setRailTickets(db, 0, [1, 2])
    setRailTickets(db, 1, [3, 4])
    setRailTickets(db, 2, [5])
    expect(getRail(db, 0).ticketIds).toEqual([1, 2])
    expect(getRail(db, 1).ticketIds).toEqual([3, 4])
    expect(getRail(db, 2).ticketIds).toEqual([5])
  })

  it('returns the new state', () => {
    const out = setRailTickets(db, 1, [7, 8], 'batch-implement', 'security')
    expect(out.railIndex).toBe(1)
    expect(out.ticketIds).toEqual([7, 8])
    expect(out.mode).toBe('batch-implement')
    expect(out.profileName).toBe('security')
  })
})

describe('setRailProfile', () => {
  it('updates profile when rail has tickets', () => {
    setRailTickets(db, 0, [1, 2], 'implement', null)
    setRailProfile(db, 0, 'data-heavy')
    expect(getRail(db, 0).profileName).toBe('data-heavy')
    // Mode + tickets untouched
    expect(getRail(db, 0).mode).toBe('implement')
    expect(getRail(db, 0).ticketIds).toEqual([1, 2])
  })

  it('resets profile to null', () => {
    setRailTickets(db, 0, [1], 'implement', 'data-heavy')
    setRailProfile(db, 0, null)
    expect(getRail(db, 0).profileName).toBeNull()
  })

  it('returns {ticketIds: [], ...} without persisting when the rail is empty', () => {
    const result = setRailProfile(db, 0, 'data-heavy')
    expect(result.ticketIds).toEqual([])
    // Not persisted (no rows to update)
    expect(getRail(db, 0).profileName).toBeNull()
  })

  it('does not affect other rails', () => {
    setRailTickets(db, 0, [1], 'implement', 'default')
    setRailTickets(db, 1, [2], 'implement', 'default')
    setRailProfile(db, 0, 'data-heavy')
    expect(getRail(db, 0).profileName).toBe('data-heavy')
    expect(getRail(db, 1).profileName).toBe('default')
  })
})
