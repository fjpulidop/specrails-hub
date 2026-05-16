import { describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { ChildProcess } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  initDb,
  createConversation,
  updateConversation,
  type DbInstance,
} from './db'

const SCOPE_OPT_IN = { specrails: true, openspec: false, full: true, mcp: false, contractRefine: true }
import {
  prepareContractRefineSpawn,
  applyContractLayerToTicket,
  runContractRefine,
  runContractRefineForQuick,
} from './contract-refine-runner'
import {
  CONTRACT_LAYER_SEPARATOR,
  type ContractLayer,
} from './explore-contract-refine'
import { mutateStore, resolveTicketStoragePath, type TicketStore, CURRENT_SCHEMA_VERSION } from './ticket-store'

class FakeChild extends EventEmitter {
  stdout: Readable
  stderr: Readable | null = null
  pid = 12345
  killed = false
  constructor(stdoutLines: string[]) {
    super()
    this.stdout = Readable.from(stdoutLines.map((l) => l + '\n'))
  }
  kill(_signal?: string): boolean {
    this.killed = true
    return true
  }
}

function fakeSpawn(lines: string[], exitCode: number | null = 0, delay = 5): typeof import('./util/cli-prompt')['spawnAiCli'] {
  return ((_bin: string, _args: string[]) => {
    const c = new FakeChild(lines)
    // mimic claude finishing: after stdout drains, emit close
    setTimeout(() => c.emit('close', exitCode), delay)
    return c as unknown as ChildProcess
  }) as unknown as typeof import('./util/cli-prompt')['spawnAiCli']
}

function tmpProjectPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cr-runner-'))
}

function seedTicket(projectPath: string, id: number, description = 'user-authored body'): void {
  const filePath = resolveTicketStoragePath(projectPath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  // Initialise empty store via mutateStore (creates the file if missing).
  mutateStore(filePath, (s) => {
    s.schema_version = CURRENT_SCHEMA_VERSION
    s.next_id = id + 1
    s.tickets[String(id)] = {
      id,
      title: 'test',
      description,
      status: 'todo',
      priority: 'medium',
      labels: [],
      assignee: null,
      prerequisites: [],
      metadata: {},
      comments: [],
      origin_conversation_id: 'conv-1',
      is_epic: false,
      parent_epic_id: null,
      execution_order: null,
      short_summary: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'test',
      source: 'propose-spec',
    }
  })
}

function validContractBlock(): string {
  return [
    'preface text from the model',
    '```contract-layer',
    JSON.stringify({
      contractVersion: 1,
      namingContract: { enums: [], fields: [], functions: [], files: [] },
      dataShapes: [],
      stateMachine: 'A -> B',
      invariants: ['no nulls'],
      fileTouchList: [{ path: 'x.ts', action: 'extend', reason: 'r' }],
    }),
    '```',
  ].join('\n')
}

function streamLines(text: string): string[] {
  return [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-1',
      total_cost_usd: 0.001,
      duration_ms: 100,
      duration_api_ms: 80,
      num_turns: 1,
      usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      model: 'claude-haiku-4-5',
    }),
  ]
}

describe('prepareContractRefineSpawn', () => {
  it('produces deterministic argv with --disallowedTools', () => {
    const projectPath = tmpProjectPath()
    const out = prepareContractRefineSpawn(
      { projectSlug: 'slug', projectPath, projectName: 'proj' },
      { model: 'haiku', session_id: 'sess-1', context_scope: null },
    )
    expect(out.args).toContain('--resume')
    expect(out.args).toContain('sess-1')
    expect(out.args).toContain('--disallowedTools')
    expect(out.args.join(',')).toContain('Read,Grep,Glob,Bash')
    expect(out.args).toContain('-p')
    expect(out.args[out.args.length - 1]).toMatch(/CONTRACT REFINE/)
    expect(out.systemPrompt).toMatch(/Contract Refine/)
  })

  it('uses project path when contextScope.mcp is true', () => {
    const projectPath = tmpProjectPath()
    const out = prepareContractRefineSpawn(
      { projectSlug: 'slug', projectPath, projectName: 'proj' },
      { model: 'sonnet', session_id: 'sess-1', context_scope: JSON.stringify({ mcp: true }) },
    )
    expect(out.cwd).toBe(projectPath)
  })
})

describe('applyContractLayerToTicket', () => {
  it('appends the contract layer markdown to the description', () => {
    const projectPath = tmpProjectPath()
    seedTicket(projectPath, 42, 'original body')
    const filePath = resolveTicketStoragePath(projectPath)
    const layer: ContractLayer = {
      contractVersion: 1,
      namingContract: { enums: [], fields: [], functions: [], files: [] },
      dataShapes: [],
      stateMachine: null,
      invariants: ['inv-1'],
      fileTouchList: [],
    }
    const updated = applyContractLayerToTicket(filePath, 42, layer, '2026-05-12T00:00:00Z')
    expect(updated).not.toBeNull()
    expect(updated!.description).toContain('original body')
    expect(updated!.description).toContain(CONTRACT_LAYER_SEPARATOR)
    expect(updated!.description).toContain('### Invariants')
  })

  it('returns null when ticket id is unknown', () => {
    const projectPath = tmpProjectPath()
    const filePath = resolveTicketStoragePath(projectPath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    mutateStore(filePath, (s) => { s.schema_version = CURRENT_SCHEMA_VERSION; s.next_id = 1 })
    const layer: ContractLayer = {
      contractVersion: 1,
      namingContract: { enums: [], fields: [], functions: [], files: [] },
      dataShapes: [],
      stateMachine: null,
      invariants: [],
      fileTouchList: [],
    }
    const updated = applyContractLayerToTicket(filePath, 999, layer, '2026-05-12T00:00:00Z')
    expect(updated).toBeNull()
  })
})

describe('runContractRefine', () => {
  let db: DbInstance
  let projectPath: string
  let broadcastEvents: Array<{ type?: string; reason?: string; ticketId?: number }>
  const broadcast = (msg: unknown) => {
    broadcastEvents.push(msg as { type?: string; reason?: string; ticketId?: number })
  }

  beforeEach(() => {
    db = initDb(':memory:')
    projectPath = tmpProjectPath()
    broadcastEvents = []
  })

  function makeDeps(overrides: { spawn?: ReturnType<typeof fakeSpawn> } = {}) {
    return {
      db,
      projectId: 'proj-1',
      projectSlug: 'slug',
      projectPath,
      projectName: 'proj',
      broadcast,
      spawn: overrides.spawn,
      now: () => new Date('2026-05-12T00:00:00Z'),
      timeoutMs: 5000,
    }
  }

  function makeExploreConv(id: string, opts: { optIn?: boolean } = { optIn: true }): string {
    createConversation(db, {
      id,
      model: 'sonnet',
      kind: 'explore',
      ...(opts.optIn ? { contextScope: SCOPE_OPT_IN } : {}),
    })
    updateConversation(db, id, { session_id: 'sess-1' })
    return id
  }

  function setConversationScope(id: string, scope: Record<string, unknown>): void {
    db.prepare('UPDATE chat_conversations SET context_scope = ? WHERE id = ?')
      .run(JSON.stringify(scope), id)
  }

  it('returns scope-disabled when conversation context scope is missing (legacy)', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1', { optIn: false })
    const out = await runContractRefine(makeDeps(), 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('scope-disabled')
  })

  it('returns scope-disabled when conversation context scope opted out', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1', { optIn: false })
    setConversationScope('conv-1', { specrails: true, openspec: false, full: true, mcp: false, contractRefine: false })
    let spawned = false
    const spawn = (() => {
      spawned = true
      return new FakeChild([]) as unknown as ChildProcess
    }) as unknown as typeof import('./util/cli-prompt')['spawnAiCli']

    const out = await runContractRefine(makeDeps({ spawn }), 'conv-1', 1)

    expect(out.ok).toBe(false)
    expect(out.reason).toBe('scope-disabled')
    expect(spawned).toBe(false)
    expect(broadcastEvents).toEqual([])
    const rows = db.prepare('SELECT * FROM ai_invocations').all()
    expect(rows).toHaveLength(0)
  })

  it('runs when conversation scope opts in', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')

    const out = await runContractRefine(makeDeps({ spawn: fakeSpawn(streamLines(validContractBlock()), 0) }), 'conv-1', 1)

    expect(out.ok).toBe(true)
  })

  it('ignores conversation scope when retry path forces a fresh refine', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1', { optIn: false })
    setConversationScope('conv-1', { specrails: true, openspec: false, full: true, mcp: false, contractRefine: false })

    const out = await runContractRefine(
      { ...makeDeps({ spawn: fakeSpawn(streamLines(validContractBlock()), 0) }), ignoreConversationScope: true },
      'conv-1',
      1,
    )

    expect(out.ok).toBe(true)
  })

  it('returns not-explore when conversation kind is not explore', async () => {
    seedTicket(projectPath, 1)
    createConversation(db, { id: 'conv-1', model: 'sonnet', kind: 'sidebar' })
    updateConversation(db, 'conv-1', { session_id: 'sess-1' })
    const out = await runContractRefine(makeDeps(), 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('not-explore')
  })

  it('returns no-session when conversation has not produced a session_id yet', async () => {
    seedTicket(projectPath, 1)
    createConversation(db, { id: 'conv-1', model: 'sonnet', kind: 'explore', contextScope: SCOPE_OPT_IN })
    const out = await runContractRefine(makeDeps(), 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('no-session')
  })

  it('completes successfully and patches the ticket', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const deps = makeDeps({ spawn: fakeSpawn(streamLines(validContractBlock()), 0) })
    const out = await runContractRefine(deps, 'conv-1', 1)
    expect(out.ok).toBe(true)
    const ticketUpdated = broadcastEvents.find((e) => e.type === 'ticket_updated')
    expect(ticketUpdated).toBeDefined()
    const filePath = resolveTicketStoragePath(projectPath)
    const stored: TicketStore = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    expect(stored.tickets['1'].description).toContain('### Invariants')
  })

  it('emits explore.contract_refine_failed with reason=malformed for an unparseable block', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const lines = streamLines('```contract-layer\nNOT JSON\n```')
    const deps = makeDeps({ spawn: fakeSpawn(lines, 0) })
    const out = await runContractRefine(deps, 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('malformed')
    const fail = broadcastEvents.find((e) => e.type === 'explore.contract_refine_failed')
    expect(fail).toBeDefined()
    expect(fail!.reason).toBe('malformed')
  })

  it('emits reason=model_error when claude exits non-zero with a result event', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const lines = streamLines('') // result event present, no block
    const deps = makeDeps({ spawn: fakeSpawn(lines, 2) })
    const out = await runContractRefine(deps, 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('model_error')
    const fail = broadcastEvents.find((e) => e.type === 'explore.contract_refine_failed')
    expect(fail!.reason).toBe('model_error')
  })

  it('emits reason=crashed when claude exits non-zero with no result event', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const deps = makeDeps({ spawn: fakeSpawn([], 1) })
    const out = await runContractRefine(deps, 'conv-1', 1)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('crashed')
  })

  it('does not patch the ticket on failure', async () => {
    seedTicket(projectPath, 1, 'original body')
    makeExploreConv('conv-1')
    const lines = streamLines('```contract-layer\nNOT JSON\n```')
    const deps = makeDeps({ spawn: fakeSpawn(lines, 0) })
    await runContractRefine(deps, 'conv-1', 1)
    const filePath = resolveTicketStoragePath(projectPath)
    const stored: TicketStore = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    expect(stored.tickets['1'].description).toBe('original body')
  })

  it('records an ai_invocations row on success', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const deps = makeDeps({ spawn: fakeSpawn(streamLines(validContractBlock()), 0) })
    await runContractRefine(deps, 'conv-1', 1)
    const rows = db.prepare('SELECT * FROM ai_invocations WHERE conversation_id = ?').all('conv-1') as Array<{ status: string; ticket_id: number; surface: string; surface_ref_id: string; model: string | null }>
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('success')
    expect(rows[0].ticket_id).toBe(1)
    expect(rows[0].surface).toBe('explore-spec')
    expect(rows[0].surface_ref_id).toBe('contract-refine:conv-1')
    expect(rows[0].model).toBe('claude-haiku-4-5')
    expect(broadcastEvents.some((e) => e.type === 'explore.contract_refine_started' && e.ticketId === 1)).toBe(true)
  })

  it('records an ai_invocations row with status=failed on a parse failure', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const lines = streamLines('```contract-layer\nNOT JSON\n```')
    const deps = makeDeps({ spawn: fakeSpawn(lines, 0) })
    await runContractRefine(deps, 'conv-1', 1)
    const rows = db.prepare('SELECT * FROM ai_invocations WHERE conversation_id = ?').all('conv-1') as Array<{ status: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('failed')
  })

  it('runs Quick refine without --resume and records quick-spec invocation', async () => {
    seedTicket(projectPath, 1)
    let seenArgs: string[] = []
    const spawn = ((_bin: string, args: string[]) => {
      seenArgs = args
      const c = new FakeChild(streamLines(validContractBlock()))
      setTimeout(() => c.emit('close', 0), 5)
      return c as unknown as ChildProcess
    }) as unknown as typeof import('./util/cli-prompt')['spawnAiCli']

    const out = await runContractRefineForQuick(
      makeDeps({ spawn }),
      1,
      'Quick title',
      'Quick description',
      'haiku',
    )

    expect(out.ok).toBe(true)
    expect(seenArgs).not.toContain('--resume')
    expect(seenArgs).toContain('--system-prompt')
    expect(seenArgs.join('\n')).toContain('Quick title')
    const rows = db.prepare('SELECT surface, surface_ref_id, conversation_id, ticket_id, status, model FROM ai_invocations').all() as Array<{
      surface: string
      surface_ref_id: string | null
      conversation_id: string | null
      ticket_id: number
      status: string
      model: string | null
    }>
    expect(rows).toEqual([
      { surface: 'quick-spec', surface_ref_id: 'contract-refine:1', conversation_id: null, ticket_id: 1, status: 'success', model: 'claude-haiku-4-5' },
    ])
    expect(broadcastEvents.some((e) => e.type === 'explore.contract_refine_started' && e.ticketId === 1)).toBe(true)
  })

  it('respects the kill switch env even when the toggle is ON', async () => {
    seedTicket(projectPath, 1)
    makeExploreConv('conv-1')
    const prev = process.env.SPECRAILS_EXPLORE_CONTRACT_REFINE
    process.env.SPECRAILS_EXPLORE_CONTRACT_REFINE = '0'
    try {
      const out = await runContractRefine(makeDeps(), 'conv-1', 1)
      expect(out.ok).toBe(false)
      expect(out.reason).toBe('disabled')
    } finally {
      if (prev === undefined) delete process.env.SPECRAILS_EXPLORE_CONTRACT_REFINE
      else process.env.SPECRAILS_EXPLORE_CONTRACT_REFINE = prev
    }
  })
})
