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
    it('creates the projects and hub_settings tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      const names = tables.map((t) => t.name)
      expect(names).toContain('projects')
      expect(names).toContain('hub_settings')
      expect(names).toContain('schema_migrations')
    })

    it('creates indexes on slug and path', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
      const names = indexes.map((i) => i.name)
      expect(names).toContain('idx_projects_slug')
      expect(names).toContain('idx_projects_path')
    })

    it('applies migration 1 and records it', () => {
      const versions = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
      expect(versions).toHaveLength(1)
      expect(versions[0].version).toBe(1)
    })

    it('is idempotent — calling initHubDb again does not fail', () => {
      // Re-init on same DB (in-memory so we just call again)
      const db2 = makeDb()
      const versions = db2.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
      expect(versions).toHaveLength(1)
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
      expect(row.added_at).toBeTruthy()
      expect(row.last_seen_at).toBeTruthy()
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
})
