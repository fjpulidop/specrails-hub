import path from 'path'
import type { DbInstance } from './db'
import { initDb } from './db'
import { QueueManager } from './queue-manager'
import { ChatManager } from './chat-manager'
import { SetupManager } from './setup-manager'
import { ProposalManager } from './proposal-manager'
import { SpecLauncherManager } from './spec-launcher-manager'
import { WebhookManager } from './webhook-manager'
import type { WsMessage } from './types'
import {
  initHubDb,
  getHubDbPath,
  listProjects,
  addProject as addProjectToHub,
  removeProject as removeProjectFromHub,
  getProject,
  getProjectByPath,
  touchProject,
  setProjectSetupSession,
  clearProjectSetupSession,
  clearAgentJob,
  getHubSetting,
  type ProjectRow,
} from './hub-db'
import { getConfig } from './config'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectContext {
  project: ProjectRow
  db: DbInstance
  queueManager: QueueManager
  chatManager: ChatManager
  setupManager: SetupManager
  proposalManager: ProposalManager
  specLauncherManager: SpecLauncherManager
  broadcast: (msg: WsMessage) => void
}

// ─── ProjectRegistry ──────────────────────────────────────────────────────────

export class ProjectRegistry {
  private _hubDb: DbInstance
  private _contexts: Map<string, ProjectContext>
  private _broadcast: (msg: WsMessage) => void
  private _webhookManager: WebhookManager

  constructor(broadcast: (msg: WsMessage) => void, hubDbPath?: string) {
    this._broadcast = broadcast
    this._hubDb = initHubDb(hubDbPath ?? getHubDbPath())
    this._contexts = new Map()
    this._webhookManager = new WebhookManager(this._hubDb)
  }

  get hubDb(): DbInstance {
    return this._hubDb
  }

  loadAll(): void {
    const projects = listProjects(this._hubDb)
    for (const project of projects) {
      this._loadProjectContext(project)
    }
  }

  addProject(opts: {
    id: string
    slug: string
    name: string
    path: string
    provider?: 'claude' | 'codex'
  }): ProjectContext {
    const row = addProjectToHub(this._hubDb, opts)
    return this._loadProjectContext(row)
  }

  removeProject(id: string): void {
    const ctx = this._contexts.get(id)
    if (ctx) {
      // Close the DB connection
      try { ctx.db.close() } catch { /* ignore */ }
      this._contexts.delete(id)
    }
    removeProjectFromHub(this._hubDb, id)
  }

  getContext(id: string): ProjectContext | undefined {
    return this._contexts.get(id)
  }

  getContextByPath(projectPath: string): ProjectContext | undefined {
    const row = getProjectByPath(this._hubDb, projectPath)
    if (!row) return undefined
    return this._contexts.get(row.id)
  }

  listContexts(): ProjectContext[] {
    return Array.from(this._contexts.values())
  }

  touchProject(id: string): void {
    touchProject(this._hubDb, id)
  }

  getProjectRow(id: string): ProjectRow | undefined {
    return getProject(this._hubDb, id)
  }

  private _loadProjectContext(project: ProjectRow): ProjectContext {
    // Avoid double-loading
    const existing = this._contexts.get(project.id)
    if (existing) return existing

    const db = initDb(project.db_path)

    // Bind broadcast with projectId so all WS messages carry context.
    // Also wire agent status: when a queued job reaches a terminal state,
    // clear current_job_id on any agent that was assigned to it.
    const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'canceled'])
    const boundBroadcast = (msg: WsMessage): void => {
      const enriched = { ...msg, projectId: project.id }
      this._broadcast(enriched as WsMessage)
      if (msg.type === 'queue') {
        for (const job of msg.jobs) {
          if (TERMINAL_JOB_STATUSES.has(job.status)) {
            clearAgentJob(this._hubDb, job.id)
          }
        }
      }
    }

    const webhookManager = this._webhookManager
    const queueManager = new QueueManager(boundBroadcast, db, undefined, project.path, {
      provider: project.provider ?? 'claude',
      getCostAlertThreshold: () => {
        const val = getHubSetting(this._hubDb, 'cost_alert_threshold_usd')
        return val != null ? parseFloat(val) : null
      },
      onJobFinished: (jobId, status, costUsd) => {
        const jobRow = db.prepare('SELECT command, duration_ms FROM jobs WHERE id = ?').get(jobId) as
          | { command: string; duration_ms: number | null }
          | undefined
        const event = status === 'completed' ? 'job.completed' : 'job.failed'
        webhookManager.deliver(project.id, event, {
          jobId,
          command: jobRow?.command ?? '',
          status,
          costUsd: costUsd ?? null,
          durationMs: jobRow?.duration_ms ?? null,
        })
      },
    })
    const chatManager = new ChatManager(boundBroadcast, db, project.path, project.name, project.provider ?? 'claude')
    const setupManager = new SetupManager(
      boundBroadcast,
      (pid, sid) => setProjectSetupSession(this._hubDb, pid, sid),
      (pid) => clearProjectSetupSession(this._hubDb, pid)
    )
    const proposalManager = new ProposalManager(boundBroadcast, db, project.path)
    const specLauncherManager = new SpecLauncherManager(boundBroadcast, project.path)

    // Load commands for this project
    try {
      const config = getConfig(project.path, db, project.name)
      queueManager.setCommands(config.commands)
    } catch {
      // Non-fatal: project may not have commands yet
    }

    const ctx: ProjectContext = { project, db, queueManager, chatManager, setupManager, proposalManager, specLauncherManager, broadcast: boundBroadcast }
    this._contexts.set(project.id, ctx)
    return ctx
  }
}
