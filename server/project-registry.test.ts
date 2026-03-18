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
  }))
  return { QueueManager }
})

vi.mock('./chat-manager', () => {
  const ChatManager = vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn(),
    abort: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
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
import { initHubDb, addProject, listProjects, getProject } from './hub-db'
import type { DbInstance } from './db'
import type { WsMessage } from './types'

describe('ProjectRegistry', () => {
  let hubDb: DbInstance
  let broadcast: ReturnType<typeof vi.fn>
  let registry: ProjectRegistry

  beforeEach(() => {
    vi.resetAllMocks()
    broadcast = vi.fn()
    registry = new ProjectRegistry(broadcast, ':memory:')
    hubDb = registry.hubDb
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes hub DB and empty context map', () => {
      expect(registry.hubDb).toBeDefined()
      expect(registry.listContexts()).toHaveLength(0)
    })
  })

  // ─── loadAll ────────────────────────────────────────────────────────────────

  describe('loadAll', () => {
    it('loads all projects from hub DB', () => {
      addProject(hubDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })
      addProject(hubDb, { id: 'p2', slug: 'proj-2', name: 'Project 2', path: '/path/2' })

      registry.loadAll()

      expect(registry.listContexts()).toHaveLength(2)
    })

    it('handles empty project list', () => {
      registry.loadAll()
      expect(registry.listContexts()).toHaveLength(0)
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
    it('removes project from contexts and hub DB', () => {
      registry.addProject({
        id: 'p1',
        slug: 'my-proj',
        name: 'My Proj',
        path: '/path/to/proj',
      })

      expect(registry.getContext('p1')).toBeDefined()

      registry.removeProject('p1')

      expect(registry.getContext('p1')).toBeUndefined()
      expect(getProject(hubDb, 'p1')).toBeUndefined()
    })

    it('handles removing non-existent project gracefully', () => {
      expect(() => registry.removeProject('nonexistent')).not.toThrow()
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
    it('delegates to hub-db touchProject', () => {
      registry.addProject({ id: 'p1', slug: 's1', name: 'N1', path: '/p1' })
      expect(() => registry.touchProject('p1')).not.toThrow()
    })
  })

  // ─── getProjectRow ─────────────────────────────────────────────────────────

  describe('getProjectRow', () => {
    it('returns project row from hub DB', () => {
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
      addProject(hubDb, { id: 'p1', slug: 'proj-1', name: 'Project 1', path: '/path/1' })

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
})
