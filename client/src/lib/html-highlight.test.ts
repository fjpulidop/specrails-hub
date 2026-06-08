import { describe, it, expect } from 'vitest'
import { tokenizeHtml, HL_CLASS } from './html-highlight'

describe('tokenizeHtml', () => {
  it('round-trips: concatenated token text equals the input', () => {
    const html = '<div class="a" id="b">\n  <span>hi</span>\n</div>'
    const tokens = tokenizeHtml(html)
    expect(tokens.map((t) => t.text).join('')).toBe(html)
  })

  it('classifies tag name, attribute name and quoted value', () => {
    const tokens = tokenizeHtml('<a href="/x">link</a>')
    const byType = (ty: string) => tokens.filter((t) => t.type === ty).map((t) => t.text)
    expect(byType('tag')).toContain('a')
    expect(byType('attr')).toContain('href')
    expect(byType('value')).toContain('"/x"')
    expect(byType('text')).toContain('link')
    expect(byType('punct')).toEqual(expect.arrayContaining(['<', '>', '=', '/']))
  })

  it('handles closing tags and void elements', () => {
    const tokens = tokenizeHtml('<br><img src="a.png">')
    expect(tokens.map((t) => t.text).join('')).toBe('<br><img src="a.png">')
    expect(tokens.some((t) => t.type === 'tag' && t.text === 'img')).toBe(true)
  })

  it('treats text outside tags as text tokens', () => {
    const tokens = tokenizeHtml('hello <b>x</b> world')
    expect(tokens[0]).toEqual({ type: 'text', text: 'hello ' })
    expect(tokens.some((t) => t.type === 'text' && t.text === ' world')).toBe(true)
  })

  it('does not choke on an unterminated tag', () => {
    const tokens = tokenizeHtml('<div class="x"')
    expect(tokens.map((t) => t.text).join('')).toBe('<div class="x"')
  })

  it('exposes a class for every token type', () => {
    for (const t of ['tag', 'attr', 'value', 'punct', 'text'] as const) {
      expect(typeof HL_CLASS[t]).toBe('string')
      expect(HL_CLASS[t].length).toBeGreaterThan(0)
    }
  })
})
