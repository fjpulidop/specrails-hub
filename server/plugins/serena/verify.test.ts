import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { verifySerena } from './verify'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'child_process'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

let fakeChild: FakeChild

beforeEach(() => {
  fakeChild = new FakeChild()
  vi.mocked(spawn).mockReturnValue(fakeChild as never)
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('verifySerena', () => {
  it('reports ok when uv exits 0', async () => {
    const promise = verifySerena()
    fakeChild.stdout.emit('data', Buffer.from('uv 0.10.9\n'))
    fakeChild.emit('close', 0)
    const r = await promise
    expect(r.ok).toBe(true)
  })

  it('reports uv-non-zero-exit when exit code != 0', async () => {
    const promise = verifySerena()
    fakeChild.stderr.emit('data', Buffer.from('boom\n'))
    fakeChild.emit('close', 1)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/uv-non-zero-exit/)
  })

  it('reports uv-not-on-path when ENOENT fires', async () => {
    const promise = verifySerena()
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    fakeChild.emit('error', err)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('uv-not-on-path')
  })

  it('reports verify-timeout when child never emits close', async () => {
    vi.useFakeTimers()
    const promise = verifySerena()
    vi.advanceTimersByTime(2000)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('verify-timeout')
    vi.useRealTimers()
  })
})
