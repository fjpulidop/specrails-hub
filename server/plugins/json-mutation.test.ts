import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import {
  atomicWriteFileSync,
  readJsonOr,
  surgicalMergeJson,
  surgicalRemoveKeys,
  withFileLock,
} from './json-mutation'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-jsonmut-'))
})
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('readJsonOr', () => {
  it('returns default when file missing', () => {
    expect(readJsonOr(path.join(tmpDir, 'x.json'), { a: 1 })).toEqual({ a: 1 })
  })

  it('returns default for empty file', () => {
    const f = path.join(tmpDir, 'x.json')
    fs.writeFileSync(f, '   \n')
    expect(readJsonOr(f, { a: 1 })).toEqual({ a: 1 })
  })

  it('parses valid JSON', () => {
    const f = path.join(tmpDir, 'x.json')
    fs.writeFileSync(f, '{"a":2}')
    expect(readJsonOr(f, { a: 1 })).toEqual({ a: 2 })
  })

  it('throws on malformed JSON', () => {
    const f = path.join(tmpDir, 'x.json')
    fs.writeFileSync(f, '{not-json')
    expect(() => readJsonOr(f, {})).toThrow()
  })
})

describe('atomicWriteFileSync', () => {
  it('creates parent directories', () => {
    const f = path.join(tmpDir, 'a', 'b', 'c', 'x.json')
    atomicWriteFileSync(f, '{}')
    expect(fs.readFileSync(f, 'utf8')).toBe('{}')
  })

  it('replaces existing file atomically (final bytes match)', () => {
    const f = path.join(tmpDir, 'x.json')
    fs.writeFileSync(f, 'old')
    atomicWriteFileSync(f, 'new')
    expect(fs.readFileSync(f, 'utf8')).toBe('new')
  })

  it('honors mode when provided', () => {
    const f = path.join(tmpDir, 'x.json')
    atomicWriteFileSync(f, '{}', 0o400)
    const stat = fs.statSync(f)
    expect(stat.mode & 0o777).toBe(0o400)
  })
})

describe('surgicalMergeJson', () => {
  it('creates a new file when missing', async () => {
    const f = path.join(tmpDir, 'a.json')
    await surgicalMergeJson(f, () => ({ a: 1 }))
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ a: 1 })
  })

  it('preserves untouched keys when merging', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1, b: { c: 2 } }))
    await surgicalMergeJson(f, (cur) => ({ ...(cur as object), a: 99 }))
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ a: 99, b: { c: 2 } })
  })

  it('throws on malformed JSON instead of stomping the file', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, '{not')
    await expect(surgicalMergeJson(f, () => ({}))).rejects.toThrow()
    expect(fs.readFileSync(f, 'utf8')).toBe('{not')
  })

  it('serializes concurrent writers (no lost updates)', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ count: 0 }))
    await Promise.all(
      Array.from({ length: 20 }, () =>
        surgicalMergeJson(f, (cur) => {
          const c = (cur as { count: number }) ?? { count: 0 }
          return { count: c.count + 1 }
        }),
      ),
    )
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ count: 20 })
  })

  it('deletes file when mutator returns null', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, '{}')
    await surgicalMergeJson(f, () => null)
    expect(fs.existsSync(f)).toBe(false)
  })
})

describe('surgicalRemoveKeys', () => {
  it('removes top-level keys', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1, b: 2 }))
    await surgicalRemoveKeys(f, ['a'])
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ b: 2 })
  })

  it('removes nested keys via dot path', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ mcpServers: { x: 1, y: 2 } }))
    await surgicalRemoveKeys(f, ['mcpServers.x'])
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ mcpServers: { y: 2 } })
  })

  it('is no-op when key missing', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1 }))
    await surgicalRemoveKeys(f, ['nope'])
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ a: 1 })
  })

  it('returns early when no paths given', async () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1 }))
    await surgicalRemoveKeys(f, [])
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ a: 1 })
  })
})

describe('withFileLock', () => {
  it('serializes by file path (different paths run in parallel)', async () => {
    const order: string[] = []
    const slow = (id: string) => async () => {
      order.push(`${id}:start`)
      await new Promise((r) => setTimeout(r, 10))
      order.push(`${id}:end`)
    }
    await Promise.all([
      withFileLock(path.join(tmpDir, 'a'), slow('A1')),
      withFileLock(path.join(tmpDir, 'a'), slow('A2')),
      withFileLock(path.join(tmpDir, 'b'), slow('B1')),
    ])
    // A1 and A2 must not interleave; B1 may interleave with either.
    const aStart = order.indexOf('A1:start')
    const aEnd = order.indexOf('A1:end')
    const a2Start = order.indexOf('A2:start')
    expect(aEnd).toBeLessThan(a2Start)
    expect(aStart).toBeLessThan(aEnd)
  })
})
