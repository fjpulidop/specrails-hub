import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

// Mock child_process before importing
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('tree-kill', () => ({
  default: vi.fn(),
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('# Setup prompt content'),
  }
})

// Default: claude is detected. Override per-test for Codex paths.
vi.mock('./core-compat', () => ({
  findCoreContract: vi.fn().mockResolvedValue(null),
  detectCLISync: vi.fn().mockReturnValue('claude'),
}))

import { spawn as mockSpawn } from 'child_process'
import treeKill from 'tree-kill'
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'fs'
import { detectCLISync } from './core-compat'
import { SetupManager, CHECKPOINTS } from './setup-manager'

function createMockChildProcess() {
  const child = new EventEmitter() as any
  child.stdout = new Readable({ read() {} })
  child.stderr = new Readable({ read() {} })
  child.pid = 55000
  child.kill = vi.fn()
  return child
}

function pushLine(child: any, line: string) {
  child.stdout.push(line + '\n')
}

function finishProcess(child: any, code: number): Promise<void> {
  return new Promise((resolve) => {
    child.stdout.push(null)
    child.stderr.push(null)
    setImmediate(() => {
      child.emit('close', code)
      resolve()
    })
  })
}

function getBroadcastedByType(broadcast: ReturnType<typeof vi.fn>, type: string) {
  return broadcast.mock.calls
    .map((args) => args[0] as Record<string, unknown>)
    .filter((msg) => msg.type === type)
}

describe('SetupManager', () => {
  let sm: SetupManager
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    broadcast = vi.fn()
    sm = new SetupManager(broadcast)

    // Default: existsSync returns false, readdirSync returns []
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readdirSync).mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Constants ──────────────────────────────────────────────────────────────

  describe('CHECKPOINTS', () => {
    it('has 7 checkpoint definitions', () => {
      expect(CHECKPOINTS).toHaveLength(7)
    })

    it('contains expected checkpoint keys', () => {
      const keys = CHECKPOINTS.map((c) => c.key)
      expect(keys).toContain('base_install')
      expect(keys).toContain('repo_analysis')
      expect(keys).toContain('final_verification')
    })
  })

  // ─── State queries ─────────────────────────────────────────────────────────

  describe('isInstalling / isSettingUp', () => {
    it('returns false when no processes running', () => {
      expect(sm.isInstalling('p1')).toBe(false)
      expect(sm.isSettingUp('p1')).toBe(false)
    })

    it('returns true after starting install', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      sm.startInstall('p1', '/path/to/project')
      expect(sm.isInstalling('p1')).toBe(true)
    })

    it('returns true after starting setup', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      sm.startSetup('p1', '/path/to/project')
      expect(sm.isSettingUp('p1')).toBe(true)
    })
  })

  // ─── startInstall ──────────────────────────────────────────────────────────

  describe('startInstall', () => {
    it('spawns npx specrails-core init --yes --root-dir <projectPath>', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['specrails-core', 'init', '--yes', '--root-dir', '/path/to/project'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('broadcasts setup_log for stdout', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      pushLine(child, 'Installing specrails...')

      // Wait for readline to process
      await new Promise((r) => setImmediate(r))

      const logs = getBroadcastedByType(broadcast, 'setup_log')
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].line).toBe('Installing specrails...')
      expect(logs[0].stream).toBe('stdout')
    })

    it('broadcasts setup_install_done on exit 0', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      await finishProcess(child, 0)

      const done = getBroadcastedByType(broadcast, 'setup_install_done')
      expect(done).toHaveLength(1)
      expect(done[0].projectId).toBe('p1')
    })

    it('broadcasts setup_error on non-zero exit', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      await finishProcess(child, 1)

      const errors = getBroadcastedByType(broadcast, 'setup_error')
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toContain('code 1')
    })

    it('always passes --root-dir so install works outside a git repo', () => {
      // Regression test: without --root-dir, install.sh would fail with exit code 1
      // when the project path is not inside a git repo (REPO_ROOT empty → bash `read`
      // fails on closed stdin → set -e exits with code 1).
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/non-git/project')

      const [, spawnArgs] = vi.mocked(mockSpawn).mock.calls[0]
      expect(spawnArgs).toContain('--root-dir')
      expect(spawnArgs).toContain('/non-git/project')
    })

    it('does not start install twice for same project', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      sm.startInstall('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('clears install process on close', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      expect(sm.isInstalling('p1')).toBe(true)

      await finishProcess(child, 0)
      expect(sm.isInstalling('p1')).toBe(false)
    })
  })

  // ─── startSetup ────────────────────────────────────────────────────────────

  describe('startSetup', () => {
    it('spawns claude with correct args', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/setup', '--dangerously-skip-permissions']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('does not start setup twice', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')
      sm.startSetup('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('broadcasts setup_turn_done when claude exits 0 but setup incomplete', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      // No agents/commands exist → setup not complete
      vi.mocked(existsSync).mockReturnValue(false)

      sm.startSetup('p1', '/path/to/project')
      pushLine(child, JSON.stringify({ type: 'result', session_id: 'sess-123' }))
      await finishProcess(child, 0)

      const turnDone = getBroadcastedByType(broadcast, 'setup_turn_done')
      expect(turnDone).toHaveLength(1)
      expect(turnDone[0].sessionId).toBe('sess-123')
    })

    it('broadcasts setup_complete when claude exits 0 and artifacts exist', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      // Mock: agents and commands exist
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.claude/agents') || s.includes('.claude/commands/sr')
      })
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.includes('/agents') && !s.includes('personas')) return ['sr-developer.md'] as any
        if (s.includes('/commands/sr')) return ['implement.md'] as any
        return [] as any
      })

      sm.startSetup('p1', '/path/to/project')
      pushLine(child, JSON.stringify({ type: 'result', session_id: 'sess-456' }))
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0].summary).toBeDefined()
    })

    it('broadcasts setup_complete with .claude dir when provider is codex', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      // Mock: agents and commands exist under .claude/ (specrails always uses .claude)
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.claude/agents') || s.includes('.claude/commands/sr')
      })
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.includes('/agents') && !s.includes('personas')) return ['sr-developer.md'] as any
        if (s.includes('/commands/sr')) return ['implement.md'] as any
        return [] as any
      })

      sm.startSetup('p1', '/path/to/project', 'codex')
      // Codex outputs plain text, not JSON — push a plain text line
      pushLine(child, 'Setup complete')
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0].summary).toBeDefined()
    })

    it('broadcasts setup_error on non-zero exit', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')
      await finishProcess(child, 1)

      const errors = getBroadcastedByType(broadcast, 'setup_error')
      expect(errors).toHaveLength(1)
    })

    it('spawns codex with setup.md content when codex is the detected CLI', () => {
      vi.mocked(detectCLISync).mockReturnValue('codex')
      vi.mocked(readFileSync).mockReturnValue('# Full setup instructions')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      expect(readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude/commands/setup.md'),
        'utf-8'
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '# Full setup instructions'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('falls back to claude binary when no CLI is detected', () => {
      vi.mocked(detectCLISync).mockReturnValue(null)
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/setup']),
        expect.any(Object)
      )
    })

    it('uses explicit provider parameter over detectCLISync', () => {
      // detectCLISync returns claude (the default mock) but we pass 'codex' explicitly
      vi.mocked(detectCLISync).mockReturnValue('claude')
      vi.mocked(readFileSync).mockReturnValue('# Setup')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project', 'codex')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '# Setup'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
      // detectCLISync should not be called when provider is explicit
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('always pre-creates .claude directories regardless of provider', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project', 'codex')

      const mkdirCalls = vi.mocked(mkdirSync).mock.calls.map(([p]) => String(p))
      // specrails-core always installs to .claude/ — both providers use .claude
      expect(mkdirCalls.some((p) => p.includes('.claude/agents/personas'))).toBe(true)
      expect(mkdirCalls.some((p) => p.includes('.claude/commands/sr'))).toBe(true)
      expect(mkdirCalls.some((p) => p.includes('.claude/rules'))).toBe(true)
    })

    it('uses explicit claude provider even when codex is detected in PATH', () => {
      vi.mocked(detectCLISync).mockReturnValue('codex')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project', 'claude')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/setup']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('generates synthetic sessionId for codex and calls onSessionCaptured', () => {
      const onSessionCaptured = vi.fn()
      const smWithCallback = new SetupManager(broadcast, onSessionCaptured)
      vi.mocked(readFileSync).mockReturnValue('# Setup')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      smWithCallback.startSetup('p1', '/path/to/project', 'codex')

      expect(onSessionCaptured).toHaveBeenCalledWith('p1', expect.stringMatching(/^codex-p1-\d+$/))
    })

    it('emits setup_turn_done with synthetic sessionId for codex when setup is incomplete', async () => {
      vi.mocked(readFileSync).mockReturnValue('# Setup')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      // No artifacts exist — setup is incomplete
      vi.mocked(existsSync).mockReturnValue(false)

      sm.startSetup('p1', '/path/to/project', 'codex')
      await finishProcess(child, 0)

      const turnDone = getBroadcastedByType(broadcast, 'setup_turn_done')
      expect(turnDone).toHaveLength(1)
      expect(turnDone[0].sessionId).toMatch(/^codex-p1-\d+$/)
    })
  })

  // ─── resumeSetup ──────────────────────────────────────────────────────────

  describe('resumeSetup', () => {
    it('spawns claude with --resume and message', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeSetup('p1', '/path', 'sess-abc', 'continue please')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--resume', 'sess-abc', '-p', 'continue please']),
        expect.any(Object)
      )
    })

    it('does not resume if already running', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeSetup('p1', '/path', 'sess-1', 'msg1')
      sm.resumeSetup('p1', '/path', 'sess-2', 'msg2')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('uses explicit provider parameter for codex resume with continuation prompt', () => {
      vi.mocked(detectCLISync).mockReturnValue('claude')
      vi.mocked(readFileSync).mockReturnValue('# Setup prompt content')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeSetup('p1', '/path', 'sess-abc', 'continue please', 'codex')

      // Codex resume builds a continuation prompt from setup.md + user message
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', expect.stringContaining('continue please')],
        expect.any(Object)
      )
      // Should include setup.md content (mocked as '# Setup prompt content')
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      expect(spawnArgs[1]).toContain('# Setup prompt content')
      expect(spawnArgs[1]).toContain('continuation of a previous setup run')
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('falls back to plain user message when setup.md is missing for codex resume', () => {
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT') })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeSetup('p1', '/path', 'sess-abc', 'continue please', 'codex')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', 'continue please'],
        expect.any(Object)
      )
    })
  })

  // ─── getCheckpointStatus ───────────────────────────────────────────────────

  describe('getCheckpointStatus', () => {
    it('returns all-pending when setup has not started', () => {
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(7)
      expect(statuses.every((s) => s.status === 'pending')).toBe(true)
    })

    it('returns initialized checkpoints after startSetup', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(7)
    })
  })

  // ─── Checkpoint detection from stream ──────────────────────────────────────

  describe('checkpoint detection from stream events', () => {
    it('detects repo_analysis from assistant text', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Starting Phase 1: codebase analysis of your project' }] },
      })
      pushLine(child, event)

      // Allow readline to process
      await new Promise((r) => setImmediate(r))

      const checkpointMsgs = getBroadcastedByType(broadcast, 'setup_checkpoint')
      const repoAnalysis = checkpointMsgs.find((m) => m.checkpoint === 'repo_analysis')
      expect(repoAnalysis).toBeDefined()
      expect(repoAnalysis?.status).toBe('running')
    })

    it('detects agent_generation from tool_use event', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'tool_use',
        input: { file_path: '.claude/agents/sr-developer.md' },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const checkpointMsgs = getBroadcastedByType(broadcast, 'setup_checkpoint')
      const agentGen = checkpointMsgs.find((m) => m.checkpoint === 'agent_generation')
      expect(agentGen).toBeDefined()
    })
  })

  // ─── Abort ──────────────────────────────────────────────────────────────────

  describe('abort', () => {
    it('kills install process and clears state', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')
      sm.abort('p1')

      expect(treeKill).toHaveBeenCalledWith(child.pid, 'SIGTERM')
      expect(sm.isInstalling('p1')).toBe(false)
    })

    it('kills setup process and clears state', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')
      sm.abort('p1')

      expect(treeKill).toHaveBeenCalledWith(child.pid, 'SIGTERM')
      expect(sm.isSettingUp('p1')).toBe(false)
    })

    it('does nothing if no processes running', () => {
      expect(() => sm.abort('p1')).not.toThrow()
      expect(treeKill).not.toHaveBeenCalled()
    })
  })

  // ─── Stderr handling ───────────────────────────────────────────────────────

  describe('stderr handling', () => {
    it('broadcasts stderr as setup_log for install', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')

      // Push to stderr
      child.stderr.push('Warning: something\n')

      await new Promise((r) => setImmediate(r))

      const logs = getBroadcastedByType(broadcast, 'setup_log')
      const stderrLogs = logs.filter((l) => l.stream === 'stderr')
      expect(stderrLogs.length).toBeGreaterThan(0)
    })
  })

  // ─── Setup chat broadcast ──────────────────────────────────────────────────

  describe('setup chat broadcast', () => {
    it('broadcasts setup_chat for assistant text', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello from setup!' }] },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const chatMsgs = getBroadcastedByType(broadcast, 'setup_chat')
      expect(chatMsgs.length).toBeGreaterThan(0)
      expect(chatMsgs[0].text).toBe('Hello from setup!')
      expect(chatMsgs[0].role).toBe('assistant')
    })
  })
})
