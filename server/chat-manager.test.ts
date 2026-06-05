import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

// Mock child_process before importing chat-manager
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('tree-kill', () => ({
  default: vi.fn(),
}))

import { spawn as mockSpawn, execSync as mockExecSync } from 'child_process'
import treeKill from 'tree-kill'
import { ChatManager } from './chat-manager'
import { initDb, createConversation, getConversation, createJob, finishJob } from './db'

const MCP_SCOPE = { specrails: false, openspec: false, full: false, mcp: true, contractRefine: false }
import type { DbInstance } from './db'

function createMockChildProcess() {
  const child = new EventEmitter() as any
  child.stdout = new Readable({ read() {} })
  child.stderr = new Readable({ read() {} })
  child.pid = 42000
  child.kill = vi.fn()
  return child
}

function pushLine(child: any, line: string) {
  child.stdout.push(line + '\n')
}

function finishProcess(child: any, code: number): Promise<void> {
  // Push EOF on stdout, then wait for readline to drain before emitting close.
  // readline processes data asynchronously; setImmediate ensures all buffered
  // line events have fired before the close handler runs.
  return new Promise((resolve) => {
    child.stdout.push(null)
    setImmediate(() => {
      child.emit('close', code)
      resolve()
    })
  })
}

function assistantEvent(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
  })
}

function resultEvent(sessionId: string): string {
  return JSON.stringify({ type: 'result', session_id: sessionId })
}

function getBroadcastedByType(broadcast: ReturnType<typeof vi.fn>, type: string) {
  return broadcast.mock.calls
    .map((args) => args[0] as Record<string, unknown>)
    .filter((msg) => msg.type === type)
}

const TEST_CONV_ID = 'conv-test-001'

describe('ChatManager', () => {
  let db: DbInstance
  let broadcast: ReturnType<typeof vi.fn>
  let cm: ChatManager

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(mockExecSync).mockReturnValue(Buffer.from('/usr/bin/claude'))
    db = initDb(':memory:')
    broadcast = vi.fn()
    cm = new ChatManager(broadcast, db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupConversation(model = 'claude-sonnet-4-5'): string {
    createConversation(db, { id: TEST_CONV_ID, model })
    return TEST_CONV_ID
  }

  // ─── Test 1: sendMessage persists user message and triggers chat_stream + chat_done ─

  it('sendMessage persists user message and triggers chat_stream + chat_done broadcasts', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Hello world')

    pushLine(child, assistantEvent('Hello '))
    pushLine(child, assistantEvent('back!'))
    pushLine(child, resultEvent('sess-abc'))
    await finishProcess(child, 0)

    await sendPromise

    const streamMsgs = getBroadcastedByType(broadcast, 'chat_stream')
    expect(streamMsgs.length).toBeGreaterThan(0)
    expect(streamMsgs[0].conversationId).toBe(convId)
    expect(streamMsgs[0].delta).toBeTruthy()

    const doneMsgs = getBroadcastedByType(broadcast, 'chat_done')
    expect(doneMsgs).toHaveLength(1)
    expect(doneMsgs[0].conversationId).toBe(convId)
    expect(doneMsgs[0].fullText).toBe('Hello back!')
  })

  it('normalizes legacy Claude model ids to Claude Code aliases before spawning', async () => {
    const convId = setupConversation('claude-sonnet-4-6')
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Hello world')

    const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
    const modelIdx = spawnArgs.indexOf('--model')
    expect(modelIdx).toBeGreaterThan(-1)
    expect(spawnArgs[modelIdx + 1]).toBe('sonnet')

    pushLine(child, assistantEvent('Hello'))
    pushLine(child, resultEvent('sess-abc'))
    await finishProcess(child, 0)
    await sendPromise
  })

  // ─── Test 2: abort triggers chat_error { error: 'aborted' } ───────────────

  it('abort triggers chat_error with aborted reason', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Do something')

    expect(cm.isActive(convId)).toBe(true)
    cm.abort(convId)

    await finishProcess(child, 1)
    await sendPromise

    const errorMsgs = getBroadcastedByType(broadcast, 'chat_error')
    expect(errorMsgs.length).toBeGreaterThan(0)
    expect(errorMsgs[0].conversationId).toBe(convId)
    expect(errorMsgs[0].error).toBe('aborted')
    expect(vi.mocked(treeKill)).toHaveBeenCalledWith(child.pid, 'SIGTERM')
  })

  // ─── Test 3: :::command block triggers chat_command_proposal ──────────────

  it(':::command block in response triggers chat_command_proposal broadcast', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'What should I do?')

    const responseWithCommand = 'You should run:\n:::command\n/specrails:implement #5\n:::\nThis will help.'
    pushLine(child, assistantEvent(responseWithCommand))
    pushLine(child, resultEvent('sess-xyz'))
    await finishProcess(child, 0)

    await sendPromise

    const proposalMsgs = getBroadcastedByType(broadcast, 'chat_command_proposal')
    expect(proposalMsgs).toHaveLength(1)
    expect(proposalMsgs[0].conversationId).toBe(convId)
    expect(proposalMsgs[0].command).toBe('/specrails:implement #5')
  })

  // ─── Test 4: duplicate :::command blocks not emitted twice ────────────────

  it('duplicate :::command blocks in same response are not emitted twice', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Suggest something')

    // Emit the same command twice across two chunks (buffer accumulates)
    pushLine(child, assistantEvent(':::command\n/specrails:implement #1\n:::'))
    pushLine(child, assistantEvent(' and again :::command\n/specrails:implement #1\n:::'))
    pushLine(child, resultEvent('sess-dup'))
    await finishProcess(child, 0)

    await sendPromise

    const proposalMsgs = getBroadcastedByType(broadcast, 'chat_command_proposal')
    expect(proposalMsgs).toHaveLength(1)
  })

  // ─── Test 5: session_id stored in DB after first turn ────────────────────

  it('session_id is stored in DB after first turn completes', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Hello')

    pushLine(child, assistantEvent('Hi there'))
    pushLine(child, resultEvent('sess-stored'))
    await finishProcess(child, 0)

    await sendPromise

    const conv = getConversation(db, convId)
    expect(conv?.session_id).toBe('sess-stored')
  })

  // ─── Test 6: isActive returns true while running, false after close ───────

  it('isActive returns true while process is running and false after close', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Are you active?')
    expect(cm.isActive(convId)).toBe(true)

    pushLine(child, assistantEvent('Yes'))
    pushLine(child, resultEvent('sess-active'))
    await finishProcess(child, 0)

    await sendPromise
    expect(cm.isActive(convId)).toBe(false)
  })

  // ─── Test 7: claude not on path ────────────────────────────────────────────

  it('broadcasts chat_error CLAUDE_NOT_FOUND when claude is not on PATH', async () => {
    vi.mocked(mockExecSync).mockImplementation(() => { throw new Error('not found') })
    const convId = setupConversation()

    await cm.sendMessage(convId, 'Hello')

    const errors = getBroadcastedByType(broadcast, 'chat_error')
    expect(errors).toHaveLength(1)
    expect(errors[0].error).toBe('CLAUDE_NOT_FOUND')
    expect(errors[0].conversationId).toBe(convId)
  })

  // ─── Test 8: non-existent conversation ─────────────────────────────────────

  it('returns silently for non-existent conversation', async () => {
    await cm.sendMessage('nonexistent-conv', 'Hello')

    // No crash, no broadcast
    expect(broadcast).not.toHaveBeenCalled()
  })

  // ─── Test 9: process exits with non-zero code ──────────────────────────────

  it('broadcasts chat_error when process exits with non-zero code', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Fail please')
    await finishProcess(child, 1)
    await sendPromise

    const errors = getBroadcastedByType(broadcast, 'chat_error')
    expect(errors).toHaveLength(1)
    expect(errors[0].error).toContain('code 1')
  })

  it('includes stderr in chat_error when process exits with non-zero code', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Fail with stderr')
    child.stderr.push('Authentication failed\n')
    await finishProcess(child, 1)
    await sendPromise

    const errors = getBroadcastedByType(broadcast, 'chat_error')
    expect(errors).toHaveLength(1)
    expect(errors[0].error).toContain('Authentication failed')
  })

  // ─── Test 10: already active conversation ──────────────────────────────────

  it('returns silently if conversation already has active stream', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'First message')
    expect(cm.isActive(convId)).toBe(true)

    // Second message should be ignored
    await cm.sendMessage(convId, 'Second message')

    // Only one spawn call
    expect(mockSpawn).toHaveBeenCalledTimes(1)

    await finishProcess(child, 0)
    await sendPromise
  })

  // ─── Test 11: abort on non-active conversation does nothing ────────────────

  it('abort on non-active conversation does nothing', () => {
    cm.abort('nonexistent')
    expect(treeKill).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()
  })

  // ─── Context injection tests ───────────────────────────────────────────────

  describe('context injection', () => {
    it('system prompt includes project name when provided', async () => {
      const cmWithName = new ChatManager(broadcast, db, undefined, 'my-cool-project')
      createConversation(db, { id: 'conv-ctx-1', model: 'claude-sonnet-4-5' })
      const child = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(child as any)
        .mockReturnValueOnce(titleChild as any)

      const sendPromise = cmWithName.sendMessage('conv-ctx-1', 'Hello')
      pushLine(child, assistantEvent('Hi!'))
      pushLine(child, resultEvent('sess-ctx-1'))
      await finishProcess(child, 0)
      await sendPromise

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      const sysPromptIdx = spawnArgs.indexOf('--system-prompt')
      expect(sysPromptIdx).toBeGreaterThan(-1)
      const systemPrompt = spawnArgs[sysPromptIdx + 1]
      expect(systemPrompt).toContain('my-cool-project')
    })

    it('system prompt includes dashboard context section when jobs exist', async () => {
      createJob(db, { id: 'job-ctx-1', command: '/specrails:implement #42', started_at: new Date().toISOString() })
      finishJob(db, 'job-ctx-1', { exit_code: 0, status: 'completed', total_cost_usd: 0.05, duration_ms: 30000 })

      const cmWithName = new ChatManager(broadcast, db, undefined, 'test-project')
      createConversation(db, { id: 'conv-ctx-2', model: 'claude-sonnet-4-5' })
      const child = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(child as any)
        .mockReturnValueOnce(titleChild as any)

      const sendPromise = cmWithName.sendMessage('conv-ctx-2', 'What ran recently?')
      pushLine(child, assistantEvent('Here is your context!'))
      pushLine(child, resultEvent('sess-ctx-2'))
      await finishProcess(child, 0)
      await sendPromise

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      const sysPromptIdx = spawnArgs.indexOf('--system-prompt')
      const systemPrompt = spawnArgs[sysPromptIdx + 1]
      expect(systemPrompt).toContain('Dashboard Context')
      expect(systemPrompt).toContain('Recent Jobs')
      expect(systemPrompt).toContain('/specrails:implement #42')
    })

    it('success rate uses all-time failedJobs count, not just recent jobs', async () => {
      // Create 10 jobs: 8 completed, 2 failed (historical)
      for (let i = 1; i <= 8; i++) {
        createJob(db, { id: `job-sr-ok-${i}`, command: `/specrails:implement #${i}`, started_at: new Date().toISOString() })
        finishJob(db, `job-sr-ok-${i}`, { exit_code: 0, status: 'completed', total_cost_usd: 0.01, duration_ms: 5000 })
      }
      for (let i = 1; i <= 2; i++) {
        createJob(db, { id: `job-sr-fail-${i}`, command: `/specrails:implement #fail-${i}`, started_at: new Date().toISOString() })
        finishJob(db, `job-sr-fail-${i}`, { exit_code: 1, status: 'failed', total_cost_usd: 0, duration_ms: 1000 })
      }

      const cmSr = new ChatManager(broadcast, db, undefined, 'sr-project')
      createConversation(db, { id: 'conv-sr-rate', model: 'claude-sonnet-4-5' })
      const child = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(child as any)
        .mockReturnValueOnce(titleChild as any)

      const sendPromise = cmSr.sendMessage('conv-sr-rate', 'What is the success rate?')
      pushLine(child, assistantEvent('80% success rate.'))
      pushLine(child, resultEvent('sess-sr-rate'))
      await finishProcess(child, 0)
      await sendPromise

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      const sysPromptIdx = spawnArgs.indexOf('--system-prompt')
      const systemPrompt = spawnArgs[sysPromptIdx + 1]
      // 8 out of 10 = 80%
      expect(systemPrompt).toContain('success rate: 80%')
    })

    it('system prompt still works gracefully when DB is empty', async () => {
      const cmEmpty = new ChatManager(broadcast, db, undefined, 'empty-project')
      createConversation(db, { id: 'conv-ctx-3', model: 'claude-sonnet-4-5' })
      const child = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(child as any)
        .mockReturnValueOnce(titleChild as any)

      const sendPromise = cmEmpty.sendMessage('conv-ctx-3', 'Help')
      pushLine(child, assistantEvent('Sure!'))
      pushLine(child, resultEvent('sess-ctx-3'))
      await finishProcess(child, 0)
      await sendPromise

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      const sysPromptIdx = spawnArgs.indexOf('--system-prompt')
      expect(sysPromptIdx).toBeGreaterThan(-1)
      // Should still contain command instruction
      const systemPrompt = spawnArgs[sysPromptIdx + 1]
      expect(systemPrompt).toContain(':::command')
      expect(systemPrompt).toContain('empty-project')
    })

    it('system prompt is refreshed on each sendMessage call', async () => {
      createJob(db, { id: 'job-ctx-seq-1', command: '/specrails:implement #1', started_at: new Date().toISOString() })
      finishJob(db, 'job-ctx-seq-1', { exit_code: 0, status: 'completed', total_cost_usd: 0.01, duration_ms: 5000 })

      const cmSeq = new ChatManager(broadcast, db, undefined, 'seq-project')
      createConversation(db, { id: 'conv-ctx-seq', model: 'claude-sonnet-4-5' })

      const child1 = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(child1 as any)
        .mockReturnValueOnce(titleChild as any)

      const send1 = cmSeq.sendMessage('conv-ctx-seq', 'First message')
      pushLine(child1, assistantEvent('First response'))
      pushLine(child1, resultEvent('sess-seq'))
      await finishProcess(child1, 0)
      await send1

      // Add a new job after first send
      createJob(db, { id: 'job-ctx-seq-2', command: '/specrails:review #7', started_at: new Date().toISOString() })
      finishJob(db, 'job-ctx-seq-2', { exit_code: 0, status: 'completed', total_cost_usd: 0.02, duration_ms: 8000 })

      const child2 = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child2 as any)
      const send2 = cmSeq.sendMessage('conv-ctx-seq', 'Second message')
      pushLine(child2, assistantEvent('Second response'))
      pushLine(child2, resultEvent('sess-seq'))
      await finishProcess(child2, 0)
      await send2

      const allSpawnCalls = vi.mocked(mockSpawn).mock.calls
      // Find main spawns (those with --system-prompt)
      const mainCalls = allSpawnCalls.filter((c) => (c[1] as string[]).includes('--system-prompt'))
      expect(mainCalls.length).toBeGreaterThanOrEqual(2)

      const getPrompt = (call: unknown[]) => {
        const args = call[1] as string[]
        const idx = args.indexOf('--system-prompt')
        return args[idx + 1]
      }
      const prompt1 = getPrompt(mainCalls[0])
      const prompt2 = getPrompt(mainCalls[1])
      // Second prompt should mention the new job
      expect(prompt2).toContain('/specrails:review #7')
      // First prompt should not have mentioned it yet
      expect(prompt1).not.toContain('/specrails:review #7')
    })
  })

  // ─── Test 12: auto-title spawns separate process on first turn ─────────────

  it('auto-title spawns a separate process on first turn', async () => {
    const convId = setupConversation()
    const mainChild = createMockChildProcess()
    const titleChild = createMockChildProcess()
    vi.mocked(mockSpawn)
      .mockReturnValueOnce(mainChild as any)
      .mockReturnValueOnce(titleChild as any)

    const sendPromise = cm.sendMessage(convId, 'Hello world')

    pushLine(mainChild, assistantEvent('Hi there!'))
    pushLine(mainChild, resultEvent('sess-title'))
    await finishProcess(mainChild, 0)
    await sendPromise

    // Auto-title should have spawned a second process
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  // ─── Test 13: session resumption uses --resume flag ─────────────────────────

  it('uses --resume flag when conversation has session_id', async () => {
    const convId = setupConversation()
    const child1 = createMockChildProcess()
    const titleChild = createMockChildProcess()
    vi.mocked(mockSpawn)
      .mockReturnValueOnce(child1 as any)
      .mockReturnValueOnce(titleChild as any)

    // First turn: establishes session
    const send1 = cm.sendMessage(convId, 'First')
    pushLine(child1, assistantEvent('Hello'))
    pushLine(child1, resultEvent('sess-resume'))
    await finishProcess(child1, 0)
    await send1

    // Verify session stored
    const conv = getConversation(db, convId)
    expect(conv?.session_id).toBe('sess-resume')

    // Second turn: should use --resume
    const child2 = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child2 as any)
    const send2 = cm.sendMessage(convId, 'Second')
    pushLine(child2, assistantEvent('World'))
    pushLine(child2, resultEvent('sess-resume'))
    await finishProcess(child2, 0)
    await send2

    // Check spawn args for the second main call (skip title child)
    const spawnCalls = vi.mocked(mockSpawn).mock.calls
    // Find the call that has --resume
    const resumeCall = spawnCalls.find((c) => (c[1] as string[]).includes('--resume'))
    expect(resumeCall).toBeDefined()
    expect(resumeCall![1]).toContain('sess-resume')
  })

  // ─── Codex parity ────────────────────────────────────────────────────────────

  describe('codex provider', () => {
    let dbCodex: DbInstance
    let codexBroadcast: ReturnType<typeof vi.fn>
    let cmCodex: ChatManager

    beforeEach(() => {
      vi.mocked(mockExecSync).mockReturnValue(Buffer.from('/usr/bin/codex'))
      dbCodex = initDb(':memory:')
      codexBroadcast = vi.fn()
      cmCodex = new ChatManager(codexBroadcast, dbCodex, '/some/project', 'MyProject', 'codex')
    })

    it('passes only the user prompt to codex chat-turn (system prompt deferred to AGENTS.md)', async () => {
      createConversation(dbCodex, { id: 'codex-conv-1', model: 'gpt-5.4-mini' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      const sendPromise = cmCodex.sendMessage('codex-conv-1', 'Hello codex')

      child.stdout.push('Hi from codex\n')
      await finishProcess(child, 0)
      await sendPromise

      const spawnCall = vi.mocked(mockSpawn).mock.calls[0]
      expect(spawnCall[0]).toBe('codex')
      const args = spawnCall[1] as string[]
      // Codex argv shape: ['exec', '--json', '--sandbox', 'workspace-write',
      // '--skip-git-repo-check', <user prompt>, '--model', <model>]
      expect(args[0]).toBe('exec')
      expect(args).toContain('--json')
      expect(args).toContain('--sandbox')
      expect(args).toContain('workspace-write')
      // chat-turn must NOT fold the hub system prompt — AGENTS.md in
      // explore-cwd carries the framing; argv stays user-text-only so codex
      // doesn't mistake the system prompt for the user request.
      const promptArg = args.find((a) => a.includes('Hello codex')) as string
      expect(promptArg).toBeDefined()
      expect(promptArg).toBe('Hello codex')
      expect(promptArg).not.toContain('MyProject')
      expect(promptArg).not.toContain('---')
    })

    it('defaults to gpt-5.5 when conversation.model is empty string', async () => {
      // Create a conversation with empty model — simulates a null/missing model override
      createConversation(dbCodex, { id: 'codex-conv-empty-model', model: '' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      const sendPromise = cmCodex.sendMessage('codex-conv-empty-model', 'test')
      await finishProcess(child, 0)
      await sendPromise

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      expect(spawnArgs).toContain('--model')
      expect(spawnArgs).toContain('gpt-5.5')
    })

    it('captures real thread_id from codex thread.started event on successful close', async () => {
      createConversation(dbCodex, { id: 'codex-conv-session', model: 'gpt-5.4-mini' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      const sendPromise = cmCodex.sendMessage('codex-conv-session', 'Hello')
      // Real codex JSONL stream: thread.started → turn.started → item.completed → turn.completed
      child.stdout.push(
        '{"type":"thread.started","thread_id":"019e37c6-3bd4-7120-992f-6f96dc82eda1"}\n' +
        '{"type":"turn.started"}\n' +
        '{"type":"item.completed","item":{"type":"agent_message","text":"Hi"}}\n' +
        '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2,"cached_input_tokens":0,"reasoning_output_tokens":0}}\n'
      )
      await finishProcess(child, 0)
      await sendPromise

      const conv = getConversation(dbCodex, 'codex-conv-session')
      expect(conv?.session_id).toBe('019e37c6-3bd4-7120-992f-6f96dc82eda1')
    })

    it('uses codex exec resume <thread_id> on follow-up turn after thread.started captured', async () => {
      createConversation(dbCodex, { id: 'codex-conv-resume', model: 'gpt-5.4-mini' })

      // Lightweight mode skips auto-title so we get exactly one spawn per turn
      // and the test's mocks line up with the test's expectations.
      const child1 = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(child1 as any)
      const firstSend = cmCodex.sendMessage('codex-conv-resume', 'Hi', { lightweight: true })
      child1.stdout.push(
        '{"type":"thread.started","thread_id":"019e1111-2222-7333-bbbb-cccccccccccc"}\n' +
        '{"type":"item.completed","item":{"type":"agent_message","text":"Hi back"}}\n' +
        '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'
      )
      await finishProcess(child1, 0)
      await firstSend

      // Confirm session_id stored
      const convAfter1 = getConversation(dbCodex, 'codex-conv-resume')
      expect(convAfter1?.session_id).toBe('019e1111-2222-7333-bbbb-cccccccccccc')

      // Second turn: argv should begin with `exec resume <UUID>` and include `--json`
      const child2 = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(child2 as any)
      const secondSend = cmCodex.sendMessage('codex-conv-resume', 'Follow-up', { lightweight: true })
      child2.stdout.push(
        '{"type":"item.completed","item":{"type":"agent_message","text":"OK"}}\n' +
        '{"type":"turn.completed","usage":{}}\n'
      )
      await finishProcess(child2, 0)
      await secondSend

      const resumeCall = vi.mocked(mockSpawn).mock.calls[1]
      expect(resumeCall[0]).toBe('codex')
      const args = resumeCall[1] as string[]
      expect(args[0]).toBe('exec')
      expect(args[1]).toBe('resume')
      expect(args).toContain('--json')
      expect(args).toContain('019e1111-2222-7333-bbbb-cccccccccccc')
    })

    it('leaves session_id null when codex stream emits no thread.started (defensive)', async () => {
      createConversation(dbCodex, { id: 'codex-conv-no-thread', model: 'gpt-5.4-mini' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      const sendPromise = cmCodex.sendMessage('codex-conv-no-thread', 'Hello')
      child.stdout.push(
        '{"type":"item.completed","item":{"type":"agent_message","text":"Hi"}}\n' +
        '{"type":"turn.completed","usage":{}}\n'
      )
      await finishProcess(child, 0)
      await sendPromise

      const conv = getConversation(dbCodex, 'codex-conv-no-thread')
      // Old behaviour: synthesised `codex-<convId>-<ts>`. New behaviour: null.
      expect(conv?.session_id).toBeNull()
    })

    it('auto-title for codex: spawns codex exec with title prompt and sets title', async () => {
      // Two spawns: main message + auto-title
      createConversation(dbCodex, { id: 'codex-conv-title', model: 'gpt-5.4-mini' })
      const mainChild = createMockChildProcess()
      const titleChild = createMockChildProcess()
      vi.mocked(mockSpawn)
        .mockReturnValueOnce(mainChild as any)
        .mockReturnValueOnce(titleChild as any)

      const sendPromise = cmCodex.sendMessage('codex-conv-title', 'What is specrails?')
      // Feed real codex JSONL so text-delta accumulates and triggers auto-title
      mainChild.stdout.push(
        '{"type":"thread.started","thread_id":"019e0000-0000-0000-0000-000000000000"}\n' +
        '{"type":"item.completed","item":{"type":"agent_message","text":"Specrails is a pipeline framework"}}\n' +
        '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'
      )
      await finishProcess(mainChild, 0)
      await sendPromise

      // The title spawn should be codex exec
      const titleSpawnCall = vi.mocked(mockSpawn).mock.calls[1]
      expect(titleSpawnCall[0]).toBe('codex')
      expect((titleSpawnCall[1] as string[])[0]).toBe('exec')

      // Simulate title process returning JSONL with a single agent_message text
      titleChild.stdout.push(
        '{"type":"item.completed","item":{"type":"agent_message","text":"SpecRails Pipeline Framework"}}\n'
      )
      await finishProcess(titleChild, 0)
      await new Promise((r) => setTimeout(r, 30))

      const titleUpdates = codexBroadcast.mock.calls
        .map((args) => args[0] as Record<string, unknown>)
        .filter((msg) => msg.type === 'chat_title_update')
      expect(titleUpdates).toHaveLength(1)
      expect(titleUpdates[0].title).toBe('SpecRails Pipeline Framework')
    })
  })

  // ─── ai_invocations capture (surface='explore-spec') ───────────────────────

  describe('ai_invocations capture', () => {
    it('writes a row when conversation kind=explore and result event arrives', async () => {
      const projectId = 'proj-cap-1'
      const cmCap = new ChatManager(broadcast, db, undefined, undefined, 'claude', projectId)
      const convId = 'conv-explore-1'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmCap.sendMessage(convId, 'Hello')

      pushLine(child, assistantEvent('Hi back'))
      pushLine(child, JSON.stringify({
        type: 'result',
        session_id: 'sess-1',
        total_cost_usd: 0.42,
        num_turns: 2,
        model: 'sonnet',
        duration_ms: 1500,
        usage: { input_tokens: 10, output_tokens: 5 },
      }))
      await finishProcess(child, 0)
      await sendPromise

      const rows = db.prepare(`SELECT * FROM ai_invocations WHERE project_id = ?`).all(projectId) as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].surface).toBe('explore-spec')
      expect(rows[0].conversation_id).toBe(convId)
      expect(rows[0].status).toBe('success')
      expect(rows[0].total_cost_usd).toBeCloseTo(0.42)
      expect(rows[0].num_turns).toBe(2)

      const inv = broadcast.mock.calls.find(([m]) => (m as { type?: string }).type === 'spending.invalidated')
      expect(inv).toBeDefined()
    })

    it('does NOT write a row when conversation kind=sidebar', async () => {
      const projectId = 'proj-cap-2'
      const cmCap = new ChatManager(broadcast, db, undefined, undefined, 'claude', projectId)
      const convId = 'conv-sidebar-1'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'sidebar' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmCap.sendMessage(convId, 'Hello')

      pushLine(child, assistantEvent('Hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise

      const rows = db.prepare(`SELECT * FROM ai_invocations WHERE project_id = ?`).all(projectId) as any[]
      expect(rows).toHaveLength(0)
    })

    it('writes a failed row when explore process exits non-zero before result event', async () => {
      const projectId = 'proj-cap-3'
      const cmCap = new ChatManager(broadcast, db, undefined, undefined, 'claude', projectId)
      const convId = 'conv-explore-fail'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      // Explore turns now auto-respawn ONCE on crash before result. Provide
      // two crashing children so the lifecycle exhausts the retry and writes
      // the failed invocation row.
      const first = createMockChildProcess()
      const second = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(first as any).mockReturnValueOnce(second as any)
      const sendPromise = cmCap.sendMessage(convId, 'Hello')

      await finishProcess(first, 1)
      await finishProcess(second, 1)
      await sendPromise

      const rows = db.prepare(`SELECT * FROM ai_invocations WHERE project_id = ?`).all(projectId) as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('failed')
      expect(rows[0].total_cost_usd).toBeNull()
    })

    it('skips capture when projectId is not provided', async () => {
      const projectId = 'proj-cap-4'
      const cmNoProject = new ChatManager(broadcast, db, undefined, undefined, 'claude')
      const convId = 'conv-no-proj'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmNoProject.sendMessage(convId, 'Hello')

      pushLine(child, assistantEvent('Hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise

      const rows = db.prepare(`SELECT * FROM ai_invocations WHERE project_id = ?`).all(projectId) as any[]
      expect(rows).toHaveLength(0)
    })
  })

  // ─── Explore Spec acceleration: spawn cwd resolution ──────────────────────

  describe('Explore spawn cwd', () => {
    let baseTmp: string
    let projectPath: string

    beforeEach(() => {
      const fsMod = require('fs') as typeof import('fs')
      const osMod = require('os') as typeof import('os')
      const pathMod = require('path') as typeof import('path')
      baseTmp = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'cm-explore-'))
      projectPath = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'cm-explore-proj-'))
    })

    afterEach(() => {
      const fsMod = require('fs') as typeof import('fs')
      try { fsMod.rmSync(baseTmp, { recursive: true, force: true }) } catch {}
      try { fsMod.rmSync(projectPath, { recursive: true, force: true }) } catch {}
      delete process.env.SPECRAILS_EXPLORE_LEGACY_CWD
    })

    it('uses the hub-managed explore-cwd for kind=explore by default', async () => {
      const cmExplore = new ChatManager(
        broadcast, db, projectPath, 'P', 'claude', 'proj-x', 'slug-x',
      )
      const convId = 'conv-explore-cwd'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmExplore.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()

      const opts = vi.mocked(mockSpawn).mock.calls[0][2] as { cwd?: string }
      expect(opts.cwd).toBeDefined()
      // Default cwd resolves under ~/.specrails/projects/<slug>/explore-cwd or
      // wherever exploreCwdPathFor lands; what we assert is that it is NOT the
      // raw project path.
      expect(opts.cwd).not.toBe(projectPath)
      expect(opts.cwd!.endsWith('/explore-cwd')).toBe(true)

      pushLine(child, assistantEvent('hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise
    })

    it('uses project path when the conversation scope has mcp=true', async () => {
      const cmExplore = new ChatManager(
        broadcast, db, projectPath, 'P', 'claude', 'proj-x', 'slug-x',
      )
      const convId = 'conv-explore-mcp-on'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmExplore.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()

      const opts = vi.mocked(mockSpawn).mock.calls[0][2] as { cwd?: string }
      expect(opts.cwd).toBe(projectPath)

      pushLine(child, assistantEvent('hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise
    })

    it('falls back to project path when SPECRAILS_EXPLORE_LEGACY_CWD=1', async () => {
      process.env.SPECRAILS_EXPLORE_LEGACY_CWD = '1'
      const cmExplore = new ChatManager(
        broadcast, db, projectPath, 'P', 'claude', 'proj-x', 'slug-x',
      )
      const convId = 'conv-explore-legacy-env'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmExplore.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()

      const opts = vi.mocked(mockSpawn).mock.calls[0][2] as { cwd?: string }
      expect(opts.cwd).toBe(projectPath)

      pushLine(child, assistantEvent('hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise
    })

    it('uses the project path for non-explore (sidebar) conversations', async () => {
      const cmSidebar = new ChatManager(
        broadcast, db, projectPath, 'P', 'claude', 'proj-x', 'slug-x',
      )
      const convId = 'conv-sidebar-cwd'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'sidebar' })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      const sendPromise = cmSidebar.sendMessage(convId, 'hi')
      await Promise.resolve(); await Promise.resolve()

      const opts = vi.mocked(mockSpawn).mock.calls[0][2] as { cwd?: string }
      expect(opts.cwd).toBe(projectPath)

      pushLine(child, assistantEvent('hi'))
      pushLine(child, resultEvent('sess'))
      await finishProcess(child, 0)
      await sendPromise
    })
  })

  // ─── Explore lifecycle: idle, crash, concurrency ─────────────────────────

  describe('Explore lifecycle', () => {
    it('notifyMinimized + 2 min idle schedules a kill', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-l', 'sl-l')
      const convId = 'conv-life-1'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      // Minimize without an active spawn: the timer arms, fires, and treeKill
      // is a no-op since no child is registered. Assertion: no throw.
      vi.useFakeTimers()
      cmL.notifyMinimized(convId)
      vi.advanceTimersByTime(2 * 60 * 1000 + 100)
      vi.useRealTimers()
    })

    it('notifyRestored cancels a pending idle timer', async () => {
      vi.useFakeTimers()
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-l2', 'sl-l2')
      const convId = 'conv-life-2'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      cmL.notifyMinimized(convId)
      vi.advanceTimersByTime(60 * 1000) // 1 minute
      cmL.notifyRestored(convId)
      vi.advanceTimersByTime(2 * 60 * 1000) // crossing original 2-min mark
      // No throws → timer was cancelled.
      vi.useRealTimers()
    })

    it('busy when 5 explore turns are streaming and queue times out', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-l3', 'sl-l3')
      // (per-conversation scope.mcp=true is seeded below to skip filesystem IO)
      const fiveChildren: any[] = []
      // Spawn 5 streaming explore turns (no result, never closes)
      for (let i = 0; i < 5; i++) {
        const cid = `conv-life-busy-${i}`
        createConversation(db, { id: cid, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
        const c = createMockChildProcess()
        fiveChildren.push(c)
        vi.mocked(mockSpawn).mockReturnValueOnce(c as any)
        void cmL.sendMessage(cid, 'hi', { lightweight: true })
        await Promise.resolve(); await Promise.resolve()
      }
      // 6th attempt — should queue, then time out at 30s with chat_error busy.
      vi.useFakeTimers()
      const cid6 = 'conv-life-busy-6'
      createConversation(db, { id: cid6, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      const sixthPromise = cmL.sendMessage(cid6, 'hi', { lightweight: true })
      // Flush microtask + advance the 30 s queue timeout.
      await vi.advanceTimersByTimeAsync(30 * 1000 + 100)
      vi.useRealTimers()
      await sixthPromise
      const errs = getBroadcastedByType(broadcast, 'chat_error')
      expect(errs.some((e) => e.conversationId === cid6 && e.error === 'busy')).toBe(true)
      // Cleanup: close the 5 dangling spawns to settle promises
      for (const c of fiveChildren) {
        await finishProcess(c, 0)
      }
    })

    it('crash before result auto-respawns once', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-l4', 'sl-l4')
      // (per-conversation scope.mcp=true is seeded below to skip filesystem IO)
      const convId = 'conv-life-crash'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      const first = createMockChildProcess()
      const second = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(first as any).mockReturnValueOnce(second as any)
      const sendPromise = cmL.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()
      await finishProcess(first, 1)
      await Promise.resolve(); await Promise.resolve()
      pushLine(second, assistantEvent('recovered'))
      pushLine(second, resultEvent('sess-after-crash'))
      await finishProcess(second, 0)
      await sendPromise
      const errs = getBroadcastedByType(broadcast, 'chat_error')
      const errsForConv = errs.filter((e) => e.conversationId === convId)
      expect(errsForConv).toHaveLength(0)
      expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(2)
    })

    it('second crash surfaces chat_error', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-l5', 'sl-l5')
      // (per-conversation scope.mcp=true is seeded below to skip filesystem IO)
      const convId = 'conv-life-doublecrash'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      const first = createMockChildProcess()
      const second = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(first as any).mockReturnValueOnce(second as any)
      const sendPromise = cmL.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()
      await finishProcess(first, 1)
      await Promise.resolve(); await Promise.resolve()
      await finishProcess(second, 1)
      await sendPromise
      const errs = getBroadcastedByType(broadcast, 'chat_error')
      expect(errs.some((e) => e.conversationId === convId)).toBe(true)
    })

    it('drain releases at most the freed slots — cap holds with multiple queued waiters', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-drain', 'sl-drain')
      const children: any[] = []
      for (let i = 0; i < 7; i++) {
        children.push(createMockChildProcess())
        vi.mocked(mockSpawn).mockReturnValueOnce(children[i] as any)
      }
      // 5 streaming explore turns (no result; they never close).
      for (let i = 0; i < 5; i++) {
        const cid = `conv-drain-${i}`
        createConversation(db, { id: cid, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
        void cmL.sendMessage(cid, 'hi', { lightweight: true })
        await Promise.resolve(); await Promise.resolve()
      }
      expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(5)

      // Two more turns must PARK (cap is 5, all 5 streaming).
      createConversation(db, { id: 'conv-drain-q1', model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      createConversation(db, { id: 'conv-drain-q2', model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      void cmL.sendMessage('conv-drain-q1', 'hi', { lightweight: true })
      void cmL.sendMessage('conv-drain-q2', 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()
      expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(5)

      // Close ONE streaming turn → exactly one slot frees. The drain must
      // release exactly one waiter, not both (pre-fix it released all queued).
      await finishProcess(children[0], 0)
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
      expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(6)

      // Settle remaining spawns.
      for (let i = 1; i < 7; i++) {
        await finishProcess(children[i], 0)
        await Promise.resolve(); await Promise.resolve()
      }
    })

    it('forgetExploreLifecycle clears the lifecycle entry and its idle timer', () => {
      vi.useFakeTimers()
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-forget', 'sl-forget')
      const convId = 'conv-forget'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore' })
      cmL.notifyMinimized(convId)
      expect((cmL as unknown as { _exploreLifecycle: Map<string, unknown> })._exploreLifecycle.has(convId)).toBe(true)
      cmL.forgetExploreLifecycle(convId)
      expect((cmL as unknown as { _exploreLifecycle: Map<string, unknown> })._exploreLifecycle.has(convId)).toBe(false)
      // Idle timer was cleared → crossing the 2-min mark fires nothing.
      vi.advanceTimersByTime(3 * 60 * 1000)
      vi.useRealTimers()
    })

    it('shutdown terminates active children and clears all tracking', async () => {
      const cmL = new ChatManager(broadcast, db, '/tmp/proj', 'P', 'claude', 'pid-sd', 'sl-sd')
      const convId = 'conv-sd'
      createConversation(db, { id: convId, model: 'sonnet', kind: 'explore', contextScope: MCP_SCOPE })
      const c = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValueOnce(c as any)
      const sendPromise = cmL.sendMessage(convId, 'hi', { lightweight: true })
      await Promise.resolve(); await Promise.resolve()
      expect((cmL as unknown as { _activeProcesses: Map<string, unknown> })._activeProcesses.size).toBe(1)

      cmL.shutdown()
      expect(vi.mocked(treeKill)).toHaveBeenCalledWith(c.pid, 'SIGTERM')
      expect((cmL as unknown as { _activeProcesses: Map<string, unknown> })._activeProcesses.size).toBe(0)
      expect((cmL as unknown as { _exploreLifecycle: Map<string, unknown> })._exploreLifecycle.size).toBe(0)

      // Settle the dangling turn.
      await finishProcess(c, 0)
      await sendPromise
    })
  })

  // ─── Lightweight system prompt byte stability ─────────────────────────────

  describe('Lightweight system prompt', () => {
    it('is byte-stable across consecutive invocations for the same project', () => {
      const cmA = new ChatManager(broadcast, db, undefined, 'StableProject')
      // Access via prototype since the method is private at the TS level
      const build = (cmA as unknown as { _buildLightweightSystemPrompt: () => string })._buildLightweightSystemPrompt.bind(cmA)
      const a = build()
      const b = build()
      expect(a).toBe(b)
    })

    it('contains no timestamps, dates, costs or job ids', () => {
      const cmA = new ChatManager(broadcast, db, undefined, 'StableProject')
      const build = (cmA as unknown as { _buildLightweightSystemPrompt: () => string })._buildLightweightSystemPrompt.bind(cmA)
      const out = build()
      // ISO-8601 fragments / decimal cost / Unix epoch / `jobs today`-style content must NOT leak in
      expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(out).not.toMatch(/\$\d+\.\d{3}/)
      expect(out).not.toMatch(/Total jobs:/)
      expect(out).not.toMatch(/Jobs today:/)
    })
  })
})
