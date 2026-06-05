import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  return { ...actual, execSync: vi.fn() }
})

import { execSync } from 'child_process'
import { claudeAdapter, _normaliseClaudeModel } from './claude-adapter'
import type { AdapterEvent } from './types'

const mockExec = vi.mocked(execSync)

const FIXTURES = join(__dirname, '__fixtures__', 'claude')

function parseFixture(name: string): AdapterEvent[] {
  const raw = readFileSync(join(FIXTURES, name), 'utf8')
  return raw
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => claudeAdapter.parseStreamLine(l))
    .filter((e): e is AdapterEvent => e !== null)
}

describe('claudeAdapter — identity', () => {
  it('exposes expected conventions', () => {
    expect(claudeAdapter.id).toBe('claude')
    expect(claudeAdapter.displayName).toBe('Claude Code')
    expect(claudeAdapter.binary).toBe('claude')
    expect(claudeAdapter.projectDirName).toBe('.claude')
    expect(claudeAdapter.instructionsFilename).toBe('CLAUDE.md')
    expect(claudeAdapter.mcpRegistration).toBe('project-json')
    expect(claudeAdapter.minCliVersion).toBeNull()
  })

  it('declares all-true capabilities', () => {
    expect(claudeAdapter.capabilities.nativeResume).toBe(true)
    expect(claudeAdapter.capabilities.nativeStreamJson).toBe(true)
    expect(claudeAdapter.capabilities.nativeCostUsd).toBe(true)
    expect(claudeAdapter.capabilities.nativeOtelEnv).toBe(true)
    expect(claudeAdapter.capabilities.profileEnvSupport).toBe(true)
    expect(claudeAdapter.capabilities.systemPromptArg).toBe(true)
  })

  it('reports the baseline rail agents', () => {
    expect([...claudeAdapter.baselineAgents()].sort()).toEqual([
      'sr-architect',
      'sr-developer',
      'sr-reviewer',
    ])
  })

  it('reports a model catalog with a single default', () => {
    const cat = claudeAdapter.modelCatalog()
    expect(cat.length).toBeGreaterThan(0)
    const defaults = cat.filter((m) => m.default === true)
    expect(defaults).toHaveLength(1)
    expect(claudeAdapter.defaultModel()).toBe(defaults[0].value)
  })
})

describe('claudeAdapter._normaliseClaudeModel', () => {
  it('normalises pinned sonnet ids to "sonnet"', () => {
    expect(_normaliseClaudeModel('claude-sonnet-4-6')).toBe('sonnet')
    expect(_normaliseClaudeModel('claude-sonnet-4-5')).toBe('sonnet')
  })
  it('normalises pinned opus ids to "opus"', () => {
    expect(_normaliseClaudeModel('claude-opus-4-8')).toBe('opus')
  })
  it('normalises pinned haiku ids to "haiku"', () => {
    expect(_normaliseClaudeModel('claude-haiku-4-5-20251001')).toBe('haiku')
  })
  it('passes through already-short aliases', () => {
    expect(_normaliseClaudeModel('sonnet')).toBe('sonnet')
  })
  it('falls back to sonnet for empty/null', () => {
    expect(_normaliseClaudeModel(null)).toBe('sonnet')
    expect(_normaliseClaudeModel(undefined)).toBe('sonnet')
    expect(_normaliseClaudeModel('')).toBe('sonnet')
  })
})

describe('claudeAdapter.buildArgs', () => {
  it('chat-turn includes --system-prompt, --model, -p, and the common flags', () => {
    const args = claudeAdapter.buildArgs('chat-turn', {
      prompt: 'hello',
      systemPrompt: 'be brief',
      model: 'sonnet',
    })
    expect(args).toEqual([
      '--model', 'sonnet',
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
      '--setting-sources', 'project,local',
      '--system-prompt', 'be brief',
      '-p', 'hello',
    ])
  })

  it('chat-turn honours maxTurns and extraArgs', () => {
    const args = claudeAdapter.buildArgs('chat-turn', {
      prompt: 'hello',
      model: 'sonnet',
      maxTurns: 3,
      extraArgs: ['--foo', 'bar'],
    })
    expect(args).toContain('--max-turns')
    expect(args[args.indexOf('--max-turns') + 1]).toBe('3')
    expect(args.slice(-2)).toEqual(['--foo', 'bar'])
  })

  it('chat-turn normalises pinned model ids', () => {
    const args = claudeAdapter.buildArgs('chat-turn', {
      prompt: 'x',
      model: 'claude-opus-4-8',
    })
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
  })

  it('chat-resume requires sessionId and emits --resume', () => {
    expect(() =>
      claudeAdapter.buildArgs('chat-resume', { prompt: 'x', model: 'sonnet' }),
    ).toThrow(/sessionId/)

    const args = claudeAdapter.buildArgs('chat-resume', {
      prompt: 'second turn',
      sessionId: 'S123',
      model: 'sonnet',
    })
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('S123')
    expect(args).toContain('-p')
    expect(args[args.indexOf('-p') + 1]).toBe('second turn')
  })

  it('rail-job uses --append-system-prompt instead of --system-prompt', () => {
    const args = claudeAdapter.buildArgs('rail-job', {
      prompt: '/specrails:implement #1',
      systemPrompt: 'pipeline context',
      model: 'sonnet',
    })
    expect(args).toContain('--append-system-prompt')
    expect(args).not.toContain('--system-prompt')
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('pipeline context')
  })

  it('rail-job without systemPrompt skips the append flag', () => {
    const args = claudeAdapter.buildArgs('rail-job', {
      prompt: '/specrails:implement #1',
      model: 'sonnet',
    })
    expect(args).not.toContain('--append-system-prompt')
  })

  it('spec-gen emits max-turns and --system-prompt', () => {
    const args = claudeAdapter.buildArgs('spec-gen', {
      prompt: 'user idea',
      systemPrompt: 'spec rules',
      model: 'sonnet',
      maxTurns: 1,
    })
    expect(args).toContain('--max-turns')
    expect(args[args.indexOf('--max-turns') + 1]).toBe('1')
    expect(args).toContain('--system-prompt')
    expect(args).toContain('-p')
  })

  it('agent-refine includes --resume only when sessionId provided', () => {
    const first = claudeAdapter.buildArgs('agent-refine', {
      prompt: 'refine prompt',
      model: 'sonnet',
    })
    expect(first).not.toContain('--resume')

    const second = claudeAdapter.buildArgs('agent-refine', {
      prompt: 'follow up',
      sessionId: 'R456',
      model: 'sonnet',
    })
    expect(second).toContain('--resume')
    expect(second[second.indexOf('--resume') + 1]).toBe('R456')
  })

  it('setup-enrich begins with -p <prompt> and includes common flags', () => {
    const args = claudeAdapter.buildArgs('setup-enrich', {
      prompt: '/specrails:enrich',
      model: 'sonnet',
    })
    expect(args[0]).toBe('-p')
    expect(args[1]).toBe('/specrails:enrich')
    expect(args).toContain('--output-format')
  })

  it('setup-enrich-resume requires sessionId and emits --resume first', () => {
    expect(() =>
      claudeAdapter.buildArgs('setup-enrich-resume', { prompt: 'x', model: 'sonnet' }),
    ).toThrow(/sessionId/)

    const args = claudeAdapter.buildArgs('setup-enrich-resume', {
      prompt: 'user msg',
      sessionId: 'S789',
      model: 'sonnet',
    })
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('S789')
  })

  it('auto-title uses minimal flags', () => {
    const args = claudeAdapter.buildArgs('auto-title', {
      prompt: 'title prompt',
      model: 'sonnet',
    })
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
  })
})

describe('claudeAdapter.parseStreamLine', () => {
  it('returns null for an empty line', () => {
    expect(claudeAdapter.parseStreamLine('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(claudeAdapter.parseStreamLine('not json')).toBeNull()
  })

  it('parses the system/init event into session-started', () => {
    const ev = claudeAdapter.parseStreamLine(
      '{"type":"system","subtype":"init","session_id":"S1"}',
    )
    expect(ev).toEqual({ kind: 'session-started', sessionId: 'S1' })
  })

  it('parses an assistant text block into text-delta', () => {
    const ev = claudeAdapter.parseStreamLine(
      '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}',
    )
    expect(ev).toEqual({ kind: 'text-delta', text: 'hi' })
  })

  it('parses a result event into result', () => {
    const ev = claudeAdapter.parseStreamLine(
      '{"type":"result","total_cost_usd":0.012,"usage":{"input_tokens":10}}',
    )
    expect(ev?.kind).toBe('result')
    if (ev?.kind === 'result') {
      expect(ev.payload.total_cost_usd).toBe(0.012)
    }
  })

  it('parses a tool_use event', () => {
    const ev = claudeAdapter.parseStreamLine(
      '{"type":"tool_use","name":"Bash","input":{"command":"ls"}}',
    )
    expect(ev?.kind).toBe('tool-use')
    if (ev?.kind === 'tool-use') {
      expect(ev.name).toBe('Bash')
      expect(ev.inputPreview).toContain('ls')
    }
  })

  it('returns other for unknown event types', () => {
    const ev = claudeAdapter.parseStreamLine('{"type":"weird_unknown","foo":1}')
    expect(ev?.kind).toBe('other')
    if (ev?.kind === 'other') expect(ev.type).toBe('weird_unknown')
  })
})

describe('claudeAdapter.extractResult — from fixture', () => {
  it('extracts every NormalisedResult field for a complete stream', () => {
    const events = parseFixture('hello-3-words.jsonl')
    const result = claudeAdapter.extractResult(events)
    expect(result.tokens_in).toBe(120)
    expect(result.tokens_out).toBe(4)
    expect(result.tokens_cache_read).toBe(50)
    expect(result.tokens_cache_create).toBe(10)
    expect(result.total_cost_usd).toBe(0.0017)
    expect(result.num_turns).toBe(1)
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.duration_ms).toBe(820)
    expect(result.duration_api_ms).toBe(640)
    expect(result.session_id).toBe('a1b2c3d4-e5f6-4789-abcd-ef0123456789')
  })

  it('returns only session_id when no result event is present', () => {
    const events: AdapterEvent[] = [
      { kind: 'session-started', sessionId: 'S2' },
      { kind: 'text-delta', text: 'partial' },
    ]
    const result = claudeAdapter.extractResult(events)
    expect(result.session_id).toBe('S2')
    expect(result.tokens_in).toBeUndefined()
    expect(result.total_cost_usd).toBeUndefined()
  })

  it('result event session_id wins over earlier session-started', () => {
    const events: AdapterEvent[] = [
      { kind: 'session-started', sessionId: 'S-OLD' },
      { kind: 'result', payload: { type: 'result', session_id: 'S-NEW' } },
    ]
    expect(claudeAdapter.extractResult(events).session_id).toBe('S-NEW')
  })
})

describe('claudeAdapter.detectInstalled', () => {
  beforeEach(() => {
    mockExec.mockReset()
  })

  it('reports installed when which succeeds and --version returns semver', async () => {
    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes('which claude') || cmd.includes('where claude')) return '/usr/local/bin/claude' as never
      if (cmd === 'claude --version') return '1.2.3 (claude-code)' as never
      throw new Error('unexpected exec ' + cmd)
    })
    const result = await claudeAdapter.detectInstalled()
    expect(result.installed).toBe(true)
    expect(result.executable).toBe(true)
    expect(result.version).toBe('1.2.3')
    expect(result.meetsMinimum).toBe(true)
  })

  it('reports not installed when which fails', async () => {
    mockExec.mockImplementation(() => { throw new Error('not found') })
    const result = await claudeAdapter.detectInstalled()
    expect(result.installed).toBe(false)
    expect(result.executable).toBe(false)
  })

  it('reports executable=false when which succeeds but --version fails', async () => {
    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes('which claude') || cmd.includes('where claude')) return '/usr/local/bin/claude' as never
      if (cmd === 'claude --version') throw new Error('broken')
      throw new Error('unexpected ' + cmd)
    })
    const result = await claudeAdapter.detectInstalled()
    expect(result.installed).toBe(true)
    expect(result.executable).toBe(false)
  })
})
