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
    readFileSync: vi.fn().mockReturnValue('# Enrich prompt content'),
    writeFileSync: vi.fn(),
  }
})

// Default: claude is detected. Override per-test for Codex paths.
vi.mock('./core-compat', () => ({
  findCoreContract: vi.fn().mockResolvedValue(null),
  detectCLISync: vi.fn().mockReturnValue('claude'),
}))

import { spawn as mockSpawn } from 'child_process'
import treeKill from 'tree-kill'
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { detectCLISync } from './core-compat'
import { SetupManager, CHECKPOINTS, QUICK_CHECKPOINTS } from './setup-manager'

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

  describe('QUICK_CHECKPOINTS', () => {
    it('has 3 checkpoint definitions', () => {
      expect(QUICK_CHECKPOINTS).toHaveLength(3)
    })

    it('contains config_written, base_install, quick_complete keys', () => {
      const keys = QUICK_CHECKPOINTS.map((c) => c.key)
      expect(keys).toContain('config_written')
      expect(keys).toContain('base_install')
      expect(keys).toContain('quick_complete')
    })
  })

  // ─── State queries ─────────────────────────────────────────────────────────

  describe('isInstalling / isSettingUp / isEnriching', () => {
    it('returns false when no processes running', () => {
      expect(sm.isInstalling('p1')).toBe(false)
      expect(sm.isSettingUp('p1')).toBe(false)
      expect(sm.isEnriching('p1')).toBe(false)
    })

    it('returns true after starting install', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      sm.startInstall('p1', '/path/to/project')
      expect(sm.isInstalling('p1')).toBe(true)
    })

    it('returns true after startEnrich', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      sm.startEnrich('p1', '/path/to/project')
      expect(sm.isEnriching('p1')).toBe(true)
      expect(sm.isSettingUp('p1')).toBe(true) // backward compat alias
    })

    it('returns true after startSetup (deprecated alias)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      sm.startSetup('p1', '/path/to/project')
      expect(sm.isSettingUp('p1')).toBe(true)
    })
  })

  // ─── startInstall ──────────────────────────────────────────────────────────

  describe('startInstall', () => {
    it('spawns npx specrails-core@latest init --yes --root-dir <projectPath>', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startInstall('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['specrails-core@latest', 'init', '--yes', '--root-dir', '/path/to/project'],
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

  // ─── startEnrich ───────────────────────────────────────────────────────────

  describe('startEnrich', () => {
    it('spawns claude with /specrails:enrich args', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/specrails:enrich', '--dangerously-skip-permissions']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('uses /specrails:enrich --from-config when install-config.yaml exists', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('.specrails/install-config.yaml')
      )

      sm.startEnrich('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/specrails:enrich --from-config']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('does not start enrich twice', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      sm.startEnrich('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('deprecated startSetup alias delegates to startEnrich', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startSetup('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/specrails:enrich', '--dangerously-skip-permissions']),
        expect.any(Object)
      )
    })

    it('broadcasts setup_turn_done when claude exits 0 but artifacts incomplete', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockReturnValue(false)

      sm.startEnrich('p1', '/path/to/project')
      pushLine(child, JSON.stringify({ type: 'result', session_id: 'sess-123' }))
      await finishProcess(child, 0)

      const turnDone = getBroadcastedByType(broadcast, 'setup_turn_done')
      expect(turnDone).toHaveLength(1)
      expect(turnDone[0].sessionId).toBe('sess-123')
    })

    it('broadcasts setup_complete when claude exits 0 and artifacts exist', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

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

      sm.startEnrich('p1', '/path/to/project')
      pushLine(child, JSON.stringify({ type: 'result', session_id: 'sess-456' }))
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0].summary).toBeDefined()
    })

    it('broadcasts setup_complete with .claude dir when provider is codex', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

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

      sm.startEnrich('p1', '/path/to/project', 'codex')
      pushLine(child, 'Enrich complete')
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0].summary).toBeDefined()
    })

    it('broadcasts setup_error on non-zero exit', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      await finishProcess(child, 1)

      const errors = getBroadcastedByType(broadcast, 'setup_error')
      expect(errors).toHaveLength(1)
    })

    it('spawns codex with enrich.md content when codex is the detected CLI', () => {
      vi.mocked(detectCLISync).mockReturnValue('codex')
      vi.mocked(readFileSync).mockReturnValue('# Full enrich instructions')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      expect(readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude/commands/sr/enrich.md'),
        'utf-8'
      )
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', '# Full enrich instructions'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('falls back to setup.md for codex when enrich.md missing', () => {
      vi.mocked(detectCLISync).mockReturnValue('codex')
      vi.mocked(readFileSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.includes('enrich.md')) throw new Error('ENOENT')
        return '# Legacy setup content'
      })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', '# Legacy setup content'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('falls back to claude binary when no CLI is detected', () => {
      vi.mocked(detectCLISync).mockReturnValue(null)
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/specrails:enrich']),
        expect.any(Object)
      )
    })

    it('uses explicit provider parameter over detectCLISync', () => {
      vi.mocked(detectCLISync).mockReturnValue('claude')
      vi.mocked(readFileSync).mockReturnValue('# Enrich')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project', 'codex')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', '# Enrich'],
        expect.objectContaining({ cwd: '/path/to/project' })
      )
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('always pre-creates .claude directories regardless of provider', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project', 'codex')

      const mkdirCalls = vi.mocked(mkdirSync).mock.calls.map(([p]) => String(p))
      expect(mkdirCalls.some((p) => p.includes('.claude/agents/personas'))).toBe(true)
      expect(mkdirCalls.some((p) => p.includes('.claude/commands/sr'))).toBe(true)
      expect(mkdirCalls.some((p) => p.includes('.claude/commands/specrails'))).toBe(true)
      expect(mkdirCalls.some((p) => p.includes('.claude/rules'))).toBe(true)
    })

    it('uses explicit claude provider even when codex is detected in PATH', () => {
      vi.mocked(detectCLISync).mockReturnValue('codex')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project', 'claude')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '/specrails:enrich']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('generates synthetic sessionId for codex and calls onSessionCaptured', () => {
      const onSessionCaptured = vi.fn()
      const smWithCallback = new SetupManager(broadcast, onSessionCaptured)
      vi.mocked(readFileSync).mockReturnValue('# Enrich')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      smWithCallback.startEnrich('p1', '/path/to/project', 'codex')

      expect(onSessionCaptured).toHaveBeenCalledWith('p1', expect.stringMatching(/^codex-p1-\d+$/))
    })

    it('emits setup_turn_done with synthetic sessionId for codex when incomplete', async () => {
      vi.mocked(readFileSync).mockReturnValue('# Enrich')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockReturnValue(false)

      sm.startEnrich('p1', '/path/to/project', 'codex')
      await finishProcess(child, 0)

      const turnDone = getBroadcastedByType(broadcast, 'setup_turn_done')
      expect(turnDone).toHaveLength(1)
      expect(turnDone[0].sessionId).toMatch(/^codex-p1-\d+$/)
    })

    it('getInstallTier returns full after startEnrich', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      expect(sm.getInstallTier('p1')).toBe('full')
    })
  })

  // ─── startQuickInstall ──────────────────────────────────────────────────────

  describe('startQuickInstall', () => {
    it('writes install-config.yaml before spawning', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', { provider: 'claude', tier: 'quick' })

      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
        expect.stringContaining('.specrails'),
        { recursive: true }
      )
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('install-config.yaml'),
        expect.any(String),
        'utf-8'
      )
    })

    it('spawns npx specrails-core@latest init --from-config <configPath>', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', { provider: 'claude' })

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['specrails-core@latest', 'init', '--from-config']),
        expect.objectContaining({ cwd: '/path/to/project' })
      )
    })

    it('broadcasts config_written checkpoint immediately', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})

      const checkpoints = getBroadcastedByType(broadcast, 'setup_checkpoint')
      expect(checkpoints.some((c) => c.checkpoint === 'config_written' && c.status === 'done')).toBe(true)
    })

    it('broadcasts setup_install_done on exit 0', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      await finishProcess(child, 0)

      const done = getBroadcastedByType(broadcast, 'setup_install_done')
      expect(done).toHaveLength(1)
    })

    it('completes quick_complete checkpoint on exit 0', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      await finishProcess(child, 0)

      const checkpoints = getBroadcastedByType(broadcast, 'setup_checkpoint')
      expect(checkpoints.some((c) => c.checkpoint === 'quick_complete' && c.status === 'done')).toBe(true)
    })

    it('broadcasts setup_error on non-zero exit', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      await finishProcess(child, 1)

      const errors = getBroadcastedByType(broadcast, 'setup_error')
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toContain('--from-config')
    })

    it('getCheckpointStatus returns 3 checkpoints for quick tier', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(3)
    })

    it('getInstallTier returns quick after startQuickInstall', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      expect(sm.getInstallTier('p1')).toBe('quick')
    })

    it('broadcasts setup_error when writeFileSync throws', () => {
      vi.mocked(writeFileSync).mockImplementation(() => { throw new Error('Permission denied') })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})

      const errors = getBroadcastedByType(broadcast, 'setup_error')
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toContain('install-config.yaml')
      // spawn should not be called since config write failed
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('does not start install twice for same project', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      sm.startQuickInstall('p1', '/path/to/project', {})

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })
  })

  // ─── resumeEnrich ──────────────────────────────────────────────────────────

  describe('resumeEnrich', () => {
    it('spawns claude with --resume and message', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeEnrich('p1', '/path', 'sess-abc', 'continue please')

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--resume', 'sess-abc', '-p', 'continue please']),
        expect.any(Object)
      )
    })

    it('deprecated resumeSetup alias delegates to resumeEnrich', () => {
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

      sm.resumeEnrich('p1', '/path', 'sess-1', 'msg1')
      sm.resumeEnrich('p1', '/path', 'sess-2', 'msg2')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('uses enrich.md content for codex resume continuation prompt', () => {
      vi.mocked(detectCLISync).mockReturnValue('claude')
      vi.mocked(readFileSync).mockReturnValue('# Enrich prompt content')
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeEnrich('p1', '/path', 'sess-abc', 'continue please', 'codex')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', expect.stringContaining('continue please')],
        expect.any(Object)
      )
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      expect(spawnArgs[2]).toContain('# Enrich prompt content')
      expect(spawnArgs[2]).toContain('continuation of a previous enrich run')
      expect(detectCLISync).not.toHaveBeenCalled()
    })

    it('falls back to setup.md when enrich.md is missing for codex resume', () => {
      vi.mocked(readFileSync).mockImplementation((p: any) => {
        if (String(p).includes('enrich.md')) throw new Error('ENOENT')
        return '# Legacy setup content'
      })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeEnrich('p1', '/path', 'sess-abc', 'continue please', 'codex')

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[]
      expect(spawnArgs[2]).toContain('# Legacy setup content')
    })

    it('falls back to plain user message when both enrich.md and setup.md are missing', () => {
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT') })
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.resumeEnrich('p1', '/path', 'sess-abc', 'continue please', 'codex')

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', 'continue please'],
        expect.any(Object)
      )
    })
  })

  // ─── getCheckpointStatus ───────────────────────────────────────────────────

  describe('getCheckpointStatus', () => {
    it('returns all-pending (7) when no install has started', () => {
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(7)
      expect(statuses.every((s) => s.status === 'pending')).toBe(true)
    })

    it('returns 7 checkpoints after startEnrich (full tier)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(7)
    })

    it('returns 3 checkpoints after startQuickInstall (quick tier)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startQuickInstall('p1', '/path/to/project', {})
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      expect(statuses).toHaveLength(3)
    })
  })

  // ─── checkFilesystem new paths ─────────────────────────────────────────────

  describe('checkFilesystem new .specrails/ paths', () => {
    it('detects base_install from .specrails/specrails-version (new path)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.specrails/specrails-version')
      })

      sm.startEnrich('p1', '/path/to/project')
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      const baseInstall = statuses.find((s) => s.key === 'base_install')
      expect(baseInstall?.status).toBe('done')
    })

    it('detects base_install from legacy .specrails-version (backward compat)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.endsWith('.specrails-version') && !s.includes('.specrails/specrails-version')
      })

      sm.startEnrich('p1', '/path/to/project')
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      const baseInstall = statuses.find((s) => s.key === 'base_install')
      expect(baseInstall?.status).toBe('done')
    })

    it('detects repo_analysis from .specrails/setup-templates (new path)', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.specrails/specrails-version') || s.includes('.specrails/setup-templates')
      })

      sm.startEnrich('p1', '/path/to/project')
      const statuses = sm.getCheckpointStatus('p1', '/path/to/project')
      const repoAnalysis = statuses.find((s) => s.key === 'repo_analysis')
      expect(repoAnalysis?.status).toBe('done')
    })
  })

  // ─── Checkpoint detection from stream ──────────────────────────────────────

  describe('checkpoint detection from stream events', () => {
    it('detects repo_analysis from assistant text', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Starting Phase 1: codebase analysis of your project' }] },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const checkpointMsgs = getBroadcastedByType(broadcast, 'setup_checkpoint')
      const repoAnalysis = checkpointMsgs.find((m) => m.checkpoint === 'repo_analysis')
      expect(repoAnalysis).toBeDefined()
      expect(repoAnalysis?.status).toBe('running')
    })

    it('detects agent_generation from tool_use event', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

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

    it('detects base_install from new specrails/specrails-version path in tool_use', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'tool_use',
        input: { file_path: '.specrails/specrails-version' },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const checkpointMsgs = getBroadcastedByType(broadcast, 'setup_checkpoint')
      const baseInstall = checkpointMsgs.find((m) => m.checkpoint === 'base_install')
      expect(baseInstall).toBeDefined()
    })

    it('detects final_verification from new specrails/specrails-manifest.json path in tool_use', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'tool_use',
        input: { file_path: '.specrails/specrails-manifest.json' },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const checkpointMsgs = getBroadcastedByType(broadcast, 'setup_checkpoint')
      const finalVerification = checkpointMsgs.find((m) => m.checkpoint === 'final_verification')
      expect(finalVerification).toBeDefined()
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

    it('kills enrich process and clears state', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      sm.abort('p1')

      expect(treeKill).toHaveBeenCalledWith(child.pid, 'SIGTERM')
      expect(sm.isEnriching('p1')).toBe(false)
    })

    it('clears install tier on abort', () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')
      expect(sm.getInstallTier('p1')).toBe('full')
      sm.abort('p1')
      expect(sm.getInstallTier('p1')).toBeUndefined()
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
    it('broadcasts setup_chat for assistant text during enrich', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)

      sm.startEnrich('p1', '/path/to/project')

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello from enrich!' }] },
      })
      pushLine(child, event)

      await new Promise((r) => setImmediate(r))

      const chatMsgs = getBroadcastedByType(broadcast, 'setup_chat')
      expect(chatMsgs.length).toBeGreaterThan(0)
      expect(chatMsgs[0].text).toBe('Hello from enrich!')
      expect(chatMsgs[0].role).toBe('assistant')
    })
  })

  // ─── getSummary / computeSummary ────────────────────────────────────────────
  // Regression tests for: "Hub shows 0 Agents, 0 Personas, 0 Specs after install"
  // Root cause: three places in SetupWizard.tsx hardcoded { agents:0, personas:0, commands:0 }
  // Fix: computeSummary() now called in setup_install_done broadcasts; getSummary() is public.

  describe('getSummary', () => {
    it('returns zeros when no .claude/ directory exists', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockReturnValue([])

      const result = sm.getSummary('/path/to/project')
      expect(result).toEqual({ agents: 0, personas: 0, commands: 0 })
    })

    it('counts sr-*.md files as agents', () => {
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('.claude/agents')
      )
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).endsWith('.claude/agents')) {
          return ['sr-architect.md', 'sr-developer.md', 'sr-reviewer.md', 'not-an-agent.md'] as any
        }
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.agents).toBe(3)
      expect(result.personas).toBe(0)
      expect(result.commands).toBe(0)
    })

    it('counts .md files in agents/personas/ as personas', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.claude/agents')
      })
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.endsWith('.claude/agents')) return ['sr-architect.md'] as any
        if (s.includes('agents/personas')) return ['the-builder.md', 'the-maintainer.md'] as any
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.personas).toBe(2)
    })

    it('counts .md files in commands/sr/ as commands', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('commands/sr')
      })
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).includes('commands/sr')) {
          return ['implement.md', 'batch-implement.md', 'get-backlog-specs.md'] as any
        }
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.commands).toBe(3)
    })

    it('does not count non-.md files in commands/sr/', () => {
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('commands/sr')
      )
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).includes('commands/sr')) {
          return ['implement.md', 'README.txt', '.DS_Store'] as any
        }
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.commands).toBe(1)
    })

    it('counts .md files in commands/specrails/ as commands (new install path)', () => {
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('commands/specrails')
      )
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).includes('commands/specrails')) {
          return ['implement.md', 'batch-implement.md', 'propose-spec.md'] as any
        }
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.commands).toBe(3)
    })

    it('counts commands from both commands/sr/ and commands/specrails/ together', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.includes('commands/sr') && !s.includes('specrails')) return ['implement.md'] as any
        if (s.includes('commands/specrails')) return ['propose-spec.md', 'why.md'] as any
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result.commands).toBe(3)
    })

    it('returns zeros and does not throw when readdirSync throws', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      expect(() => sm.getSummary('/path/to/project')).not.toThrow()
      const result = sm.getSummary('/path/to/project')
      expect(result).toEqual({ agents: 0, personas: 0, commands: 0 })
    })

    it('counts all three categories together', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.endsWith('.claude/agents')) return ['sr-architect.md', 'sr-developer.md'] as any
        if (s.includes('agents/personas')) return ['the-builder.md'] as any
        if (s.includes('commands/sr')) return ['implement.md', 'batch-implement.md'] as any
        return []
      })

      const result = sm.getSummary('/path/to/project')
      expect(result).toEqual({ agents: 2, personas: 1, commands: 2 })
    })
  })

  // ─── setup_install_done includes summary ────────────────────────────────────

  describe('setup_install_done includes summary (regression: was hardcoded zeros)', () => {
    it('startInstall broadcasts setup_install_done with summary field', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      // Simulate 3 agents installed
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('.claude/agents')
      )
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).endsWith('.claude/agents'))
          return ['sr-architect.md', 'sr-developer.md', 'sr-reviewer.md'] as any
        return []
      })

      sm.startInstall('p1', '/path/to/project')
      await finishProcess(child, 0)

      const done = getBroadcastedByType(broadcast, 'setup_install_done')
      expect(done).toHaveLength(1)
      expect(done[0]).toHaveProperty('summary')
      expect(done[0].summary).toMatchObject({
        agents: expect.any(Number),
        personas: expect.any(Number),
        commands: expect.any(Number),
      })
      // Crucially: agents should be non-zero (not the old hardcoded 0)
      expect(done[0].summary.agents).toBe(3)
    })

    it('startEnrich broadcasts setup_complete with summary field (enrich done)', async () => {
      // startEnrich emits 'setup_complete' (not 'setup_install_done') when Claude finishes.
      // setup_complete is gated on hasAgents && hasCommands being true.
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.endsWith('.claude/agents')) return ['sr-architect.md', 'sr-developer.md'] as any
        if (s.includes('agents/personas')) return ['the-builder.md'] as any
        if (s.includes('commands/sr')) return ['implement.md'] as any
        return []
      })

      sm.startEnrich('p1', '/path/to/project')
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0]).toHaveProperty('summary')
      expect(complete[0].summary).toMatchObject({ agents: 2, personas: 1, commands: 1 })
    })

    it('startEnrich broadcasts setup_complete when commands are in commands/specrails/ (regression: wizard was stuck)', async () => {
      // Regression test for SPEA-751: specrails-core installs commands in commands/specrails/
      // but the completion check was only looking at commands/sr/ → setup_turn_done was sent
      // instead of setup_complete → wizard stayed stuck on the enriching step.
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const s = String(p)
        return s.includes('.claude/agents') || s.includes('commands/specrails')
      })
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        const s = String(p)
        if (s.endsWith('.claude/agents')) return ['sr-architect.md', 'sr-developer.md'] as any
        if (s.includes('commands/specrails')) return ['implement.md', 'propose-spec.md'] as any
        return []
      })

      sm.startEnrich('p1', '/path/to/project')
      await finishProcess(child, 0)

      const complete = getBroadcastedByType(broadcast, 'setup_complete')
      expect(complete).toHaveLength(1)
      expect(complete[0].summary).toMatchObject({ agents: 2, personas: 0, commands: 2 })
      // Should NOT have emitted setup_turn_done (which would leave wizard stuck)
      const turnDone = getBroadcastedByType(broadcast, 'setup_turn_done')
      expect(turnDone).toHaveLength(0)
    })

    it('startQuickInstall broadcasts setup_install_done with summary field', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockImplementation((p: any) =>
        String(p).includes('.claude/agents')
      )
      vi.mocked(readdirSync).mockImplementation((p: any) => {
        if (String(p).endsWith('.claude/agents'))
          return ['sr-architect.md', 'sr-developer.md'] as any
        return []
      })

      sm.startQuickInstall('p1', '/path/to/project', {})
      await finishProcess(child, 0)

      const done = getBroadcastedByType(broadcast, 'setup_install_done')
      expect(done).toHaveLength(1)
      expect(done[0]).toHaveProperty('summary')
      expect(done[0].summary.agents).toBe(2)
    })

    it('summary falls back to zeros when agents dir does not exist', async () => {
      const child = createMockChildProcess()
      vi.mocked(mockSpawn).mockReturnValue(child as any)
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockReturnValue([])

      sm.startInstall('p1', '/path/to/project')
      await finishProcess(child, 0)

      const done = getBroadcastedByType(broadcast, 'setup_install_done')
      expect(done[0].summary).toEqual({ agents: 0, personas: 0, commands: 0 })
    })
  })
})
