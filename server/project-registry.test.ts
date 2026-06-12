import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock all managers before importing
vi.mock('./queue-manager', () => {
  const QueueManager = vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getJobs: vi.fn().mockReturnValue([]),
    getActiveJobId: vi.fn().mockReturnValue(null),
    isPaused: vi.fn().mockReturnValue(false),
    setCommands: vi.fn(),
    shutdown: vi.fn(),
  }))
  return { QueueManager }
})

vi.mock('./chat-manager', () => {
  const ChatManager = vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn(),
    abort: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    shutdown: vi.fn(),
    forgetSpecDraft: vi.fn(),
    forgetExploreLifecycle: vi.fn(),
  }))
  return { ChatManager }
})

vi.mock('./setup-manager', () => {
  const SetupManager = vi.fn().mockImplementation(() => ({
    startInstall: vi.fn(),
    startSetup: vi.fn(),
    resumeSetup: vi.fn(),
    abort: vi.fn(),
    isInstalling: vi.fn().mockReturnValue(false),
    isSettingUp: vi.fn().mockReturnValue(false),
    getCheckpointStatus: vi.fn().mockReturnValue([]),
  }))
  return { SetupManager }
})

vi.mock('./proposal-manager', () => {
  const ProposalManager = vi.fn().mockImplementation(() => ({
    startExploration: vi.fn(),
    sendRefinement: vi.fn(),
    createIssue: vi.fn(),
    cancel: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
  }))
  return { ProposalManager }
})

vi.mock('./config', () => ({
  getConfig: vi.fn().mockReturnValue({
    commands: [{ id: 'implement', name: 'Implement', slug: 'implement' }],
  }),
}))

import { ProjectRegistry } from './project-registry'
import { setRailTickets, getRail } from './rails-store'
import { initDesktopDb, addProject, listProjects, getProject } from './desktop-db'
import type { DbInstance } from './db'
import type { WsMessage } from './types'

describe('ProjectRegistry', () => {
  let desktopDb: DbInstance
  let broadcast: ReturnType<typeof vi.fn>
  let registry: ProjectRegistry

  beforeEach(() => {
    vi.resetAllMocks()
    broadcast = vi.fn()
    registry = new ProjectRegistry(broadcast, ':memory:')
    desktopDb = registry.desktopDb
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes the desktop DB and empty context map', () => {
      expect(registry.desktopDb).toBeDefined()
      expect(registry.listContexts()).toHaveLength(0)
    })
  })

  // ─── loadAll ────────────────────────────────────────────────────────────────

  describe('loadAll', () => {
    it('loads all projects from the desktop DB', () => {
      addProject(desktopDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })
      addProject(desktopDb, { id: 'p2', slug: 'proj-2', name: 'Project 2', path: '/path/2' })

      registry.loadAll()

      expect(registry.listContexts()).toHaveLength(2)
    })

    it('handles empty project list', () => {
      registry.loadAll()
      expect(registry.listContexts()).toHaveLength(0)
    })

    it('M9: a single failing project DB does not abort loading the rest', () => {
      addProject(desktopDb, { id: 'good', slug: 'good', name: 'Good', path: '/path/good' })
      addProject(desktopDb, { id: 'bad', slug: 'bad', name: 'Bad', path: '/path/bad' })
      // Corrupt the bad project's db_path so initDb throws (ENOTDIR: /dev/null is
      // not a directory, so mkdirSync of its parent fails).
      desktopDb.prepare('UPDATE projects SET db_path = ? WHERE id = ?').run('/dev/null/jobs.sqlite', 'bad')

      expect(() => registry.loadAll()).not.toThrow()
      expect(registry.getContext('good')).toBeDefined()
      expect(registry.getContext('bad')).toBeUndefined()
      expect(registry.listFailedProjects().map((f) => f.project.id)).toContain('bad')
    })
  })

  // ─── addProject ────────────────────────────────────────────────────────────

  describe('addProject', () => {
    it('adds a project and returns context', () => {
      const ctx = registry.addProject({
        id: 'p1',
        slug: 'my-proj',
        name: 'My Proj',
        path: '/path/to/proj',
      })

      expect(ctx.project.id).toBe('p1')
      expect(ctx.project.slug).toBe('my-proj')
      expect(ctx.db).toBeDefined()
      expect(ctx.queueManager).toBeDefined()
      expect(ctx.chatManager).toBeDefined()
      expect(ctx.setupManager).toBeDefined()
      expect(ctx.proposalManager).toBeDefined()
      expect(ctx.broadcast).toBeDefined()
    })

    it('context broadcast injects projectId', () => {
      const ctx = registry.addProject({
        id: 'p1',
        slug: 'my-proj',
        name: 'My Proj',
        path: '/path/to/proj',
      })

      ctx.broadcast({ type: 'queue_update', jobs: [], paused: false, activeJobId: null } as any)

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p1' })
      )
    })
  })

  // ─── removeProject ─────────────────────────────────────────────────────────

  describe('removeProject', () => {
    it('removes project from contexts and the desktop DB', () => {
      registry.addProject({
        id: 'p1',
        slug: 'my-proj',
        name: 'My Proj',
        path: '/path/to/proj',
      })

      expect(registry.getContext('p1')).toBeDefined()

      registry.removeProject('p1')

      expect(registry.getContext('p1')).toBeUndefined()
      expect(getProject(desktopDb, 'p1')).toBeUndefined()
    })

    it('handles removing non-existent project gracefully', () => {
      expect(() => registry.removeProject('nonexistent')).not.toThrow()
    })

    it('tears down spawners: queueManager.shutdown + chatManager.shutdown + setupManager.abort', () => {
      registry.addProject({ id: 'p1', slug: 'my-proj', name: 'My Proj', path: '/path/to/proj' })
      const ctx = registry.getContext('p1')!
      // afterEach(restoreAllMocks) strips the factory mockImplementation, so the
      // context managers are bare objects here — attach fresh spies to assert
      // removeProject invokes the teardown hooks (all are try/catch-wrapped in
      // the source, so a missing method would silently pass otherwise).
      const qmShutdown = vi.fn(); const cmShutdown = vi.fn(); const smAbort = vi.fn()
      ;(ctx.queueManager as unknown as { shutdown: unknown }).shutdown = qmShutdown
      ;(ctx.chatManager as unknown as { shutdown: unknown }).shutdown = cmShutdown
      ;(ctx.setupManager as unknown as { abort: unknown }).abort = smAbort
      registry.removeProject('p1')
      expect(qmShutdown).toHaveBeenCalled()
      expect(cmShutdown).toHaveBeenCalled()
      expect(smAbort).toHaveBeenCalledWith('p1')
    })

    it('M12: also disposes proposal/agentRefine/specLauncher before db.close()', () => {
      registry.addProject({ id: 'p1', slug: 'my-proj', name: 'My Proj', path: '/path/to/proj' })
      const ctx = registry.getContext('p1')!
      const pmShutdown = vi.fn(); const arShutdown = vi.fn(); const slShutdown = vi.fn()
      ;(ctx.proposalManager as unknown as { shutdown: unknown }).shutdown = pmShutdown
      ;(ctx.agentRefineManager as unknown as { shutdown: unknown }).shutdown = arShutdown
      ;(ctx.specLauncherManager as unknown as { shutdown: unknown }).shutdown = slShutdown
      registry.removeProject('p1')
      expect(pmShutdown).toHaveBeenCalled()
      expect(arShutdown).toHaveBeenCalled()
      expect(slShutdown).toHaveBeenCalled()
    })
  })

  // ─── shutdown (process-level) ────────────────────────────────────────────────

  describe('shutdown', () => {
    it('tears down queue + chat managers for every loaded project', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      registry.addProject({ id: 'p2', slug: 's2', name: 'N2', path: '/p2' })
      const c1 = registry.getContext('p1')!
      const c2 = registry.getContext('p2')!
      const spies = [c1.queueManager, c1.chatManager, c2.queueManager, c2.chatManager].map((m) => {
        const fn = vi.fn()
        ;(m as unknown as { shutdown: unknown }).shutdown = fn
        return fn
      })
      registry.shutdown()
      for (const s of spies) expect(s).toHaveBeenCalled()
    })

    it('is safe with no projects loaded', () => {
      expect(() => registry.shutdown()).not.toThrow()
    })
  })

  // ─── getContext / getContextByPath ──────────────────────────────────────────

  describe('getContext', () => {
    it('returns context for existing project', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      expect(registry.getContext('p1')).toBeDefined()
    })

    it('returns undefined for non-existent project', () => {
      expect(registry.getContext('nonexistent')).toBeUndefined()
    })
  })

  describe('getContextByPath', () => {
    it('returns context for matching path', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/path/1' })
      const ctx = registry.getContextByPath('/path/1')
      expect(ctx?.project.id).toBe('p1')
    })

    it('returns undefined for non-matching path', () => {
      expect(registry.getContextByPath('/not/found')).toBeUndefined()
    })
  })

  // ─── listContexts ──────────────────────────────────────────────────────────

  describe('listContexts', () => {
    it('returns all loaded contexts', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      registry.addProject({ id: 'p2', slug: 's2', name: 'N2', path: '/p2' })
      expect(registry.listContexts()).toHaveLength(2)
    })
  })

  // ─── touchProject ──────────────────────────────────────────────────────────

  describe('touchProject', () => {
    it('delegates to desktop-db touchProject', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      expect(() => registry.touchProject('p1')).not.toThrow()
    })
  })

  // ─── getProjectRow ─────────────────────────────────────────────────────────

  describe('getProjectRow', () => {
    it('returns project row from the desktop DB', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      const row = registry.getProjectRow('p1')
      expect(row?.id).toBe('p1')
    })

    it('returns undefined for non-existent', () => {
      expect(registry.getProjectRow('nope')).toBeUndefined()
    })
  })

  // ─── Double-load prevention ────────────────────────────────────────────────

  describe('double-load prevention', () => {
    it('does not create duplicate contexts for same project', () => {
      addProject(desktopDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })

      registry.loadAll()
      const ctx1 = registry.getContext('p1')

      registry.loadAll()
      const ctx2 = registry.getContext('p1')

      // Same instance
      expect(ctx1).toBe(ctx2)
      expect(registry.listContexts()).toHaveLength(1)
    })
  })

  // ─── Config loading failure ────────────────────────────────────────────────

  describe('config loading failure', () => {
    it('still creates context when config loading fails', async () => {
      const configMod = await import('./config')
      vi.mocked(configMod.getConfig).mockImplementation(() => {
        throw new Error('No .claude/commands found')
      })

      const ctx = registry.addProject({
        id: 'p1',
        slug: 's1',
        name: 'N1',
        path: '/no-commands',
      })

      expect(ctx).toBeDefined()
      expect(ctx.project.id).toBe('p1')
    })
  })

  // ─── QueueManager constructor callback tests ──────────────────────────────

  describe('QueueManager options callbacks', () => {
    it('getCostAlertThreshold reads desktop setting', async () => {
      const { QueueManager } = await import('./queue-manager')
      registry.addProject({ id: 'cb-1', slug: 'cb-proj', name: 'CB', path: '/cb' })

      // Capture the options passed to QueueManager constructor
      const constructorCalls = vi.mocked(QueueManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const options = lastCall[4] as any
      expect(options).toBeDefined()

      // getCostAlertThreshold should read from desktop settings
      const threshold = options.getCostAlertThreshold()
      // No setting set, so should return null
      expect(threshold).toBeNull()
    })

    it('getDesktopDailyBudget returns budget and total spend', async () => {
      const { QueueManager } = await import('./queue-manager')
      registry.addProject({ id: 'hb-1', slug: 'hb-proj', name: 'HB', path: '/hb' })

      const constructorCalls = vi.mocked(QueueManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const options = lastCall[4] as any

      const result = options.getDesktopDailyBudget()
      expect(result).toHaveProperty('budget')
      expect(result).toHaveProperty('totalSpend')
      expect(typeof result.totalSpend).toBe('number')
    })

    it('onJobFinished calls webhook deliver', async () => {
      const { QueueManager } = await import('./queue-manager')
      registry.addProject({ id: 'wh-1', slug: 'wh-proj', name: 'WH', path: '/wh' })

      const constructorCalls = vi.mocked(QueueManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const options = lastCall[4] as any

      // The onJobFinished callback should not throw even if job row doesn't exist
      expect(() => options.onJobFinished('fake-job', 'completed', 0.05)).not.toThrow()
    })

    it('onJobFinished releases the finished job tickets from rails and broadcasts rail.updated', async () => {
      const { QueueManager } = await import('./queue-manager')
      const ctx = registry.addProject({ id: 'rr-1', slug: 'rr-proj', name: 'RR', path: '/rr' })

      // Rail 0 holds tickets 5 and 7; the finishing job implements only #5.
      setRailTickets(ctx.db, 0, [5, 7])
      ctx.db.prepare(
        `INSERT OR REPLACE INTO jobs (id, command, started_at, status) VALUES (?, ?, ?, 'completed')`
      ).run('rjob-1', '/specrails:implement #5 --yes', new Date().toISOString())

      const constructorCalls = vi.mocked(QueueManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const options = lastCall[4] as any

      broadcast.mockClear()
      options.onJobFinished('rjob-1', 'completed', 0.01)

      // Server rails table released #5 but kept #7 (mobile reads this table).
      expect(getRail(ctx.db, 0).ticketIds).toEqual([7])
      const msg = broadcast.mock.calls.map((c) => c[0] as any).find((m) => m.type === 'rail.updated')
      expect(msg).toBeDefined()
      expect(msg.changed).toBe('tickets')
      expect(msg.railIndex).toBe(0)
      expect(msg.ticketIds).toEqual([7])
    })

    it('onJobFinished releases rail tickets on failure too (specs return to the board)', async () => {
      const { QueueManager } = await import('./queue-manager')
      const ctx = registry.addProject({ id: 'rr-2', slug: 'rr-proj-2', name: 'RR2', path: '/rr2' })

      setRailTickets(ctx.db, 1, [9])
      ctx.db.prepare(
        `INSERT OR REPLACE INTO jobs (id, command, started_at, status) VALUES (?, ?, ?, 'failed')`
      ).run('rjob-2', '/specrails:implement #9 --yes', new Date().toISOString())

      const constructorCalls = vi.mocked(QueueManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const options = lastCall[4] as any

      options.onJobFinished('rjob-2', 'failed', null)

      expect(getRail(ctx.db, 1).ticketIds).toEqual([])
    })
  })

  // ─── SetupManager constructor callback tests ──────────────────────────────

  describe('SetupManager callbacks', () => {
    it('setProjectSetupSession and clearProjectSetupSession callbacks work', async () => {
      const { SetupManager } = await import('./setup-manager')
      registry.addProject({ id: 'sm-1', slug: 'sm-proj', name: 'SM', path: '/sm' })

      const constructorCalls = vi.mocked(SetupManager).mock.calls
      const lastCall = constructorCalls[constructorCalls.length - 1]
      const setSessionFn = lastCall[1] as (pid: string, sid: string) => void
      const clearSessionFn = lastCall[2] as (pid: string) => void

      expect(() => setSessionFn('sm-1', 'session-123')).not.toThrow()
      expect(() => clearSessionFn('sm-1')).not.toThrow()
    })
  })

  // ─── Bound broadcast with queue terminal status ──────────────────────────

  describe('bound broadcast clears agent jobs for terminal statuses', () => {
    it('broadcasts queue message and calls clearAgentJob for terminal jobs', () => {
      const ctx = registry.addProject({ id: 'aq-1', slug: 'aq-proj', name: 'AQ', path: '/aq' })

      // Simulate a queue broadcast with terminal job statuses
      ctx.broadcast({
        type: 'queue',
        jobs: [
          { id: 'j1', status: 'completed', command: 'cmd', priority: 'normal' },
          { id: 'j2', status: 'running', command: 'cmd', priority: 'normal' },
          { id: 'j3', status: 'failed', command: 'cmd', priority: 'normal' },
        ],
        paused: false,
        activeJobId: null,
      } as any)

      // The broadcast should have been called with enriched projectId
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'aq-1', type: 'queue' })
      )
    })
  })
})
