import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, type DbInstance } from './db'
import {
  Profile,
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileValidationError,
  createProfile,
  deleteProfile,
  duplicateProfile,
  getProfile,
  listProfiles,
  persistJobProfile,
  renameProfile,
  resolveProfile,
  snapshotForJob,
  updateProfile,
  validateProfile,
} from './profile-manager'

let projectRoot: string
let db: DbInstance

function baseProfile(name = 'default'): Profile {
  return {
    schemaVersion: 1,
    name,
    description: 'test',
    orchestrator: { model: 'sonnet' },
    agents: [
      { id: 'sr-architect', required: true },
      { id: 'sr-developer', required: true },
      { id: 'sr-reviewer', required: true },
      { id: 'sr-merge-resolver', required: true },
    ],
    routing: [
      { tags: ['frontend'], agent: 'sr-developer' },
      { default: true, agent: 'sr-developer' },
    ],
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-test-'))
  db = initDb(':memory:')
})

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true })
  db.close()
})

describe('validateProfile', () => {
  it('accepts a valid v1 profile', () => {
    expect(() => validateProfile(baseProfile())).not.toThrow()
  })

  it('rejects unknown schemaVersion', () => {
    const p: any = { ...baseProfile(), schemaVersion: 2 }
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects missing baseline agent (sr-reviewer)', () => {
    const p: any = baseProfile()
    p.agents = p.agents.filter((a: any) => a.id !== 'sr-reviewer')
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects invalid model alias', () => {
    const p: any = baseProfile()
    p.orchestrator.model = 'gpt-4'
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('accepts routing without a terminal default rule (rule is optional)', () => {
    const p = baseProfile('custom-x')
    p.routing = [{ tags: ['frontend'], agent: 'sr-developer' }]
    expect(() => validateProfile(p)).not.toThrow()
  })

  it('accepts empty routing on any profile', () => {
    const p = baseProfile('custom-x')
    p.routing = []
    expect(() => validateProfile(p)).not.toThrow()
  })

  it('rejects any profile missing sr-merge-resolver from baseline', () => {
    const p = baseProfile('custom-x')
    p.agents = p.agents.filter((a) => a.id !== 'sr-merge-resolver')
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects custom profiles that drop any baseline agent', () => {
    const p = baseProfile('lean-only')
    p.agents = [{ id: 'sr-developer', required: false }]
    p.routing = []
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects routing that targets an agent not in the chain', () => {
    const p = baseProfile('custom-x')
    p.routing = [{ tags: ['etl'], agent: 'sr-ghost' }]
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects routing when default rule is not last', () => {
    const p = baseProfile()
    p.routing = [
      { default: true, agent: 'sr-developer' },
      { tags: ['frontend'], agent: 'sr-developer' },
    ]
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects routing with multiple default rules', () => {
    const p = baseProfile()
    p.routing = [
      { default: true, agent: 'sr-developer' },
      { default: true, agent: 'sr-reviewer' },
    ]
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('rejects default routing rule that targets an agent other than sr-developer', () => {
    const p = baseProfile('custom-x')
    p.agents.push({ id: 'custom-foo' })
    p.routing = [
      { default: true, agent: 'custom-foo' },
    ]
    expect(() => validateProfile(p)).toThrow(ProfileValidationError)
  })

  it('accepts default routing rule when agent is sr-developer', () => {
    const p = baseProfile()
    p.routing = [{ default: true, agent: 'sr-developer' }]
    expect(() => validateProfile(p)).not.toThrow()
  })
})

describe('CRUD', () => {
  it('creates, reads, lists, updates, deletes', () => {
    createProfile(projectRoot, baseProfile('default'))
    createProfile(projectRoot, baseProfile('data-heavy'))
    const list = listProfiles(projectRoot)
    expect(list.map((p) => p.name).sort()).toEqual(['data-heavy', 'default'])

    const fetched = getProfile(projectRoot, 'default')
    expect(fetched.name).toBe('default')

    const updated = baseProfile('default')
    updated.description = 'updated'
    updateProfile(projectRoot, updated)
    expect(getProfile(projectRoot, 'default').description).toBe('updated')

    deleteProfile(projectRoot, 'data-heavy')
    expect(listProfiles(projectRoot).map((p) => p.name)).toEqual(['default'])
  })

  it('rejects creating a profile that already exists', () => {
    createProfile(projectRoot, baseProfile('default'))
    expect(() => createProfile(projectRoot, baseProfile('default'))).toThrow(ProfileConflictError)
  })

  it('throws on getProfile for unknown name', () => {
    expect(() => getProfile(projectRoot, 'ghost')).toThrow(ProfileNotFoundError)
  })

  it('refuses to delete the default profile', () => {
    createProfile(projectRoot, baseProfile('default'))
    expect(() => deleteProfile(projectRoot, 'default')).toThrow(ProfileValidationError)
  })

  it('duplicate creates a new profile with the new name', () => {
    createProfile(projectRoot, baseProfile('default'))
    duplicateProfile(projectRoot, 'default', 'custom-qa')
    expect(getProfile(projectRoot, 'custom-qa').name).toBe('custom-qa')
  })

  it('rename moves the file and updates the name field', () => {
    createProfile(projectRoot, baseProfile('data-heavy'))
    renameProfile(projectRoot, 'data-heavy', 'custom-data')
    expect(() => getProfile(projectRoot, 'data-heavy')).toThrow(ProfileNotFoundError)
    expect(getProfile(projectRoot, 'custom-data').name).toBe('custom-data')
  })

  it('rejects invalid profile names', () => {
    const p = baseProfile('Invalid-UPPER')
    expect(() => createProfile(projectRoot, p)).toThrow(ProfileValidationError)
  })

  it('skips hidden metadata files when listing', () => {
    createProfile(projectRoot, baseProfile('default'))
    fs.mkdirSync(path.join(projectRoot, '.specrails/profiles'), { recursive: true })
    fs.writeFileSync(
      path.join(projectRoot, '.specrails/profiles/.user-preferred.json'),
      JSON.stringify({ profile: 'default' }, null, 2) + '\n',
      'utf8',
    )
    const names = listProfiles(projectRoot).map((p) => p.name)
    expect(names).not.toContain('.user-preferred')
  })
})

describe('resolveProfile', () => {
  beforeEach(() => {
    createProfile(projectRoot, baseProfile('default'))
    createProfile(projectRoot, baseProfile('data-heavy'))
  })

  it('explicit selection wins', () => {
    const r = resolveProfile(projectRoot, 'data-heavy')
    expect(r?.name).toBe('data-heavy')
  })

  it('falls back to default when no explicit', () => {
    const r = resolveProfile(projectRoot)
    expect(r?.name).toBe('default')
  })

  it('returns null when no profiles exist', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-empty-'))
    try {
      expect(resolveProfile(empty)).toBeNull()
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  it('throws when explicit name does not exist', () => {
    expect(() => resolveProfile(projectRoot, 'ghost')).toThrow(ProfileNotFoundError)
  })
})

describe('snapshotForJob', () => {
  it('writes chmod-400 snapshot at the job path and persists to DB', () => {
    const resolved = { name: 'default', profile: baseProfile('default') }
    const slug = `test-${Date.now()}`
    const jobId = `job-${Date.now()}`
    const snapshotPath = snapshotForJob(slug, jobId, resolved)
    try {
      expect(fs.existsSync(snapshotPath)).toBe(true)
      const stat = fs.statSync(snapshotPath)
      // chmod 400 = 0o400; umask may affect group/other but owner-read must hold
      // and owner-write must NOT hold.
      expect(stat.mode & 0o200).toBe(0) // owner-write is off
      expect(stat.mode & 0o400).toBe(0o400) // owner-read is on

      persistJobProfile(db, jobId, resolved)
      const row = db
        .prepare(
          `SELECT job_id, profile_name, profile_json FROM job_profiles WHERE job_id = ?`,
        )
        .get(jobId) as { job_id: string; profile_name: string; profile_json: string }
      expect(row.profile_name).toBe('default')
      expect(JSON.parse(row.profile_json).name).toBe('default')
    } finally {
      // Make the snapshot writable so the test can clean up on non-root.
      try {
        fs.chmodSync(snapshotPath, 0o600)
        fs.rmSync(path.dirname(path.dirname(snapshotPath)), { recursive: true, force: true })
      } catch {
        // ignore cleanup failures
      }
    }
  })
})
