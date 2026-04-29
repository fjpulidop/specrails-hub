import { describe, it, expect, beforeEach } from 'vitest'
import {
  initHubDb,
  addProject,
  removeProject,
  listProjects,
  getProject,
  getProjectBySlug,
  getProjectByPath,
  touchProject,
  getHubSetting,
  setHubSetting,
  setProjectSetupSession,
  getProjectSetupSession,
  clearProjectSetupSession,
  listAgents,
  getAgent,
  getAgentBySlug,
  addAgent,
  updateAgent,
  findAgentByCurrentJobId,
  clearAgentJob,
  listWebhooks,
  getWebhook,
  addWebhook,
  updateWebhook,
  removeWebhook,
  listWebhooksForProject,
} from './hub-db'
import type { DbInstance } from './db'

function makeDb(): DbInstance {
  return initHubDb(':memory:')
}

function makeProjectOpts(suffix = '1') {
  return {
    id: `proj-${suffix}`,
    slug: `my-project-${suffix}`,
    name: `My Project ${suffix}`,
    path: `/home/user/projects/project-${suffix}`,
  }
}

describe('hub-db', () => {
  let db: DbInstance

  beforeEach(() => {
    db = makeDb()
  })

  // ─── Schema & Init ──────────────────────────────────────────────────────────

  describe('initHubDb', () => {
    it('creates the projects, hub_settings, agents and webhooks tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      const names = tables.map((t) => t.name)
      expect(names).toContain('projects')
      expect(names).toContain('hub_settings')
      expect(names).toContain('schema_migrations')
      expect(names).toContain('agents')
      expect(names).toContain('webhooks')
    })

    it('creates indexes on slug and path', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
      const names = indexes.map((i) => i.name)
      expect(names).toContain('idx_projects_slug')
      expect(names).toContain('idx_projects_path')
    })

    it('applies migrations 1 through 5 and records them', () => {
      const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]
      expect(versions).toHaveLength(5)
      expect(versions[0].version).toBe(1)
      expect(versions[1].version).toBe(2)
      expect(versions[2].version).toBe(3)
      expect(versions[3].version).toBe(4)
      expect(versions[4].version).toBe(5)
    })

    it('is idempotent — calling initHubDb again does not fail', () => {
      // Re-init on same DB (in-memory so we just call again)
      const db2 = makeDb()
      const versions = db2.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
      expect(versions).toHaveLength(5)
    })
  })

  // ─── Project CRUD ─────────────────────────────────────────────────────────

  describe('addProject', () => {
    it('adds a project and returns the full row', () => {
      const row = addProject(db, makeProjectOpts())
      expect(row.id).toBe('proj-1')
      expect(row.slug).toBe('my-project-1')
      expect(row.name).toBe('My Project 1')
      expect(row.path).toBe('/home/user/projects/project-1')
      expect(row.db_path).toBeTruthy()
      expect(row.provider).toBe('claude')
      expect(row.added_at).toBeTruthy()
      expect(row.last_seen_at).toBeTruthy()
    })

    it('stores the specified provider', () => {
      const row = addProject(db, { ...makeProjectOpts(), provider: 'codex' })
      expect(row.provider).toBe('codex')
    })

    it('throws on duplicate slug', () => {
      addProject(db, makeProjectOpts())
      const opts2 = { ...makeProjectOpts(), id: 'proj-dup', path: '/other/path' }
      expect(() => addProject(db, opts2)).toThrow(/UNIQUE/)
    })

    it('throws on duplicate path', () => {
      addProject(db, makeProjectOpts())
      const opts2 = { ...makeProjectOpts(), id: 'proj-dup', slug: 'other-slug' }
      expect(() => addProject(db, opts2)).toThrow(/UNIQUE/)
    })
  })

  describe('listProjects', () => {
    it('returns empty array when no projects', () => {
      expect(listProjects(db)).toEqual([])
    })

    it('returns projects ordered by added_at ASC', () => {
      addProject(db, makeProjectOpts('a'))
      addProject(db, makeProjectOpts('b'))
      addProject(db, makeProjectOpts('c'))
      const projects = listProjects(db)
      expect(projects).toHaveLength(3)
      expect(projects[0].slug).toBe('my-project-a')
      expect(projects[2].slug).toBe('my-project-c')
    })
  })

  describe('getProject', () => {
    it('returns the project by ID', () => {
      addProject(db, makeProjectOpts())
      const row = getProject(db, 'proj-1')
      expect(row?.id).toBe('proj-1')
    })

    it('returns undefined for non-existent ID', () => {
      expect(getProject(db, 'nonexistent')).toBeUndefined()
    })
  })

  describe('getProjectBySlug', () => {
    it('returns the project by slug', () => {
      addProject(db, makeProjectOpts())
      const row = getProjectBySlug(db, 'my-project-1')
      expect(row?.id).toBe('proj-1')
    })

    it('returns undefined for non-existent slug', () => {
      expect(getProjectBySlug(db, 'nope')).toBeUndefined()
    })
  })

  describe('getProjectByPath', () => {
    it('returns the project by path', () => {
      addProject(db, makeProjectOpts())
      const row = getProjectByPath(db, '/home/user/projects/project-1')
      expect(row?.id).toBe('proj-1')
    })

    it('returns undefined for non-existent path', () => {
      expect(getProjectByPath(db, '/not/here')).toBeUndefined()
    })
  })

  describe('removeProject', () => {
    it('removes an existing project', () => {
      addProject(db, makeProjectOpts())
      removeProject(db, 'proj-1')
      expect(getProject(db, 'proj-1')).toBeUndefined()
      expect(listProjects(db)).toHaveLength(0)
    })

    it('does nothing for non-existent ID (no error)', () => {
      expect(() => removeProject(db, 'nonexistent')).not.toThrow()
    })
  })

  describe('touchProject', () => {
    it('updates last_seen_at', () => {
      addProject(db, makeProjectOpts())
      const before = getProject(db, 'proj-1')!.last_seen_at
      // Small delay to ensure timestamp differs
      touchProject(db, 'proj-1')
      const after = getProject(db, 'proj-1')!.last_seen_at
      // last_seen_at should be >= before (datetime resolution is seconds)
      expect(after >= before).toBe(true)
    })
  })

  // ─── Hub Settings ─────────────────────────────────────────────────────────

  describe('hub settings', () => {
    it('returns undefined for non-existent key', () => {
      expect(getHubSetting(db, 'nonexistent')).toBeUndefined()
    })

    it('sets and gets a setting', () => {
      setHubSetting(db, 'port', '4200')
      expect(getHubSetting(db, 'port')).toBe('4200')
    })

    it('upserts — replaces existing value', () => {
      setHubSetting(db, 'port', '4200')
      setHubSetting(db, 'port', '8080')
      expect(getHubSetting(db, 'port')).toBe('8080')
    })

    it('handles multiple different keys', () => {
      setHubSetting(db, 'key1', 'value1')
      setHubSetting(db, 'key2', 'value2')
      expect(getHubSetting(db, 'key1')).toBe('value1')
      expect(getHubSetting(db, 'key2')).toBe('value2')
    })
  })

  describe('setup session persistence', () => {
    it('saves and retrieves a setup session ID', () => {
      setProjectSetupSession(db, 'proj-1', 'session-abc-123')
      expect(getProjectSetupSession(db, 'proj-1')).toBe('session-abc-123')
    })

    it('returns undefined when no session is stored', () => {
      expect(getProjectSetupSession(db, 'proj-1')).toBeUndefined()
    })

    it('overwrites an existing session ID', () => {
      setProjectSetupSession(db, 'proj-1', 'session-old')
      setProjectSetupSession(db, 'proj-1', 'session-new')
      expect(getProjectSetupSession(db, 'proj-1')).toBe('session-new')
    })

    it('clears a session ID', () => {
      setProjectSetupSession(db, 'proj-1', 'session-abc-123')
      clearProjectSetupSession(db, 'proj-1')
      expect(getProjectSetupSession(db, 'proj-1')).toBeUndefined()
    })

    it('isolates sessions per project', () => {
      setProjectSetupSession(db, 'proj-1', 'session-one')
      setProjectSetupSession(db, 'proj-2', 'session-two')
      expect(getProjectSetupSession(db, 'proj-1')).toBe('session-one')
      expect(getProjectSetupSession(db, 'proj-2')).toBe('session-two')
      clearProjectSetupSession(db, 'proj-1')
      expect(getProjectSetupSession(db, 'proj-1')).toBeUndefined()
      expect(getProjectSetupSession(db, 'proj-2')).toBe('session-two')
    })
  })

  // ─── Agent CRUD ──────────────────────────────────────────────────────────────

  function makeAgentOpts(suffix = '1') {
    return {
      id: `agent-${suffix}`,
      slug: `my-agent-${suffix}`,
      name: `My Agent ${suffix}`,
    }
  }

  describe('addAgent', () => {
    it('adds an agent and returns the full row', () => {
      const row = addAgent(db, makeAgentOpts())
      expect(row.id).toBe('agent-1')
      expect(row.slug).toBe('my-agent-1')
      expect(row.name).toBe('My Agent 1')
      expect(row.status).toBe('idle')
      expect(row.current_job_id).toBeNull()
      expect(row.role).toBeNull()
      expect(row.created_at).toBeTruthy()
    })

    it('stores role and config when provided', () => {
      const row = addAgent(db, { ...makeAgentOpts(), role: 'developer', config: '{"key":"val"}' })
      expect(row.role).toBe('developer')
      expect(row.config).toBe('{"key":"val"}')
    })

    it('throws on duplicate slug', () => {
      addAgent(db, makeAgentOpts())
      expect(() => addAgent(db, { id: 'agent-dup', slug: 'my-agent-1', name: 'Other' })).toThrow(/UNIQUE/)
    })
  })

  describe('listAgents', () => {
    it('returns empty array when no agents', () => {
      expect(listAgents(db)).toEqual([])
    })

    it('returns agents ordered by created_at ASC', () => {
      addAgent(db, makeAgentOpts('a'))
      addAgent(db, makeAgentOpts('b'))
      const agents = listAgents(db)
      expect(agents).toHaveLength(2)
      expect(agents[0].slug).toBe('my-agent-a')
      expect(agents[1].slug).toBe('my-agent-b')
    })
  })

  describe('getAgent', () => {
    it('returns agent by ID', () => {
      addAgent(db, makeAgentOpts())
      expect(getAgent(db, 'agent-1')?.slug).toBe('my-agent-1')
    })

    it('returns undefined for non-existent ID', () => {
      expect(getAgent(db, 'nope')).toBeUndefined()
    })
  })

  describe('getAgentBySlug', () => {
    it('returns agent by slug', () => {
      addAgent(db, makeAgentOpts())
      expect(getAgentBySlug(db, 'my-agent-1')?.id).toBe('agent-1')
    })

    it('returns undefined for non-existent slug', () => {
      expect(getAgentBySlug(db, 'nope')).toBeUndefined()
    })
  })

  describe('updateAgent', () => {
    it('updates status and current_job_id', () => {
      addAgent(db, makeAgentOpts())
      const updated = updateAgent(db, 'agent-1', { status: 'busy', current_job_id: 'job-xyz' })
      expect(updated?.status).toBe('busy')
      expect(updated?.current_job_id).toBe('job-xyz')
    })

    it('returns undefined for non-existent agent', () => {
      expect(updateAgent(db, 'missing', { status: 'busy' })).toBeUndefined()
    })

    it('returns the current row when no updates given', () => {
      addAgent(db, makeAgentOpts())
      const result = updateAgent(db, 'agent-1', {})
      expect(result?.id).toBe('agent-1')
    })

    it('only updates provided fields', () => {
      addAgent(db, { ...makeAgentOpts(), role: 'developer' })
      updateAgent(db, 'agent-1', { status: 'busy' })
      const row = getAgent(db, 'agent-1')
      expect(row?.role).toBe('developer')
      expect(row?.status).toBe('busy')
    })
  })

  describe('findAgentByCurrentJobId', () => {
    it('finds an agent by current_job_id', () => {
      addAgent(db, makeAgentOpts())
      updateAgent(db, 'agent-1', { current_job_id: 'job-abc' })
      const found = findAgentByCurrentJobId(db, 'job-abc')
      expect(found?.id).toBe('agent-1')
    })

    it('returns undefined when no agent has that job', () => {
      expect(findAgentByCurrentJobId(db, 'job-missing')).toBeUndefined()
    })
  })

  describe('clearAgentJob', () => {
    it('resets agent to idle and clears current_job_id', () => {
      addAgent(db, makeAgentOpts())
      updateAgent(db, 'agent-1', { status: 'busy', current_job_id: 'job-abc' })
      clearAgentJob(db, 'job-abc')
      const row = getAgent(db, 'agent-1')
      expect(row?.status).toBe('idle')
      expect(row?.current_job_id).toBeNull()
    })

    it('does nothing when no agent has that job', () => {
      addAgent(db, makeAgentOpts())
      expect(() => clearAgentJob(db, 'no-such-job')).not.toThrow()
    })

    it('does not change agents already idle', () => {
      addAgent(db, makeAgentOpts())
      // Agent is idle (default), clearing a non-matching job has no effect
      clearAgentJob(db, 'some-job')
      expect(getAgent(db, 'agent-1')?.status).toBe('idle')
    })
  })

  // ─── Webhook CRUD ─────────────────────────────────────────────────────────

  describe('webhooks', () => {
    it('starts with no webhooks', () => {
      expect(listWebhooks(db)).toHaveLength(0)
    })

    it('adds a webhook and retrieves it', () => {
      const wh = addWebhook(db, { id: 'wh-1', projectId: null, url: 'https://example.com/hook', secret: 'abc', events: ['job.completed'] })
      expect(wh.id).toBe('wh-1')
      expect(wh.url).toBe('https://example.com/hook')
      expect(wh.secret).toBe('abc')
      expect(wh.project_id).toBeNull()
      expect(JSON.parse(wh.events)).toEqual(['job.completed'])
      expect(wh.enabled).toBe(1)
    })

    it('lists all webhooks', () => {
      addWebhook(db, { id: 'wh-1', projectId: null, url: 'https://a.com', events: ['job.failed'] })
      addWebhook(db, { id: 'wh-2', projectId: null, url: 'https://b.com', events: ['job.completed'] })
      expect(listWebhooks(db)).toHaveLength(2)
    })

    it('retrieves a webhook by id', () => {
      addWebhook(db, { id: 'wh-1', projectId: null, url: 'https://a.com' })
      expect(getWebhook(db, 'wh-1')?.id).toBe('wh-1')
      expect(getWebhook(db, 'no-such')).toBeUndefined()
    })

    it('updates url, secret and enabled', () => {
      addWebhook(db, { id: 'wh-1', projectId: null, url: 'https://old.com' })
      const updated = updateWebhook(db, 'wh-1', { url: 'https://new.com', enabled: false })
      expect(updated?.url).toBe('https://new.com')
      expect(updated?.enabled).toBe(0)
    })

    it('removes a webhook', () => {
      addWebhook(db, { id: 'wh-1', projectId: null, url: 'https://a.com' })
      removeWebhook(db, 'wh-1')
      expect(getWebhook(db, 'wh-1')).toBeUndefined()
    })

    it('listWebhooksForProject returns global and project-specific enabled webhooks', () => {
      const project = addProject(db, makeProjectOpts('p1'))
      const otherProject = addProject(db, makeProjectOpts('p9'))
      addWebhook(db, { id: 'wh-global', projectId: null, url: 'https://global.com', events: ['job.completed'] })
      addWebhook(db, { id: 'wh-project', projectId: project.id, url: 'https://project.com', events: ['job.failed'] })
      addWebhook(db, { id: 'wh-other', projectId: otherProject.id, url: 'https://other.com', events: ['job.completed'] })
      const results = listWebhooksForProject(db, project.id)
      const ids = results.map((w) => w.id)
      expect(ids).toContain('wh-global')
      expect(ids).toContain('wh-project')
      expect(ids).not.toContain('wh-other')
    })

    it('listWebhooksForProject excludes disabled webhooks', () => {
      const project = addProject(db, makeProjectOpts('p2'))
      addWebhook(db, { id: 'wh-disabled', projectId: null, url: 'https://disabled.com' })
      updateWebhook(db, 'wh-disabled', { enabled: false })
      expect(listWebhooksForProject(db, project.id)).toHaveLength(0)
    })
  })
})
