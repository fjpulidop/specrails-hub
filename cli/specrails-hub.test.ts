import { describe, it, expect } from 'vitest'
import { parseArgs, formatDuration, formatTokens } from './specrails-hub'

describe('parseArgs', () => {
  it('returns help mode with no args', () => {
    expect(parseArgs([])).toEqual({ mode: 'help' })
  })

  it('returns help mode with --help flag', () => {
    expect(parseArgs(['--help'])).toEqual({ mode: 'help' })
    expect(parseArgs(['-h'])).toEqual({ mode: 'help' })
  })

  it('returns status mode', () => {
    expect(parseArgs(['--status'])).toEqual({ mode: 'status', port: 4200 })
  })

  it('returns jobs mode', () => {
    expect(parseArgs(['--jobs'])).toEqual({ mode: 'jobs', port: 4200 })
  })

  it('parses --port flag', () => {
    expect(parseArgs(['--port', '5000', '--status'])).toEqual({ mode: 'status', port: 5000 })
  })

  it('ignores invalid --port value and uses default', () => {
    const result = parseArgs(['--port', 'bad', '--status'])
    expect(result).toEqual({ mode: 'status', port: 4200 })
  })

  it('routes "hub" subcommand', () => {
    expect(parseArgs(['hub', 'start'])).toEqual({ mode: 'hub', subArgs: ['start'], port: 4200 })
    expect(parseArgs(['hub', 'stop'])).toEqual({ mode: 'hub', subArgs: ['stop'], port: 4200 })
    expect(parseArgs(['hub', 'list'])).toEqual({ mode: 'hub', subArgs: ['list'], port: 4200 })
  })

  it('routes shorthand hub subcommands without explicit "hub" prefix', () => {
    expect(parseArgs(['start'])).toEqual({ mode: 'hub', subArgs: ['start'], port: 4200 })
    expect(parseArgs(['stop'])).toEqual({ mode: 'hub', subArgs: ['stop'], port: 4200 })
    expect(parseArgs(['add'])).toEqual({ mode: 'hub', subArgs: ['add'], port: 4200 })
    expect(parseArgs(['remove'])).toEqual({ mode: 'hub', subArgs: ['remove'], port: 4200 })
    expect(parseArgs(['list'])).toEqual({ mode: 'hub', subArgs: ['list'], port: 4200 })
  })

  it('passes extra args through for shorthand hub subcommands', () => {
    expect(parseArgs(['add', '/some/path'])).toEqual({
      mode: 'hub',
      subArgs: ['add', '/some/path'],
      port: 4200,
    })
  })

  it('injects /sr: prefix for known verbs', () => {
    const result = parseArgs(['implement', '#42'])
    expect(result).toEqual({ mode: 'command', resolved: '/sr:implement #42', port: 4200 })
  })

  it('injects /sr: prefix for batch-implement', () => {
    const result = parseArgs(['batch-implement', '#40', '#41'])
    expect(result).toEqual({ mode: 'command', resolved: '/sr:batch-implement #40 #41', port: 4200 })
  })

  it('passes through slash-prefixed commands as raw', () => {
    const result = parseArgs(['/sr:implement', '#42'])
    expect(result).toEqual({ mode: 'raw', resolved: '/sr:implement #42', port: 4200 })
  })

  it('treats unknown tokens as raw prompt', () => {
    const result = parseArgs(['do something interesting'])
    expect(result).toEqual({ mode: 'raw', resolved: 'do something interesting', port: 4200 })
  })

  it('strips --port from args before routing', () => {
    const result = parseArgs(['--port', '9999', 'implement', '#1'])
    expect(result).toEqual({ mode: 'command', resolved: '/sr:implement #1', port: 9999 })
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(59000)).toBe('59s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(90000)).toBe('1m 30s')
    expect(formatDuration(3661000)).toBe('61m 1s')
  })
})

describe('formatTokens', () => {
  it('formats numbers with space separators', () => {
    expect(formatTokens(1000)).toBe('1 000')
    expect(formatTokens(1234567)).toBe('1 234 567')
    expect(formatTokens(42)).toBe('42')
  })
})
