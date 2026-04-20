import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import type { JobRow, EventRow, StatsRow, JobStatus, JobPriority, ChatConversationRow, ChatMessageRow, ActivityItem } from './types'

// ─── Proposal types ───────────────────────────────────────────────────────────

export interface ProposalRow {
  id: string
  idea: string
  session_id: string | null
  status: string
  result_markdown: string | null
  issue_url: string | null
  created_at: string
  updated_at: string
}

export type DbInstance = InstanceType<typeof Database>

// ─── Internal types ──────────────────────────────────────────────────────────

export interface NewJob {
  id: string
  command: string
  started_at: string
  priority?: JobPriority
  depends_on_job_id?: string | null
  pipeline_id?: string | null
}

export interface JobResult {
  exit_code: number
  status: JobStatus
  tokens_in?: number
  tokens_out?: number
  tokens_cache_read?: number
  tokens_cache_create?: number
  total_cost_usd?: number
  num_turns?: number
  model?: string
  duration_ms?: number
  duration_api_ms?: number
  session_id?: string
}

export interface AppEvent {
  event_type: string
  source?: string | null
  payload: string
}

export interface ListJobsOpts {
  limit?: number
  offset?: number
  status?: string
  from?: string
  to?: string
}

// ─── Migrations ──────────────────────────────────────────────────────────────

type Migration = (db: DbInstance) => void

const MIGRATIONS: Migration[] = [
  // Migration 1: initial schema
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id                   TEXT    PRIMARY KEY,
        command              TEXT    NOT NULL,
        started_at           TEXT    NOT NULL,
        finished_at          TEXT,
        status               TEXT    NOT NULL DEFAULT 'running',
        exit_code            INTEGER,
        tokens_in            INTEGER,
        tokens_out           INTEGER,
        tokens_cache_read    INTEGER,
        tokens_cache_create  INTEGER,
        total_cost_usd       REAL,
        num_turns            INTEGER,
        model                TEXT,
        duration_ms          INTEGER,
        duration_api_ms      INTEGER,
        session_id           TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id      TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        seq         INTEGER NOT NULL,
        event_type  TEXT    NOT NULL,
        source      TEXT,
        payload     TEXT    NOT NULL,
        timestamp   TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_job_id ON events(job_id);

      CREATE TABLE IF NOT EXISTS job_phases (
        job_id      TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        phase       TEXT    NOT NULL,
        state       TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL,
        PRIMARY KEY (job_id, phase)
      );
    `)
  },

  // Migration 2: add queue_position column to jobs
  (db) => {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN queue_position INTEGER;
    `)
  },

  // Migration 3: add queue_state table for persisting queue config (e.g., paused)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS queue_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO queue_state (key, value) VALUES ('paused', 'false');
    `)
  },

  // Migration 4: chat conversations and messages
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id           TEXT PRIMARY KEY,
        title        TEXT,
        model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
        session_id   TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content         TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);
    `)
  },

  // Migration 5: proposals table
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id              TEXT    PRIMARY KEY,
        idea            TEXT    NOT NULL,
        session_id      TEXT,
        status          TEXT    NOT NULL DEFAULT 'input',
        result_markdown TEXT,
        issue_url       TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at);
    `)
  },

  // Migration 6: job templates
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_templates (
        id          TEXT NOT NULL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        commands    TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_job_templates_created_at ON job_templates(created_at);
    `)
  },

  // Migration 7: add priority column to jobs
  (db) => {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
    `)
  },

  // Migration 8: job dependencies and pipelines
  (db) => {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN depends_on_job_id TEXT REFERENCES jobs(id);
      ALTER TABLE jobs ADD COLUMN pipeline_id TEXT;
      ALTER TABLE jobs ADD COLUMN skip_reason TEXT;
      CREATE INDEX IF NOT EXISTS idx_jobs_depends_on ON jobs(depends_on_job_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id ON jobs(pipeline_id);
    `)
  },

  // Migration 9: rails table for Rails board job integration
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rails (
        rail_index  INTEGER NOT NULL,
        ticket_id   INTEGER NOT NULL,
        position    INTEGER NOT NULL,
        mode        TEXT    NOT NULL DEFAULT 'implement',
        PRIMARY KEY (rail_index, ticket_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rails_rail_index ON rails(rail_index);
    `)
  },

  // Migration 10: pipeline telemetry blob and summary tables.
  // The pipelineTelemetryEnabled flag reuses the existing queue_state key-value
  // store (key = 'config.pipeline_telemetry_enabled') so no schema change needed
  // for settings; only the raw-data tables are new.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_blobs (
        jobId      TEXT    PRIMARY KEY,
        path       TEXT,
        byteSize   INTEGER NOT NULL DEFAULT 0,
        startedAt  INTEGER,
        endedAt    INTEGER,
        state      TEXT    NOT NULL DEFAULT 'active'
                           CHECK(state IN ('active','compacted','expired'))
      );

      CREATE TABLE IF NOT EXISTS telemetry_summaries (
        jobId        TEXT    NOT NULL,
        phase        TEXT    NOT NULL,
        durationMs   INTEGER,
        tokensInput  INTEGER,
        tokensOutput INTEGER,
        tokensCache  INTEGER,
        toolCalls    TEXT,
        apiErrors    INTEGER,
        costUsd      REAL,
        PRIMARY KEY (jobId, phase)
      );
    `)
  },
]

function applyMigrations(db: DbInstance): void {
  // Ensure the migrations table exists (migration 1 creates it, but we need
  // it before we can read from it)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const appliedVersions = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map((r) => r.version)
  )

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1
    if (!appliedVersions.has(version)) {
      MIGRATIONS[i](db)
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(version)
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initDb(dbPath: string): DbInstance {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath)
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyMigrations(db)

  // Orphan sweep: mark any running jobs as failed on startup
  db.prepare(
    "UPDATE jobs SET status = 'failed', finished_at = ? WHERE status = 'running'"
  ).run(new Date().toISOString())

  // Orphan sweep: cancel any in-flight proposals from a previous server session
  db.prepare(
    "UPDATE proposals SET status = 'cancelled', updated_at = ? WHERE status IN ('exploring', 'refining')"
  ).run(new Date().toISOString())

  return db
}

export function createJob(db: DbInstance, job: NewJob): void {
  // INSERT OR IGNORE handles the case where the job row already exists (restored from DB
  // after server restart). The UPDATE that follows always sets status and started_at.
  db.prepare(
    'INSERT OR IGNORE INTO jobs (id, command, started_at, status, priority, depends_on_job_id, pipeline_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(job.id, job.command, job.started_at, 'running', job.priority ?? 'normal', job.depends_on_job_id ?? null, job.pipeline_id ?? null)
  db.prepare(
    'UPDATE jobs SET status = ?, started_at = ? WHERE id = ?'
  ).run('running', job.started_at, job.id)
}

export function finishJob(
  db: DbInstance,
  jobId: string,
  result: JobResult
): void {
  db.prepare(`
    UPDATE jobs SET
      status              = ?,
      exit_code           = ?,
      finished_at         = ?,
      tokens_in           = ?,
      tokens_out          = ?,
      tokens_cache_read   = ?,
      tokens_cache_create = ?,
      total_cost_usd      = ?,
      num_turns           = ?,
      model               = ?,
      duration_ms         = ?,
      duration_api_ms     = ?,
      session_id          = ?
    WHERE id = ?
  `).run(
    result.status,
    result.exit_code,
    new Date().toISOString(),
    result.tokens_in ?? null,
    result.tokens_out ?? null,
    result.tokens_cache_read ?? null,
    result.tokens_cache_create ?? null,
    result.total_cost_usd ?? null,
    result.num_turns ?? null,
    result.model ?? null,
    result.duration_ms ?? null,
    result.duration_api_ms ?? null,
    result.session_id ?? null,
    jobId,
  )
}

export function appendEvent(
  db: DbInstance,
  jobId: string,
  seq: number,
  event: AppEvent
): void {
  db.prepare(
    'INSERT INTO events (job_id, seq, event_type, source, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(jobId, seq, event.event_type, event.source ?? null, event.payload)
}

export function upsertPhase(
  db: DbInstance,
  jobId: string,
  phase: string,
  state: string
): void {
  db.prepare(
    'INSERT OR REPLACE INTO job_phases (job_id, phase, state, updated_at) VALUES (?, ?, ?, ?)'
  ).run(jobId, phase, state, new Date().toISOString())
}

export function listJobs(
  db: DbInstance,
  opts: ListJobsOpts
): { jobs: JobRow[]; total: number } {
  const limit = Math.min(opts.limit ?? 50, 200)
  const offset = opts.offset ?? 0

  const conditions: string[] = []
  const params: unknown[] = []

  if (opts.status) {
    conditions.push('status = ?')
    params.push(opts.status)
  }
  if (opts.from) {
    conditions.push('started_at >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    conditions.push('started_at <= ?')
    params.push(opts.to)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM jobs ${where}`)
    .get(...params) as { count: number }

  const jobs = db
    .prepare(
      `SELECT * FROM jobs ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as JobRow[]

  return { jobs, total: countRow.count }
}

export function getJob(
  db: DbInstance,
  jobId: string
): JobRow | undefined {
  return db
    .prepare('SELECT * FROM jobs WHERE id = ?')
    .get(jobId) as JobRow | undefined
}

export function getJobEvents(
  db: DbInstance,
  jobId: string
): EventRow[] {
  return db
    .prepare('SELECT * FROM events WHERE job_id = ? ORDER BY seq ASC')
    .all(jobId) as EventRow[]
}

export function deleteJob(db: DbInstance, jobId: string): void {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId)
}

export function purgeJobs(
  db: DbInstance,
  opts?: { from?: string; to?: string }
): number {
  const conditions: string[] = ["status IN ('completed', 'failed', 'canceled', 'zombie_terminated', 'skipped')"]
  const params: unknown[] = []

  if (opts?.from) {
    conditions.push('started_at >= ?')
    params.push(opts.from)
  }
  if (opts?.to) {
    conditions.push('started_at <= ?')
    params.push(opts.to)
  }

  const where = conditions.join(' AND ')

  // Delete associated events first
  db.prepare(`DELETE FROM events WHERE job_id IN (SELECT id FROM jobs WHERE ${where})`).run(...params)
  // Delete associated phases
  db.prepare(`DELETE FROM job_phases WHERE job_id IN (SELECT id FROM jobs WHERE ${where})`).run(...params)
  // Delete the jobs
  const result = db.prepare(`DELETE FROM jobs WHERE ${where}`).run(...params)
  return result.changes
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export interface ActivityQueryOpts {
  limit: number
  before?: string
}

export function getProjectActivity(db: DbInstance, opts: ActivityQueryOpts): ActivityItem[] {
  const limit = Math.min(opts.limit, 100)
  const conditions: string[] = []
  const params: unknown[] = []

  if (opts.before) {
    conditions.push('started_at < ?')
    params.push(opts.before)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const jobs = db
    .prepare(`SELECT * FROM jobs ${where} ORDER BY started_at DESC LIMIT ?`)
    .all(...params, limit) as JobRow[]

  return jobs.map((j) => {
    const isTerminal = j.status === 'completed' || j.status === 'failed' || j.status === 'canceled' || j.status === 'zombie_terminated'
    const type: ActivityItem['type'] =
      j.status === 'completed' ? 'job_completed'
      : j.status === 'failed' ? 'job_failed'
      : (j.status === 'canceled' || j.status === 'zombie_terminated') ? 'job_canceled'
      : 'job_started'
    const timestamp = isTerminal && j.finished_at ? j.finished_at : j.started_at
    const shortCmd = j.command.length > 60 ? j.command.slice(0, 57) + '...' : j.command
    const summary =
      type === 'job_started' ? `Job started: ${shortCmd}`
      : type === 'job_completed' ? `Job completed: ${shortCmd}`
      : type === 'job_failed' ? `Job failed: ${shortCmd}`
      : j.status === 'zombie_terminated' ? `Job auto-terminated (zombie): ${shortCmd}`
      : `Job canceled: ${shortCmd}`
    return {
      id: j.id,
      type,
      jobId: j.id,
      jobCommand: j.command,
      timestamp,
      summary,
      costUsd: isTerminal ? (j.total_cost_usd ?? null) : null,
    }
  })
}

// ─── Chat DB functions ────────────────────────────────────────────────────────

export function createConversation(db: DbInstance, opts: { id: string; model: string }): void {
  db.prepare(
    'INSERT INTO chat_conversations (id, model) VALUES (?, ?)'
  ).run(opts.id, opts.model)
}

export function listConversations(db: DbInstance): ChatConversationRow[] {
  return db.prepare(
    'SELECT * FROM chat_conversations ORDER BY updated_at DESC'
  ).all() as ChatConversationRow[]
}

export function getConversation(db: DbInstance, id: string): ChatConversationRow | undefined {
  return db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id) as ChatConversationRow | undefined
}

export function deleteConversation(db: DbInstance, id: string): void {
  db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(id)
}

export function updateConversation(
  db: DbInstance,
  id: string,
  patch: { title?: string; session_id?: string; model?: string }
): void {
  const sets: string[] = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title) }
  if (patch.session_id !== undefined) { sets.push('session_id = ?'); params.push(patch.session_id) }
  if (patch.model !== undefined) { sets.push('model = ?'); params.push(patch.model) }
  params.push(id)
  db.prepare(`UPDATE chat_conversations SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export function addMessage(
  db: DbInstance,
  msg: { conversation_id: string; role: 'user' | 'assistant'; content: string }
): ChatMessageRow {
  const result = db.prepare(
    'INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)'
  ).run(msg.conversation_id, msg.role, msg.content)
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(Number(result.lastInsertRowid)) as ChatMessageRow
}

export function getMessages(db: DbInstance, conversationId: string): ChatMessageRow[] {
  return db.prepare(
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC'
  ).all(conversationId) as ChatMessageRow[]
}

// ─── Proposal DB functions ────────────────────────────────────────────────────

export function createProposal(db: DbInstance, opts: { id: string; idea: string }): void {
  db.prepare(
    'INSERT INTO proposals (id, idea, status) VALUES (?, ?, ?)'
  ).run(opts.id, opts.idea, 'input')
}

export function getProposal(db: DbInstance, id: string): ProposalRow | undefined {
  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as ProposalRow | undefined
}

export function listProposals(
  db: DbInstance,
  opts?: { limit?: number; offset?: number }
): { proposals: ProposalRow[]; total: number } {
  const limit = Math.min(opts?.limit ?? 20, 100)
  const offset = opts?.offset ?? 0

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM proposals')
    .get() as { count: number }

  const proposals = db
    .prepare('SELECT * FROM proposals ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as ProposalRow[]

  return { proposals, total: countRow.count }
}

export function updateProposal(
  db: DbInstance,
  id: string,
  patch: {
    status?: string
    session_id?: string
    result_markdown?: string
    issue_url?: string
  }
): void {
  const sets: string[] = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  if (patch.status !== undefined) { sets.push('status = ?'); params.push(patch.status) }
  if (patch.session_id !== undefined) { sets.push('session_id = ?'); params.push(patch.session_id) }
  if (patch.result_markdown !== undefined) { sets.push('result_markdown = ?'); params.push(patch.result_markdown) }
  if (patch.issue_url !== undefined) { sets.push('issue_url = ?'); params.push(patch.issue_url) }
  params.push(id)
  db.prepare(`UPDATE proposals SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export function deleteProposal(db: DbInstance, id: string): void {
  db.prepare('DELETE FROM proposals WHERE id = ?').run(id)
}

// ─── Job Template DB functions ────────────────────────────────────────────────

export interface JobTemplateRow {
  id: string
  name: string
  description: string | null
  commands: string  // JSON-encoded string[]
  created_at: string
  updated_at: string
}

export function createTemplate(
  db: DbInstance,
  t: { id: string; name: string; description?: string; commands: string[] }
): void {
  db.prepare(
    'INSERT INTO job_templates (id, name, description, commands) VALUES (?, ?, ?, ?)'
  ).run(t.id, t.name, t.description ?? null, JSON.stringify(t.commands))
}

export function listTemplates(db: DbInstance): JobTemplateRow[] {
  return db.prepare('SELECT * FROM job_templates ORDER BY created_at DESC').all() as JobTemplateRow[]
}

export function getTemplate(db: DbInstance, id: string): JobTemplateRow | undefined {
  return db.prepare('SELECT * FROM job_templates WHERE id = ?').get(id) as JobTemplateRow | undefined
}

export function updateTemplate(
  db: DbInstance,
  id: string,
  patch: { name?: string; description?: string | null; commands?: string[] }
): void {
  const sets: string[] = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name) }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description) }
  if (patch.commands !== undefined) { sets.push('commands = ?'); params.push(JSON.stringify(patch.commands)) }
  params.push(id)
  db.prepare(`UPDATE job_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export function deleteTemplate(db: DbInstance, id: string): void {
  db.prepare('DELETE FROM job_templates WHERE id = ?').run(id)
}

export function skipJob(db: DbInstance, jobId: string, reason: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'skipped', skip_reason = ?, finished_at = ? WHERE id = ?`
  ).run(reason, new Date().toISOString(), jobId)
}

export function getPipelineJobs(db: DbInstance, pipelineId: string): JobRow[] {
  return db.prepare(
    'SELECT * FROM jobs WHERE pipeline_id = ? ORDER BY queue_position ASC, started_at ASC'
  ).all(pipelineId) as JobRow[]
}

export function getStats(db: DbInstance): StatsRow {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const totalRow = db.prepare(`
    SELECT
      COUNT(*) as totalJobs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedJobs,
      SUM(total_cost_usd) as totalCostUsd,
      AVG(duration_ms) as avgDurationMs
    FROM jobs
  `).get() as { totalJobs: number; failedJobs: number; totalCostUsd: number | null; avgDurationMs: number | null }

  const todayRow = db.prepare(`
    SELECT
      COUNT(*) as jobsToday,
      SUM(total_cost_usd) as costToday
    FROM jobs
    WHERE strftime('%Y-%m-%d', started_at) = ?
  `).get(today) as { jobsToday: number; costToday: number | null }

  return {
    totalJobs: totalRow.totalJobs,
    failedJobs: totalRow.failedJobs ?? 0,
    jobsToday: todayRow.jobsToday,
    totalCostUsd: totalRow.totalCostUsd ?? 0,
    costToday: todayRow.costToday ?? 0,
    avgDurationMs: totalRow.avgDurationMs,
  }
}

// ─── Project settings ─────────────────────────────────────────────────────────

export interface ProjectSettings {
  pipelineTelemetryEnabled: boolean
}

export function getProjectSettings(db: DbInstance): ProjectSettings {
  const row = db.prepare(
    `SELECT value FROM queue_state WHERE key = 'config.pipeline_telemetry_enabled'`
  ).get() as { value: string } | undefined
  return {
    pipelineTelemetryEnabled: row?.value === 'true',
  }
}

export function updateProjectSettings(db: DbInstance, patch: Partial<ProjectSettings>): void {
  if (patch.pipelineTelemetryEnabled !== undefined) {
    db.prepare(
      `INSERT OR REPLACE INTO queue_state (key, value) VALUES ('config.pipeline_telemetry_enabled', ?)`
    ).run(patch.pipelineTelemetryEnabled ? 'true' : 'false')
  }
}

// ─── Telemetry DB functions ───────────────────────────────────────────────────

export interface TelemetryBlobRow {
  jobId: string
  path: string | null
  byteSize: number
  startedAt: number | null
  endedAt: number | null
  state: 'active' | 'compacted' | 'expired'
}

export interface TelemetrySummaryRow {
  jobId: string
  phase: string
  durationMs: number | null
  tokensInput: number | null
  tokensOutput: number | null
  tokensCache: number | null
  toolCalls: string | null
  apiErrors: number | null
  costUsd: number | null
}

export function getTelemetryBlob(db: DbInstance, jobId: string): TelemetryBlobRow | undefined {
  return db.prepare('SELECT * FROM telemetry_blobs WHERE jobId = ?').get(jobId) as TelemetryBlobRow | undefined
}

export function upsertTelemetryBlob(db: DbInstance, row: TelemetryBlobRow): void {
  db.prepare(`
    INSERT INTO telemetry_blobs (jobId, path, byteSize, startedAt, endedAt, state)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(jobId) DO UPDATE SET
      path = excluded.path,
      byteSize = excluded.byteSize,
      startedAt = COALESCE(telemetry_blobs.startedAt, excluded.startedAt),
      endedAt = excluded.endedAt,
      state = excluded.state
  `).run(row.jobId, row.path ?? null, row.byteSize, row.startedAt ?? null, row.endedAt ?? null, row.state)
}

export function listActiveTelemetryBlobs(db: DbInstance): TelemetryBlobRow[] {
  return db.prepare(
    `SELECT * FROM telemetry_blobs WHERE state = 'active'`
  ).all() as TelemetryBlobRow[]
}

export function setTelemetryBlobCompacted(db: DbInstance, jobId: string): void {
  db.prepare(
    `UPDATE telemetry_blobs SET state = 'compacted', path = NULL WHERE jobId = ?`
  ).run(jobId)
}

export function insertTelemetrySummary(db: DbInstance, row: TelemetrySummaryRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO telemetry_summaries
      (jobId, phase, durationMs, tokensInput, tokensOutput, tokensCache, toolCalls, apiErrors, costUsd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.jobId, row.phase,
    row.durationMs ?? null, row.tokensInput ?? null, row.tokensOutput ?? null,
    row.tokensCache ?? null, row.toolCalls ?? null, row.apiErrors ?? null, row.costUsd ?? null
  )
}

export function getTelemetrySummaries(db: DbInstance, jobId: string): TelemetrySummaryRow[] {
  return db.prepare('SELECT * FROM telemetry_summaries WHERE jobId = ?').all(jobId) as TelemetrySummaryRow[]
}

export function deleteTelemetryForJob(db: DbInstance, jobId: string): void {
  db.prepare('DELETE FROM telemetry_blobs WHERE jobId = ?').run(jobId)
  db.prepare('DELETE FROM telemetry_summaries WHERE jobId = ?').run(jobId)
}

/** Returns a Set of jobIds that have active or compacted telemetry blobs. */
export function getJobsWithTelemetry(db: DbInstance): Set<string> {
  const rows = db.prepare(
    `SELECT jobId FROM telemetry_blobs WHERE state IN ('active','compacted')`
  ).all() as Array<{ jobId: string }>
  return new Set(rows.map((r) => r.jobId))
}

/** True iff the job has an active or compacted telemetry blob row. */
export function hasJobTelemetry(db: DbInstance, jobId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM telemetry_blobs WHERE jobId = ? AND state IN ('active','compacted') LIMIT 1`
  ).get(jobId)
  return row !== undefined
}
