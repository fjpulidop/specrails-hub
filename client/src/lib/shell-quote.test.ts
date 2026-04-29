import { describe, it, expect } from 'vitest'
import { quotePosix, quoteWindowsCmd, quoteForHost, quotePathList } from './shell-quote'

describe('quotePosix', () => {
  it('quotes a plain path', () => {
    expect(quotePosix('/Users/me/file.txt')).toBe(`'/Users/me/file.txt'`)
  })
  it('quotes a path with spaces', () => {
    expect(quotePosix('/Users/me/My File.txt')).toBe(`'/Users/me/My File.txt'`)
  })
  it('escapes embedded single quotes', () => {
    expect(quotePosix(`/Users/me/it's.txt`)).toBe(`'/Users/me/it'\\''s.txt'`)
  })
  it('quotes paths with $, backticks, parens, &, |', () => {
    expect(quotePosix('/path/with $vars && (more) `cmd`'))
      .toBe(`'/path/with $vars && (more) \`cmd\`'`)
  })
})

describe('quoteWindowsCmd', () => {
  it('double-quotes a plain path', () => {
    expect(quoteWindowsCmd('C:\\Users\\me\\file.txt')).toBe(`"C:\\Users\\me\\file.txt"`)
  })
  it('escapes inner double quotes by doubling', () => {
    expect(quoteWindowsCmd('C:\\foo\\"bar".txt')).toBe(`"C:\\foo\\""bar"".txt"`)
  })
  it('escapes percent and caret', () => {
    expect(quoteWindowsCmd('foo%PATH%bar')).toBe(`"foo^%PATH^%bar"`)
    expect(quoteWindowsCmd('hello^world')).toBe(`"hello^^world"`)
  })
  it('handles paths with spaces and parens', () => {
    expect(quoteWindowsCmd('C:\\Program Files (x86)\\foo'))
      .toBe(`"C:\\Program Files (x86)\\foo"`)
  })
})

describe('quoteForHost / quotePathList', () => {
  it('routes to POSIX or Windows by flag', () => {
    expect(quoteForHost('/a b', false)).toBe(`'/a b'`)
    expect(quoteForHost('C:\\a b', true)).toBe(`"C:\\a b"`)
  })
  it('joins multiple paths with single space', () => {
    expect(quotePathList(['/a b', '/c'], false)).toBe(`'/a b' '/c'`)
    expect(quotePathList(['C:\\a b', 'C:\\c'], true)).toBe(`"C:\\a b" "C:\\c"`)
  })
})
