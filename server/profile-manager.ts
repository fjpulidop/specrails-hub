import fs from 'fs'
import os from 'os'
import path from 'path'
import Ajv2020 from 'ajv/dist/2020'
import type { ValidateFunction } from 'ajv'
import type { DbInstance } from './db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProfileAgent {
  id: string
  model?: 'sonnet' | 'opus' | 'haiku'
  required?: boolean
}

export interface ProfileRoutingTagRule {
  tags: string[]
  agent: string
}

export interface ProfileRoutingDefaultRule {
  default: true
  agent: string
}

export type ProfileRoutingRule = ProfileRoutingTagRule | ProfileRoutingDefaultRule

export interface Profile {
  schemaVersion: 1
  name: string
  description?: string
  orchestrator: { model: 'sonnet' | 'opus' | 'haiku' }
  agents: ProfileAgent[]
  routing: ProfileRoutingRule[]
}

export interface ProfileListEntry {
  name: string
  description?: string
  isDefault: boolean
  updatedAt: number
}

// ─── Schema loading ──────────────────────────────────────────────────────────

const SCHEMA_PATH = path.resolve(__dirname, 'schemas', 'profile.v1.json')

let cachedValidator: ValidateFunction<Profile> | null = null

function getValidator(): ValidateFunction<Profile> {
  if (cachedValidator) return cachedValidator
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  cachedValidator = ajv.compile<Profile>(schema)
  return cachedValidator
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ProfileValidationError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(`profile validation failed:\n${errors.map((e) => `  ${e}`).join('\n')}`)
    this.name = 'ProfileValidationError'
    this.errors = errors
  }
}

export class ProfileNotFoundError extends Error {
  constructor(name: string) {
    super(`profile not found: ${name}`)
    this.name = 'ProfileNotFoundError'
  }
}

export class ProfileConflictError extends Error {
  constructor(name: string) {
    super(`profile already exists: ${name}`)
    this.name = 'ProfileConflictError'
  }
}

// ─── Path helpers ────────────────────────────────────────────────────────────

function profilesDir(projectPath: string): string {
  return path.join(projectPath, '.specrails', 'profiles')
}

function profilePath(projectPath: string, name: string): string {
  return path.join(profilesDir(projectPath), `${name}.json`)
}

function preferredPath(projectPath: string): string {
  return path.join(profilesDir(projectPath), '.user-preferred.json')
}

function jobSnapshotPath(slug: string, jobId: string): string {
  return path.join(os.homedir(), '.specrails', 'projects', slug, 'jobs', jobId, 'profile.json')
}

// ─── Name validation ─────────────────────────────────────────────────────────

const NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/

function assertValidName(name: string): void {
  if (!NAME_REGEX.test(name)) {
    throw new ProfileValidationError([`invalid profile name '${name}' (must match ${NAME_REGEX})`])
  }
  if (name === '.user-preferred') {
    throw new ProfileValidationError(["'.user-preferred' is reserved"])
  }
}

// ─── Structural extra checks (beyond JSON schema) ────────────────────────────

function validateStructural(profile: Profile): void {
  // Custom profiles (non-default) may omit routing entirely, or include any
  // combination of rules — maximum flexibility. When rules exist we only
  // enforce soft structural invariants:
  //   - at most one `default: true` terminal rule
  //   - if a default rule exists, it is the last element
  //   - every rule's agent target is present in agents[]
  const defaults = profile.routing.filter((r): r is ProfileRoutingDefaultRule =>
    'default' in r && r.default === true,
  )
  if (defaults.length > 1) {
    throw new ProfileValidationError([
      `routing may contain at most one entry with 'default: true' (found ${defaults.length})`,
    ])
  }
  if (defaults.length === 1 && profile.routing.length > 0) {
    const last = profile.routing[profile.routing.length - 1]
    if (!('default' in last) || last.default !== true) {
      throw new ProfileValidationError([
        "when a 'default: true' routing rule exists it must be the last element of 'routing'",
      ])
    }
  }
  const agentIds = new Set(profile.agents.map((a) => a.id))
  for (const rule of profile.routing) {
    if (!agentIds.has(rule.agent)) {
      throw new ProfileValidationError([
        `routing references agent '${rule.agent}' which is not in this profile's chain`,
      ])
    }
  }
  // The shipped `default` profile is additionally expected to include the
  // baseline quartet. Custom profiles skip this check.
  if (profile.name === 'default' || profile.name === 'project-default') {
    const baseline = ['sr-architect', 'sr-developer', 'sr-reviewer', 'sr-merge-resolver']
    const missing = baseline.filter((id) => !agentIds.has(id))
    if (missing.length > 0) {
      throw new ProfileValidationError([
        `the default profile must include baseline agents: missing ${missing.join(', ')}`,
      ])
    }
  }
}

export function validateProfile(raw: unknown): Profile {
  const validate = getValidator()
  if (!validate(raw)) {
    const msgs = (validate.errors || []).map(
      (e) => `${e.instancePath || '/'} ${e.message} (${JSON.stringify(e.params)})`,
    )
    throw new ProfileValidationError(msgs)
  }
  const profile = raw as Profile
  validateStructural(profile)
  return profile
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function listProfiles(projectPath: string): ProfileListEntry[] {
  const dir = profilesDir(projectPath)
  if (!fs.existsSync(dir)) return []
  const entries: ProfileListEntry[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    if (file === '.user-preferred.json') continue
    if (file.startsWith('.')) continue
    const name = file.slice(0, -'.json'.length)
    const full = path.join(dir, file)
    try {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
      const stat = fs.statSync(full)
      entries.push({
        name,
        description: typeof raw?.description === 'string' ? raw.description : undefined,
        isDefault: name === 'default' || name === 'project-default',
        updatedAt: Math.floor(stat.mtimeMs),
      })
    } catch {
      // Skip unparseable files silently; the caller can surface via getProfile.
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function getProfile(projectPath: string, name: string): Profile {
  assertValidName(name)
  const full = profilePath(projectPath, name)
  if (!fs.existsSync(full)) {
    throw new ProfileNotFoundError(name)
  }
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
  return validateProfile(raw)
}

export function createProfile(projectPath: string, profile: Profile): void {
  assertValidName(profile.name)
  validateProfile(profile)
  const full = profilePath(projectPath, profile.name)
  if (fs.existsSync(full)) {
    throw new ProfileConflictError(profile.name)
  }
  fs.mkdirSync(profilesDir(projectPath), { recursive: true })
  fs.writeFileSync(full, JSON.stringify(profile, null, 2) + '\n', 'utf8')
}

export function updateProfile(projectPath: string, profile: Profile): void {
  assertValidName(profile.name)
  validateProfile(profile)
  const full = profilePath(projectPath, profile.name)
  if (!fs.existsSync(full)) {
    throw new ProfileNotFoundError(profile.name)
  }
  fs.writeFileSync(full, JSON.stringify(profile, null, 2) + '\n', 'utf8')
}

export function deleteProfile(projectPath: string, name: string): void {
  assertValidName(name)
  if (name === 'default' || name === 'project-default') {
    throw new ProfileValidationError(['cannot delete the default profile'])
  }
  const full = profilePath(projectPath, name)
  if (!fs.existsSync(full)) {
    throw new ProfileNotFoundError(name)
  }
  fs.unlinkSync(full)
}

export function duplicateProfile(
  projectPath: string,
  sourceName: string,
  newName: string,
): Profile {
  const source = getProfile(projectPath, sourceName)
  const copy: Profile = { ...source, name: newName }
  createProfile(projectPath, copy)
  return copy
}

export function renameProfile(
  projectPath: string,
  fromName: string,
  toName: string,
): Profile {
  const source = getProfile(projectPath, fromName)
  assertValidName(toName)
  if (fs.existsSync(profilePath(projectPath, toName))) {
    throw new ProfileConflictError(toName)
  }
  const renamed: Profile = { ...source, name: toName }
  validateProfile(renamed)
  fs.writeFileSync(profilePath(projectPath, toName), JSON.stringify(renamed, null, 2) + '\n', 'utf8')
  fs.unlinkSync(profilePath(projectPath, fromName))
  return renamed
}

// ─── Preference (per-developer) ──────────────────────────────────────────────

export interface UserPreferred {
  profile: string
}

export function getUserPreferred(projectPath: string): UserPreferred | null {
  const full = preferredPath(projectPath)
  if (!fs.existsSync(full)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
    if (typeof raw?.profile === 'string') return { profile: raw.profile }
  } catch {
    return null
  }
  return null
}

export function setUserPreferred(projectPath: string, name: string): void {
  assertValidName(name)
  fs.mkdirSync(profilesDir(projectPath), { recursive: true })
  fs.writeFileSync(preferredPath(projectPath), JSON.stringify({ profile: name }, null, 2) + '\n', 'utf8')
  // Add to .gitignore if not already present.
  const gitignore = path.join(projectPath, '.gitignore')
  const entry = '.specrails/profiles/.user-preferred.json'
  try {
    const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : ''
    if (!current.split(/\r?\n/).includes(entry)) {
      const suffix = current.length === 0 || current.endsWith('\n') ? '' : '\n'
      fs.appendFileSync(gitignore, `${suffix}${entry}\n`)
    }
  } catch {
    // Non-fatal: the project may not have a writable .gitignore.
  }
}

// ─── Resolution (pick which profile applies for an invocation) ───────────────

export interface ResolvedProfile {
  name: string
  profile: Profile
}

/**
 * Resolve the profile to snapshot for a new rail invocation.
 *
 * Precedence:
 *   1. Explicit selection passed by the caller (launch-dialog override).
 *   2. Per-developer preference from `.user-preferred.json`.
 *   3. The profile named `default` (or `project-default`).
 *
 * Returns `null` if the project has no profiles and no fallback — the caller
 * should treat this as legacy mode (do not inject `SPECRAILS_PROFILE_PATH`).
 */
export function resolveProfile(
  projectPath: string,
  explicit?: string | null,
): ResolvedProfile | null {
  const tryName = (n: string): ResolvedProfile | null => {
    try {
      return { name: n, profile: getProfile(projectPath, n) }
    } catch (e) {
      if (e instanceof ProfileNotFoundError) return null
      throw e
    }
  }

  if (explicit) {
    const resolved = tryName(explicit)
    if (resolved) return resolved
    throw new ProfileNotFoundError(explicit)
  }

  const preferred = getUserPreferred(projectPath)
  if (preferred) {
    const resolved = tryName(preferred.profile)
    if (resolved) return resolved
    // fall through — stale preference, ignore
  }

  return tryName('default') ?? tryName('project-default')
}

// ─── Snapshot-per-job ────────────────────────────────────────────────────────

/**
 * Write the resolved profile's bytes to a job-scoped snapshot. The snapshot
 * is chmod-400 so mid-run edits are impossible. Returns the absolute path;
 * the caller must set `SPECRAILS_PROFILE_PATH` in the spawn env.
 */
export function snapshotForJob(
  slug: string,
  jobId: string,
  resolved: ResolvedProfile,
): string {
  const snapshotPath = jobSnapshotPath(slug, jobId)
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  const body = JSON.stringify(resolved.profile, null, 2) + '\n'
  fs.writeFileSync(snapshotPath, body, { encoding: 'utf8', mode: 0o400 })
  return snapshotPath
}

/**
 * Persist job → profile in the per-project SQLite so Analytics can report
 * and so the snapshot survives filesystem mishaps.
 */
export function persistJobProfile(
  db: DbInstance,
  jobId: string,
  resolved: ResolvedProfile,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO job_profiles (job_id, profile_name, profile_json, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(jobId, resolved.name, JSON.stringify(resolved.profile), Date.now())
}
