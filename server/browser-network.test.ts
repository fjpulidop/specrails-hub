import { describe, it, expect } from 'vitest'
import { NetworkRingBuffer, sketchJsonShape, shouldSkipNetworkEntry, NETWORK_DENY_TYPES } from './browser-network'

describe('sketchJsonShape', () => {
  it('sketches a flat object as key:type pairs', () => {
    expect(sketchJsonShape('{"id":1,"name":"x","ok":true}')).toBe('{ id: number, name: string, ok: boolean }')
  })

  it('sketches an array of objects using the first element', () => {
    expect(sketchJsonShape('[{"id":1,"name":"x"}]')).toBe('[{ id: number, name: string }]')
  })

  it('marks arrays with more than one element', () => {
    expect(sketchJsonShape('["a","b","c"]')).toBe('[string, …]')
  })

  it('handles empty arrays and null', () => {
    expect(sketchJsonShape('[]')).toBe('[]')
    expect(sketchJsonShape('null')).toBe('null')
    expect(sketchJsonShape('{"x":null}')).toBe('{ x: null }')
  })

  it('caps nesting depth', () => {
    const deep = JSON.stringify({ a: { b: { c: { d: 1 } } } })
    // maxDepth default 3 → the 4th level collapses to "object"
    expect(sketchJsonShape(deep)).toBe('{ a: { b: { c: object } } }')
  })

  it('truncates objects past maxKeys', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 30; i++) obj[`k${i}`] = i
    const out = sketchJsonShape(JSON.stringify(obj), { maxKeys: 3 })
    expect(out).toContain('k0: number')
    expect(out).toContain(', … }')
  })

  it('returns null for non-JSON, empty, or oversized input', () => {
    expect(sketchJsonShape('not json')).toBeNull()
    expect(sketchJsonShape('')).toBeNull()
    expect(sketchJsonShape('a'.repeat(300_000))).toBeNull()
    // @ts-expect-error guarding non-string at runtime
    expect(sketchJsonShape(undefined)).toBeNull()
  })
})

describe('shouldSkipNetworkEntry', () => {
  it('skips static asset resource types', () => {
    for (const t of NETWORK_DENY_TYPES) expect(shouldSkipNetworkEntry(t, 'https://x/y')).toBe(true)
  })
  it('skips data: and blob: URLs', () => {
    expect(shouldSkipNetworkEntry('Fetch', 'data:application/json,{}')).toBe(true)
    expect(shouldSkipNetworkEntry('XHR', 'blob:https://x/abc')).toBe(true)
  })
  it('keeps real XHR/Fetch/Document requests', () => {
    expect(shouldSkipNetworkEntry('Fetch', 'https://api.x/items')).toBe(false)
    expect(shouldSkipNetworkEntry('XHR', 'https://api.x/items')).toBe(false)
    expect(shouldSkipNetworkEntry('Document', 'https://x/')).toBe(false)
  })
})

describe('NetworkRingBuffer', () => {
  it('records a full request lifecycle and exposes it via recent()', () => {
    const buf = new NetworkRingBuffer()
    buf.start('1', { method: 'GET', url: 'https://api.x/items?secret=abc', resourceType: 'Fetch', startedAt: 1000, requestBodyShape: null })
    buf.response('1', { status: 200, mimeType: 'application/json' })
    buf.finish('1', { finishedAt: 1120 })
    const [r] = buf.recent(0)
    expect(r.method).toBe('GET')
    expect(r.status).toBe(200)
    expect(r.mimeType).toBe('application/json')
    expect(r.durationMs).toBe(120)
    expect(r.url).toContain('secret=abc') // URL preserved (window is local-dev)
  })

  it('drops static-asset and data: entries at insertion', () => {
    const buf = new NetworkRingBuffer()
    buf.start('img', { method: 'GET', url: 'https://x/a.png', resourceType: 'Image', startedAt: 1 })
    buf.start('data', { method: 'GET', url: 'data:image/png;base64,AAA', resourceType: 'Fetch', startedAt: 1 })
    expect(buf.size).toBe(0)
    // response/finish for an unknown id are no-ops
    buf.response('img', { status: 200, mimeType: 'image/png' })
    expect(buf.recent(0)).toHaveLength(0)
  })

  it('records failures with errorText and a duration', () => {
    const buf = new NetworkRingBuffer()
    buf.start('1', { method: 'POST', url: 'https://api.x/save', resourceType: 'Fetch', startedAt: 100, requestBodyShape: '{ name: string }' })
    buf.fail('1', { finishedAt: 250, errorText: 'net::ERR_FAILED' })
    const [r] = buf.recent(0)
    expect(r.failed).toBe(true)
    expect(r.errorText).toBe('net::ERR_FAILED')
    expect(r.durationMs).toBe(150)
    expect(r.requestBodyShape).toBe('{ name: string }')
  })

  it('filters by sinceMs, returns newest-first, and caps the result', () => {
    const buf = new NetworkRingBuffer()
    for (let i = 0; i < 5; i++) buf.start(`r${i}`, { method: 'GET', url: `https://api.x/${i}`, resourceType: 'Fetch', startedAt: i * 100 })
    // since 250 → only startedAt 300, 400 qualify
    const recent = buf.recent(250)
    expect(recent.map((r) => r.url)).toEqual(['https://api.x/4', 'https://api.x/3'])
    // cap
    const buf2 = new NetworkRingBuffer()
    for (let i = 0; i < 10; i++) buf2.start(`r${i}`, { method: 'GET', url: `https://x/${i}`, resourceType: 'Fetch', startedAt: i })
    expect(buf2.recent(0, 3)).toHaveLength(3)
  })

  it('evicts the oldest entries past the cap', () => {
    const buf = new NetworkRingBuffer(2)
    buf.start('a', { method: 'GET', url: 'https://x/a', resourceType: 'Fetch', startedAt: 1 })
    buf.start('b', { method: 'GET', url: 'https://x/b', resourceType: 'Fetch', startedAt: 2 })
    buf.start('c', { method: 'GET', url: 'https://x/c', resourceType: 'Fetch', startedAt: 3 })
    expect(buf.size).toBe(2)
    expect(buf.recent(0).map((r) => r.url)).toEqual(['https://x/c', 'https://x/b'])
  })

  it('gates body sketching on JSON mime and applies it once', () => {
    const buf = new NetworkRingBuffer()
    buf.start('1', { method: 'GET', url: 'https://api.x/items', resourceType: 'Fetch', startedAt: 1 })
    expect(buf.wantsBodySketch('1')).toBe(false) // no mime yet
    buf.response('1', { status: 200, mimeType: 'text/html' })
    expect(buf.wantsBodySketch('1')).toBe(false) // not JSON
    buf.response('1', { status: 200, mimeType: 'application/json; charset=utf-8' })
    expect(buf.wantsBodySketch('1')).toBe(true)
    buf.setResponseShape('1', '{ items: [object] }')
    expect(buf.wantsBodySketch('1')).toBe(false) // already sketched
    expect(buf.recent(0)[0].responseShape).toBe('{ items: [object] }')
    // null/empty shape is ignored; unknown id is a no-op
    buf.setResponseShape('1', null)
    buf.setResponseShape('nope', '{ x: number }')
    expect(buf.recent(0)[0].responseShape).toBe('{ items: [object] }')
  })
})
