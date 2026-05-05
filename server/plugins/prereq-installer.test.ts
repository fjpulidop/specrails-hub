import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { installPrerequisite } from './prereq-installer'
import type { WsMessage } from '../types'

vi.mock('child_process', () => ({ spawn: vi.fn() }))
import { spawn } from 'child_process'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

let captured: WsMessage[]
let fakeChild: FakeChild

const broadcast = (m: WsMessage) => { captured.push(m) }

beforeEach(() => {
  captured = []
  fakeChild = new FakeChild()
  vi.mocked(spawn).mockReturnValue(fakeChild as never)
})
afterEach(() => { vi.clearAllMocks() })

describe('installPrerequisite', () => {
  it('rejects unsupported prerequisite name', async () => {
    const r = await installPrerequisite('not-a-thing', 'pid', broadcast)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no installer/)
  })

  it('streams stdout/stderr lines as progress events', async () => {
    const promise = installPrerequisite('uv', 'pid', broadcast)
    fakeChild.stdout.emit('data', Buffer.from('line1\nline2\n'))
    fakeChild.stderr.emit('data', Buffer.from('warn1\n'))
    fakeChild.emit('close', 0)
    const r = await promise
    expect(r.ok).toBe(true)
    expect(r.exitCode).toBe(0)
    const lines = captured
      .filter((m) => m.type === 'plugin.prereq_install_progress')
      .map((m) => (m as { line: string }).line)
    expect(lines).toEqual(expect.arrayContaining(['line1', 'line2', 'warn1']))
  })

  it('reports non-zero exit code as failure', async () => {
    const promise = installPrerequisite('uv', 'pid', broadcast)
    fakeChild.emit('close', 7)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(7)
    expect(r.reason).toBe('exit-code-7')
  })

  it('handles spawn error event', async () => {
    const promise = installPrerequisite('uv', 'pid', broadcast)
    fakeChild.emit('error', new Error('boom'))
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('boom')
  })
})
