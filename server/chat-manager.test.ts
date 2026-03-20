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

    const responseWithCommand = 'You should run:\n:::command\n/sr:implement #5\n:::\nThis will help.'
    pushLine(child, assistantEvent(responseWithCommand))
    pushLine(child, resultEvent('sess-xyz'))
    await finishProcess(child, 0)

    await sendPromise

    const proposalMsgs = getBroadcastedByType(broadcast, 'chat_command_proposal')
    expect(proposalMsgs).toHaveLength(1)
    expect(proposalMsgs[0].conversationId).toBe(convId)
    expect(proposalMsgs[0].command).toBe('/sr:implement #5')
  })

  // ─── Test 4: duplicate :::command blocks not emitted twice ────────────────

  it('duplicate :::command blocks in same response are not emitted twice', async () => {
    const convId = setupConversation()
    const child = createMockChildProcess()
    vi.mocked(mockSpawn).mockReturnValue(child as any)

    const sendPromise = cm.sendMessage(convId, 'Suggest something')

    // Emit the same command twice across two chunks (buffer accumulates)
    pushLine(child, assistantEvent(':::command\n/sr:implement #1\n:::'))
    pushLine(child, assistantEvent(' and again :::command\n/sr:implement #1\n:::'))
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
      createJob(db, { id: 'job-ctx-1', command: '/sr:implement #42', started_at: new Date().toISOString() })
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
      expect(systemPrompt).toContain('/sr:implement #42')
    })

    it('success rate uses all-time failedJobs count, not just recent jobs', async () => {
      // Create 10 jobs: 8 completed, 2 failed (historical)
      for (let i = 1; i <= 8; i++) {
        createJob(db, { id: `job-sr-ok-${i}`, command: `/sr:implement #${i}`, started_at: new Date().toISOString() })
        finishJob(db, `job-sr-ok-${i}`, { exit_code: 0, status: 'completed', total_cost_usd: 0.01, duration_ms: 5000 })
      }
      for (let i = 1; i <= 2; i++) {
        createJob(db, { id: `job-sr-fail-${i}`, command: `/sr:implement #fail-${i}`, started_at: new Date().toISOString() })
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
      createJob(db, { id: 'job-ctx-seq-1', command: '/sr:implement #1', started_at: new Date().toISOString() })
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
      createJob(db, { id: 'job-ctx-seq-2', command: '/sr:review #7', started_at: new Date().toISOString() })
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
      expect(prompt2).toContain('/sr:review #7')
      // First prompt should not have mentioned it yet
      expect(prompt1).not.toContain('/sr:review #7')
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
})
