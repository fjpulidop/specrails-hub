import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import type { DbInstance } from './db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectRow {
  id: string
  slug: string
  name: string
  path: string
  db_path: string
  provider: 'claude' | 'codex'
  added_at: string
  last_seen_at: string
}

export type AgentStatus = 'idle' | 'busy' | 'offline'

export interface AgentRow {
  id: string
  slug: string
  name: string
  role: string | null
  status: AgentStatus
  current_job_id: string | null
  last_heartbeat_at: string | null
  config: string | null
  created_at: string
}

// ─── Hub DB path ──────────────────────────────────────────────────────────────

export function getHubDbPath(): string {
  return path.join(os.homedir(), '.specrails', 'hub.sqlite')
}

function getProjectDbPath(slug: string): string {
  return path.join(os.homedir(), '.specrails', 'projects', slug, 'jobs.sqlite')
}

// ─── Schema migrations ────────────────────────────────────────────────────────

function applyHubMigrations(db: DbInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const appliedVersions = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map((r) => r.version)
  )

  const migrations: Array<() => void> = [
    // Migration 1: projects and hub_settings tables
    () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id           TEXT PRIMARY KEY,
          slug         TEXT NOT NULL UNIQUE,
          name         TEXT NOT NULL,
          path         TEXT NOT NULL UNIQUE,
          db_path      TEXT NOT NULL,
          added_at     TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
        CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

        CREATE TABLE IF NOT EXISTS hub_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    },
    // Migration 2: agents table
    () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agents (
          id                 TEXT PRIMARY KEY,
          slug               TEXT NOT NULL UNIQUE,
          name               TEXT NOT NULL,
          role               TEXT,
          status             TEXT NOT NULL DEFAULT 'idle',
          current_job_id     TEXT,
          last_heartbeat_at  TEXT,
          config             TEXT,
          created_at         TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
        CREATE INDEX IF NOT EXISTS idx_agents_current_job_id ON agents(current_job_id);
      `)
    },
    // Migration 3: add provider column to projects
    () => {
      db.exec(`ALTER TABLE projects ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude'`)
    },
    // Migration 4: webhooks table
    () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          url        TEXT NOT NULL,
          secret     TEXT NOT NULL DEFAULT '',
          events     TEXT NOT NULL DEFAULT '["job.completed","job.failed"]',
          enabled    INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_webhooks_project_id ON webhooks(project_id);
      `)
    },
    // Migration 5: seed terminal-settings defaults under reserved hub_settings keys.
    // Idempotent — uses INSERT OR IGNORE so re-running never overwrites a user's
    // chosen value. See server/terminal-settings.ts for the typed access layer.
    () => {
      const seed = db.prepare('INSERT OR IGNORE INTO hub_settings (key, value) VALUES (?, ?)')
      seed.run('terminal.fontFamily', "'DM Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace")
      seed.run('terminal.fontSize', '12')
      seed.run('terminal.renderMode', 'auto')
      seed.run('terminal.copyOnSelect', 'false')
      seed.run('terminal.shellIntegrationEnabled', 'true')
      seed.run('terminal.notifyOnCompletion', 'true')
      seed.run('terminal.imageRendering', 'true')
      seed.run('terminal.longCommandThresholdMs', '60000')
    },
    // Migration 6: seed browserShortcutUrl default for the new Browser shortcut button.
    () => {
      db.prepare('INSERT OR IGNORE INTO hub_settings (key, value) VALUES (?, ?)').run(
        'terminal.browserShortcutUrl', 'https://specrails.dev',
      )
    },
    // Migration 7: seed quickScript default for the Quick Script shortcut button.
    // Uses the OS username so the default greets you by name.
    () => {
      let username = 'friend'
      try { username = os.userInfo().username || 'friend' } catch { /* keep fallback */ }
      const value = `echo "Wake up, ${username} (edit this snippet in settings to help your local development)"`
      db.prepare('INSERT OR IGNORE INTO hub_settings (key, value) VALUES (?, ?)').run(
        'terminal.quickScript', value,
      )
    },
  ]

  for (let i = 0; i < migrations.length; i++) {
    const version = i + 1
    if (!appliedVersions.has(version)) {
      migrations[i]()
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(version)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initHubDb(dbPath: string = getHubDbPath()): DbInstance {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyHubMigrations(db)
  return db
}

export function listProjects(db: DbInstance): ProjectRow[] {
  return db.prepare(
    'SELECT * FROM projects ORDER BY added_at ASC'
  ).all() as ProjectRow[]
}

export function getProject(db: DbInstance, id: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

export function getProjectBySlug(db: DbInstance, slug: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined
}

export function getProjectByPath(db: DbInstance, projectPath: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as ProjectRow | undefined
}

export function addProject(
  db: DbInstance,
  project: { id: string; slug: string; name: string; path: string; provider?: 'claude' | 'codex' }
): ProjectRow {
  const dbPath = getProjectDbPath(project.slug)
  const provider = project.provider ?? 'claude'
  db.prepare(`
    INSERT INTO projects (id, slug, name, path, db_path, provider)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(project.id, project.slug, project.name, project.path, dbPath, provider)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as ProjectRow
}

export function removeProject(db: DbInstance, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function touchProject(db: DbInstance, id: string): void {
  db.prepare(
    "UPDATE projects SET last_seen_at = datetime('now') WHERE id = ?"
  ).run(id)
}

export function getHubSetting(db: DbInstance, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM hub_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setHubSetting(db: DbInstance, key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO hub_settings (key, value) VALUES (?, ?)'
  ).run(key, value)
}

// ─── Setup session persistence ────────────────────────────────────────────────

export function setProjectSetupSession(db: DbInstance, projectId: string, sessionId: string): void {
  setHubSetting(db, `setup_session:${projectId}`, sessionId)
}

export function getProjectSetupSession(db: DbInstance, projectId: string): string | undefined {
  return getHubSetting(db, `setup_session:${projectId}`)
}

export function clearProjectSetupSession(db: DbInstance, projectId: string): void {
  db.prepare('DELETE FROM hub_settings WHERE key = ?').run(`setup_session:${projectId}`)
}

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export function listAgents(db: DbInstance): AgentRow[] {
  return db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as AgentRow[]
}

export function getAgent(db: DbInstance, id: string): AgentRow | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
}

export function getAgentBySlug(db: DbInstance, slug: string): AgentRow | undefined {
  return db.prepare('SELECT * FROM agents WHERE slug = ?').get(slug) as AgentRow | undefined
}

export function addAgent(
  db: DbInstance,
  agent: { id: string; slug: string; name: string; role?: string; config?: string }
): AgentRow {
  db.prepare(`
    INSERT INTO agents (id, slug, name, role, config)
    VALUES (?, ?, ?, ?, ?)
  `).run(agent.id, agent.slug, agent.name, agent.role ?? null, agent.config ?? null)
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as AgentRow
}

export function updateAgent(
  db: DbInstance,
  id: string,
  updates: Partial<Pick<AgentRow, 'name' | 'role' | 'status' | 'current_job_id' | 'last_heartbeat_at' | 'config'>>
): AgentRow | undefined {
  const fields = Object.keys(updates) as (keyof typeof updates)[]
  if (fields.length === 0) return getAgent(db, id)

  const setClauses = fields.map((f) => `${f} = ?`).join(', ')
  const values = fields.map((f) => updates[f] ?? null)
  db.prepare(`UPDATE agents SET ${setClauses} WHERE id = ?`).run(...values, id)
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
}

export function findAgentByCurrentJobId(db: DbInstance, jobId: string): AgentRow | undefined {
  return db.prepare('SELECT * FROM agents WHERE current_job_id = ?').get(jobId) as AgentRow | undefined
}

export function clearAgentJob(db: DbInstance, jobId: string): void {
  db.prepare(
    "UPDATE agents SET status = 'idle', current_job_id = NULL WHERE current_job_id = ? AND status != 'idle'"
  ).run(jobId)
}

// ─── Webhook CRUD ─────────────────────────────────────────────────────────────

export type WebhookEvent = 'job.completed' | 'job.failed' | 'job.canceled' | 'daily_budget_exceeded' | 'hub_daily_budget_exceeded'

export interface WebhookRow {
  id: string
  project_id: string | null
  url: string
  secret: string
  events: string // JSON array of WebhookEvent
  enabled: number // 1 = enabled, 0 = disabled
  created_at: string
  updated_at: string
}

export function listWebhooks(db: DbInstance): WebhookRow[] {
  return db.prepare('SELECT * FROM webhooks ORDER BY created_at ASC').all() as WebhookRow[]
}

export function listWebhooksForProject(db: DbInstance, projectId: string): WebhookRow[] {
  return db.prepare(
    'SELECT * FROM webhooks WHERE enabled = 1 AND (project_id IS NULL OR project_id = ?) ORDER BY created_at ASC'
  ).all(projectId) as WebhookRow[]
}

export function getWebhook(db: DbInstance, id: string): WebhookRow | undefined {
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow | undefined
}

export function addWebhook(
  db: DbInstance,
  webhook: { id: string; projectId: string | null; url: string; secret?: string; events?: WebhookEvent[] }
): WebhookRow {
  const events = JSON.stringify(webhook.events ?? ['job.completed', 'job.failed'])
  db.prepare(`
    INSERT INTO webhooks (id, project_id, url, secret, events)
    VALUES (?, ?, ?, ?, ?)
  `).run(webhook.id, webhook.projectId ?? null, webhook.url, webhook.secret ?? '', events)
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhook.id) as WebhookRow
}

export function updateWebhook(
  db: DbInstance,
  id: string,
  updates: { url?: string; secret?: string; events?: WebhookEvent[]; enabled?: boolean }
): WebhookRow | undefined {
  const fields: string[] = []
  const values: unknown[] = []
  if (updates.url !== undefined) { fields.push('url = ?'); values.push(updates.url) }
  if (updates.secret !== undefined) { fields.push('secret = ?'); values.push(updates.secret) }
  if (updates.events !== undefined) { fields.push('events = ?'); values.push(JSON.stringify(updates.events)) }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0) }
  if (fields.length === 0) return getWebhook(db, id)
  fields.push("updated_at = datetime('now')")
  db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow | undefined
}

export function removeWebhook(db: DbInstance, id: string): void {
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(id)
}
