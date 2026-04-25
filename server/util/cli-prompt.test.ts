import { describe, it, expect } from 'vitest'
import {
  transformClaudeArgsForWindows,
  transformCodexArgsForWindows,
  ensureStdinPipe,
} from './cli-prompt'

describe('transformClaudeArgsForWindows', () => {
  it('returns args unchanged when no prompt flags are present', () => {
    const args = ['--dangerously-skip-permissions', '--verbose']
    const out = transformClaudeArgsForWindows(args)
    expect(out.args).toEqual(args)
    expect(out.stdinPayload).toBeNull()
  })

  it('extracts -p value into stdin and re-adds bare -p', () => {
    const out = transformClaudeArgsForWindows([
      '--verbose',
      '-p',
      'hello\nworld',
    ])
    expect(out.args).toEqual(['--verbose', '-p'])
    expect(out.stdinPayload).toBe('hello\nworld')
  })

  it('joins --system-prompt + -p with separator preserving order', () => {
    const out = transformClaudeArgsForWindows([
      '--system-prompt',
      'system rules',
      '--verbose',
      '-p',
      'user idea',
    ])
    expect(out.args).toEqual(['--verbose', '-p'])
    expect(out.stdinPayload).toBe('system rules\n\n---\n\nuser idea')
  })

  it('handles --append-system-prompt + -p combination', () => {
    const out = transformClaudeArgsForWindows([
      '--append-system-prompt',
      'append rules',
      '-p',
      '/specrails:implement #3 --yes',
    ])
    expect(out.args).toEqual(['-p'])
    expect(out.stdinPayload).toBe('append rules\n\n---\n\n/specrails:implement #3 --yes')
  })

  it('treats --print as an alias for -p', () => {
    const out = transformClaudeArgsForWindows([
      '--print',
      'value with\nnewline',
      '--model',
      'claude-x',
    ])
    expect(out.args).toEqual(['--model', 'claude-x', '-p'])
    expect(out.stdinPayload).toBe('value with\nnewline')
  })

  it('preserves non-prompt flags around extracted prompt flags', () => {
    const out = transformClaudeArgsForWindows([
      '--dangerously-skip-permissions',
      '--max-turns',
      '4',
      '--system-prompt',
      'sys',
      '--model',
      'm',
      '-p',
      'usr',
    ])
    expect(out.args).toEqual([
      '--dangerously-skip-permissions',
      '--max-turns',
      '4',
      '--model',
      'm',
      '-p',
    ])
    expect(out.stdinPayload).toBe('sys\n\n---\n\nusr')
  })

  it('keeps trailing prompt flag without value untouched', () => {
    // -p with no following value is a flag without arg; should be preserved
    // and no stdin payload created. (Edge case: tail position.)
    const out = transformClaudeArgsForWindows(['--verbose', '-p'])
    expect(out.args).toEqual(['--verbose', '-p'])
    expect(out.stdinPayload).toBeNull()
  })
})

describe('transformCodexArgsForWindows', () => {
  it('returns args unchanged when first token is not exec', () => {
    const args = ['--help']
    const out = transformCodexArgsForWindows(args)
    expect(out.args).toEqual(args)
    expect(out.stdinPayload).toBeNull()
  })

  it('keeps single-line exec prompt as positional argv', () => {
    const out = transformCodexArgsForWindows([
      'exec',
      'short prompt',
      '--model',
      'gpt-x',
    ])
    expect(out.args).toEqual(['exec', 'short prompt', '--model', 'gpt-x'])
    expect(out.stdinPayload).toBeNull()
  })

  it('routes multi-line exec prompt through stdin with `-` placeholder', () => {
    const out = transformCodexArgsForWindows([
      'exec',
      'multi\nline\nprompt',
      '--model',
      'gpt-x',
    ])
    expect(out.args).toEqual(['exec', '-', '--model', 'gpt-x'])
    expect(out.stdinPayload).toBe('multi\nline\nprompt')
  })

  it('handles boolean flags like --full-auto before the prompt', () => {
    const out = transformCodexArgsForWindows([
      'exec',
      '--full-auto',
      'system\nuser combined',
    ])
    expect(out.args).toEqual(['exec', '--full-auto', '-'])
    expect(out.stdinPayload).toBe('system\nuser combined')
  })

  it('treats --model as a value-bearing flag (does not consume as prompt)', () => {
    const out = transformCodexArgsForWindows([
      'exec',
      '--model',
      'gpt-y',
      'multi\nline',
    ])
    expect(out.args).toEqual(['exec', '--model', 'gpt-y', '-'])
    expect(out.stdinPayload).toBe('multi\nline')
  })

  it('keeps subsequent positionals after the first as argv', () => {
    const out = transformCodexArgsForWindows([
      'exec',
      'multi\nline',
      'extra-positional',
    ])
    expect(out.args).toEqual(['exec', '-', 'extra-positional'])
    expect(out.stdinPayload).toBe('multi\nline')
  })
})

describe('ensureStdinPipe', () => {
  it('returns full pipe stdio when undefined', () => {
    expect(ensureStdinPipe(undefined)).toEqual(['pipe', 'pipe', 'pipe'])
  })

  it('keeps a string stdio mapped uniformly except stdin pipe', () => {
    expect(ensureStdinPipe('inherit')).toEqual(['pipe', 'inherit', 'inherit'])
  })

  it('upgrades stdin from ignore to pipe and preserves stdout/stderr', () => {
    expect(ensureStdinPipe(['ignore', 'pipe', 'pipe'])).toEqual(['pipe', 'pipe', 'pipe'])
  })

  it('keeps explicit stdin entry as-is when not ignore', () => {
    expect(ensureStdinPipe(['pipe', 'inherit', 'inherit'])).toEqual(['pipe', 'inherit', 'inherit'])
  })

  it('falls back to defaults for missing array slots', () => {
    expect(ensureStdinPipe([] as never)).toEqual(['pipe', 'pipe', 'pipe'])
  })
})
