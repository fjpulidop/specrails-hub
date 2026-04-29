import { describe, it, expect, beforeEach } from 'vitest'
import {
  ingestMark,
  subscribe,
  getMarks,
  disposeSession,
} from '../command-mark-store'

const SID = 'test-session'

describe('command-mark-store', () => {
  beforeEach(() => {
    disposeSession(SID)
    disposeSession('other')
  })

  it('returns empty SessionMarks for unknown session', () => {
    const m = getMarks(SID)
    expect(m).toEqual({ openPreExec: null, completed: [], cwd: null, promptRows: [] })
  })

  it('ingests prompt-start with buffer row', () => {
    ingestMark(SID, { kind: 'prompt-start', ts: 1 }, { row: 42 })
    expect(getMarks(SID).promptRows).toEqual([{ ts: 1, row: 42, exitCode: null }])
  })

  it('ingests prompt-start without buffer (row=null)', () => {
    ingestMark(SID, { kind: 'prompt-start', ts: 2 })
    expect(getMarks(SID).promptRows).toEqual([{ ts: 2, row: null, exitCode: null }])
  })

  it('caps promptRows at 1000', () => {
    for (let i = 0; i < 1005; i++) ingestMark(SID, { kind: 'prompt-start', ts: i })
    const rows = getMarks(SID).promptRows
    expect(rows).toHaveLength(1000)
    expect(rows[0].ts).toBe(5)
    expect(rows[999].ts).toBe(1004)
  })

  it('sets openPreExec on pre-exec and clears on post-exec', () => {
    ingestMark(SID, { kind: 'prompt-start', ts: 10 })
    ingestMark(SID, { kind: 'pre-exec', ts: 11 })
    expect(getMarks(SID).openPreExec).toEqual({ startedAt: 11 })
    ingestMark(SID, { kind: 'post-exec', ts: 12, payload: { exitCode: 0 } })
    const m = getMarks(SID)
    expect(m.openPreExec).toBeNull()
    expect(m.completed).toEqual([{ startedAt: 11, finishedAt: 12, exitCode: 0 }])
    expect(m.promptRows[0].exitCode).toBe(0)
  })

  it('post-exec without prior pre-exec uses event ts as startedAt', () => {
    ingestMark(SID, { kind: 'post-exec', ts: 20, payload: { exitCode: 1 } })
    expect(getMarks(SID).completed).toEqual([{ startedAt: 20, finishedAt: 20, exitCode: 1 }])
  })

  it('post-exec without exitCode payload defaults to null', () => {
    ingestMark(SID, { kind: 'post-exec', ts: 30 })
    expect(getMarks(SID).completed[0].exitCode).toBeNull()
  })

  it('caps completed at 1000', () => {
    for (let i = 0; i < 1005; i++) {
      ingestMark(SID, { kind: 'post-exec', ts: i, payload: { exitCode: 0 } })
    }
    expect(getMarks(SID).completed).toHaveLength(1000)
  })

  it('updates cwd on cwd events (with and without payload path)', () => {
    ingestMark(SID, { kind: 'cwd', ts: 1, payload: { path: '/tmp' } })
    expect(getMarks(SID).cwd).toBe('/tmp')
    ingestMark(SID, { kind: 'cwd', ts: 2 })
    expect(getMarks(SID).cwd).toBeNull()
  })

  it('ignores unknown kinds', () => {
    ingestMark(SID, { kind: 'unknown-kind' as 'cwd', ts: 1 })
    expect(getMarks(SID)).toEqual({ openPreExec: null, completed: [], cwd: null, promptRows: [] })
  })

  it('subscribe receives notifications and unsubscribe stops them', () => {
    const calls: number[] = []
    const off = subscribe(SID, () => calls.push(Date.now()))
    ingestMark(SID, { kind: 'prompt-start', ts: 1 })
    ingestMark(SID, { kind: 'pre-exec', ts: 2 })
    expect(calls).toHaveLength(2)
    off()
    ingestMark(SID, { kind: 'cwd', ts: 3, payload: { path: '/x' } })
    expect(calls).toHaveLength(2)
  })

  it('listener errors do not break the stream', () => {
    let secondCalled = false
    subscribe(SID, () => { throw new Error('boom') })
    subscribe(SID, () => { secondCalled = true })
    ingestMark(SID, { kind: 'prompt-start', ts: 1 })
    expect(secondCalled).toBe(true)
  })

  it('disposeSession removes data and listeners', () => {
    const calls: number[] = []
    subscribe(SID, () => calls.push(1))
    ingestMark(SID, { kind: 'prompt-start', ts: 1 })
    expect(calls).toHaveLength(1)
    disposeSession(SID)
    expect(getMarks(SID)).toEqual({ openPreExec: null, completed: [], cwd: null, promptRows: [] })
    ingestMark(SID, { kind: 'prompt-start', ts: 2 })
    expect(calls).toHaveLength(1)
  })

  it('isolates state between sessions', () => {
    ingestMark(SID, { kind: 'cwd', ts: 1, payload: { path: '/a' } })
    ingestMark('other', { kind: 'cwd', ts: 1, payload: { path: '/b' } })
    expect(getMarks(SID).cwd).toBe('/a')
    expect(getMarks('other').cwd).toBe('/b')
  })

  it('notify with no listener set is a no-op', () => {
    expect(() => ingestMark('no-listeners', { kind: 'prompt-start', ts: 1 })).not.toThrow()
  })
})
