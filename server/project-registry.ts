import path from 'path'
import fs from 'fs'
import os from 'os'
import type { DbInstance } from './db'
import { initDb } from './db'
import { QueueManager } from './queue-manager'
import { ChatManager } from './chat-manager'
import { SetupManager } from './setup-manager'
import { ProposalManager } from './proposal-manager'
import { AgentRefineManager } from './agent-refine-manager'
import { pruneStaleRefineSessions } from './agent-refine-db'
import { SpecLauncherManager } from './spec-launcher-manager'
import { WebhookManager } from './webhook-manager'
import { TicketWatcher } from './ticket-watcher'
import { getTerminalManager } from './terminal-manager'
import { resolveTicketStoragePath, mutateStore } from './ticket-store'
import type { WsMessage, TicketUpdatedMessage } from './types'
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
  agentRefineManager: AgentRefineManager
  specLauncherManager: SpecLauncherManager
  ticketWatcher: TicketWatcher
  broadcast: (msg: WsMessage) => void
  /** Maps jobId → rail metadata for active rail-launched jobs */
  railJobs: Map<string, { railIndex: number; mode: string; ticketIds: number[] }>
}

// ─── ProjectRegistry ──────────────────────────────────────────────────────────

export class ProjectRegistry {
  private _hubDb: DbInstance
  private _contexts: Map<string, ProjectContext>
  private _broadcast: (msg: WsMessage) => void
  private _webhookManager: WebhookManager
  private _hubPort: number

  constructor(broadcast: (msg: WsMessage) => void, hubDbPath?: string, hubPort?: number) {
    this._broadcast = broadcast
    this._hubDb = initHubDb(hubDbPath ?? getHubDbPath())
    this._contexts = new Map()
    this._webhookManager = new WebhookManager(this._hubDb)
    this._hubPort = hubPort ?? 4200
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
      // Kill any terminal sessions belonging to this project
      try { getTerminalManager().killAllForProject(id) } catch { /* ignore */ }
      // Close the ticket file watcher
      ctx.ticketWatcher.close().catch(() => { /* ignore */ })
      // Delete telemetry blob files for this project
      try {
        const telemetryDir = path.join(os.homedir(), '.specrails', 'projects', ctx.project.slug, 'telemetry')
        if (fs.existsSync(telemetryDir)) {
          fs.rmSync(telemetryDir, { recursive: true, force: true })
        }
      } catch { /* ignore — non-fatal */ }
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

    // Per-project zombie timeout (stored in queue_state)
    let projectZombieTimeout: number | undefined
    try {
      const row = db.prepare(`SELECT value FROM queue_state WHERE key = 'config.zombie_timeout_ms'`).get() as { value: string } | undefined
      if (row) {
        const parsed = parseInt(row.value, 10)
        if (!isNaN(parsed) && parsed > 0) projectZombieTimeout = parsed
      }
    } catch { /* queue_state table may not exist yet */ }

    const webhookManager = this._webhookManager
    const railJobs = new Map<string, { railIndex: number; mode: string; ticketIds: number[] }>()
    const queueManager = new QueueManager(boundBroadcast, db, undefined, project.path, {
      zombieTimeoutMs: projectZombieTimeout,
      provider: project.provider ?? 'claude',
      projectId: project.id,
      projectSlug: project.slug,
      hubPort: this._hubPort,
      getCostAlertThreshold: () => {
        const val = getHubSetting(this._hubDb, 'cost_alert_threshold_usd')
        return val != null ? parseFloat(val) : null
      },
      getHubDailyBudget: () => {
        const val = getHubSetting(this._hubDb, 'hub_daily_budget_usd')
        const budget = val != null ? parseFloat(val) : null
        let totalSpend = 0
        for (const c of this.listContexts()) {
          const row = c.db.prepare(
            `SELECT COALESCE(SUM(total_cost_usd), 0) as total FROM jobs WHERE status = 'completed' AND total_cost_usd IS NOT NULL AND started_at >= date('now')`
          ).get() as { total: number }
          totalSpend += row.total
        }
        return { budget, totalSpend }
      },
      onJobFinished: (jobId, status, costUsd) => {
        const jobRow = db.prepare('SELECT command, duration_ms FROM jobs WHERE id = ?').get(jobId) as
          | { command: string; duration_ms: number | null }
          | undefined
        const event = status === 'completed' ? 'job.completed' : status === 'canceled' ? 'job.canceled' : 'job.failed'
        webhookManager.deliver(project.id, event, {
          jobId,
          command: jobRow?.command ?? '',
          status,
          costUsd: costUsd ?? null,
          durationMs: jobRow?.duration_ms ?? null,
        })
        // Broadcast rail.job_completed if this job was launched by a rail
        const railMeta = railJobs.get(jobId)
        if (railMeta) {
          railJobs.delete(jobId)
        }

        // Determine ticket IDs: from rail metadata, or parse from command as fallback
        // (railJobs Map is in-memory and lost on server restart)
        let completedTicketIds: number[] = railMeta?.ticketIds ?? []
        if (completedTicketIds.length === 0 && jobRow?.command) {
          const matches = jobRow.command.match(/#(\d+)/g)
          if (matches) completedTicketIds = matches.map((m) => parseInt(m.slice(1), 10))
        }

        // Mark tickets as done when job completed successfully
        if (status === 'completed' && completedTicketIds.length > 0) {
          try {
            const ticketFile = resolveTicketStoragePath(project.path)
            mutateStore(ticketFile, (store) => {
              for (const tid of completedTicketIds) {
                const ticket = store.tickets[String(tid)]
                if (ticket && ticket.status !== 'done') {
                  ticket.status = 'done'
                  ticket.updated_at = new Date().toISOString()
                  boundBroadcast({
                    type: 'ticket_updated',
                    ticket: ticket as unknown as import('./types').LocalTicket,
                    projectId: project.id,
                    timestamp: ticket.updated_at,
                  } as TicketUpdatedMessage)
                }
              }
            })
          } catch (err) {
            console.error('[project-registry] failed to mark rail tickets as done:', err)
          }
        }

        // Revert tickets to todo when job was canceled or failed
        if ((status === 'canceled' || status === 'failed') && completedTicketIds.length > 0) {
          try {
            const ticketFile = resolveTicketStoragePath(project.path)
            mutateStore(ticketFile, (store) => {
              for (const tid of completedTicketIds) {
                const ticket = store.tickets[String(tid)]
                if (ticket && ticket.status === 'in_progress') {
                  ticket.status = 'todo'
                  ticket.updated_at = new Date().toISOString()
                  boundBroadcast({
                    type: 'ticket_updated',
                    ticket: ticket as unknown as import('./types').LocalTicket,
                    projectId: project.id,
                    timestamp: ticket.updated_at,
                  } as TicketUpdatedMessage)
                }
              }
            })
          } catch (err) {
            console.error('[project-registry] failed to revert rail tickets:', err)
          }
        }

        // Broadcast rail.job_completed if we know the rail index
        if (railMeta) {
          boundBroadcast({
            type: 'rail.job_completed',
            projectId: project.id,
            railIndex: railMeta.railIndex,
            jobId,
            status,
            ticketIds: completedTicketIds,
          })
        }
      },
    })
    const chatManager = new ChatManager(boundBroadcast, db, project.path, project.name, project.provider ?? 'claude')
    const setupManager = new SetupManager(
      boundBroadcast,
      (pid, sid) => setProjectSetupSession(this._hubDb, pid, sid),
      (pid) => clearProjectSetupSession(this._hubDb, pid)
    )
    const proposalManager = new ProposalManager(boundBroadcast, db, project.path)
    const agentRefineManager = new AgentRefineManager(boundBroadcast, db, project.path)
    // Retention prune: drop stale/abandoned refine sessions on project load.
    try { pruneStaleRefineSessions(db) } catch (err) {
      console.error('[project-registry] prune refine sessions failed:', err)
    }
    const specLauncherManager = new SpecLauncherManager(boundBroadcast, project.path)

    // Load commands for this project
    try {
      const config = getConfig(project.path, db, project.name)
      queueManager.setCommands(config.commands)
    } catch {
      // Non-fatal: project may not have commands yet
    }

    const ticketWatcher = new TicketWatcher(project.path, project.id, boundBroadcast)
    ticketWatcher.start()

    const ctx: ProjectContext = { project, db, queueManager, chatManager, setupManager, proposalManager, agentRefineManager, specLauncherManager, ticketWatcher, broadcast: boundBroadcast, railJobs }
    this._contexts.set(project.id, ctx)
    return ctx
  }
}
