import { describe, it, expect } from 'vitest'
import os from 'os'
import { redact, stripHome } from './mobile-redact'

describe('mobile-redact', () => {
  it('strips the home dir from strings', () => {
    const home = os.homedir()
    expect(stripHome(`${home}/repos/x`)).toBe('~/repos/x')
    expect(stripHome('no home here')).toBe('no home here')
  })

  it('drops sensitive keys at any depth', () => {
    const input = {
      id: 'p1',
      path: '/Users/x/secret',
      db_path: '/Users/x/db.sqlite',
      nested: { absolutePath: '/a/b', keep: 'yes', cwd: '/c' },
      list: [{ projectPath: '/p', name: 'ok' }],
    }
    const out = redact(input) as Record<string, unknown>
    expect(out.path).toBeUndefined()
    expect(out.db_path).toBeUndefined()
    expect((out.nested as Record<string, unknown>).absolutePath).toBeUndefined()
    expect((out.nested as Record<string, unknown>).cwd).toBeUndefined()
    expect((out.nested as Record<string, unknown>).keep).toBe('yes')
    expect((out.list as Array<Record<string, unknown>>)[0].projectPath).toBeUndefined()
    expect((out.list as Array<Record<string, unknown>>)[0].name).toBe('ok')
  })

  it('scrubs the home dir inside surviving strings (e.g. job command)', () => {
    const home = os.homedir()
    const out = redact({ command: `cd ${home}/p && run` }) as { command: string }
    expect(out.command).toBe('cd ~/p && run')
  })

  it('passes primitives through unchanged and never mutates input', () => {
    expect(redact(42)).toBe(42)
    expect(redact(true)).toBe(true)
    expect(redact(null)).toBe(null)
    const input = { a: 1 }
    redact(input)
    expect(input).toEqual({ a: 1 })
  })
})
