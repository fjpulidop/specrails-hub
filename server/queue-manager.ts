import { execSync, ChildProcess } from 'child_process'
import fsNode from 'fs'
import pathNode from 'path'
import { createInterface } from 'readline'
import { newId as uuidv4 } from './ids'
import treeKill from 'tree-kill'
import type { WsMessage, LogMessage, Job, PhaseDefinition, JobPriority } from './types'
import { PRIORITY_WEIGHT, VALID_PRIORITIES } from './types'
import { resolveCommand } from './command-resolver'
import { spawnAiCli } from './util/cli-prompt'
import { resetPhases, setActivePhases } from './hooks'
import { createJob, finishJob, appendEvent, skipJob, getProjectSettings } from './db'
import type { JobResult } from './db'
import type { CommandInfo } from './config'
import { attachmentManager, USER_ATTACHMENT_SYSTEM_NOTE } from './attachment-manager'
import { readStore, resolveTicketStoragePath } from './ticket-store'

// ─── Telemetry env helpers ────────────────────────────────────────────────────

/** Build the OTEL environment variable block for a spawned claude process.
 * Extracted as a pure function so it is unit-testable without a full spawn. */
export function buildTelemetryEnv(
  jobId: string,
  projectId: string,
  hubPort: number,
  extraResourceAttributes: Record<string, string | number> = {},
): Record<string, string> {
  const baseAttrs: Array<[string, string]> = [
    ['specrails.job_id', jobId],
    ['specrails.project_id', projectId],
  ]
  for (const [k, v] of Object.entries(extraResourceAttributes)) {
    baseAttrs.push([k, String(v)])
  }
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${hubPort}/otlp`,
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_RESOURCE_ATTRIBUTES: baseAttrs.map(([k, v]) => `${k}=${v}`).join(','),
  }
}

/** Detect whether a project's installed specrails-core version supports the
 *  profile-aware pipeline (shipped in 4.1.0). Returns false when the version
 *  file is missing or unparseable so we default to legacy (safer). */
export function projectSupportsProfiles(projectPath: string): boolean {
  const candidates = [
    pathNode.join(projectPath, '.specrails', 'specrails-version'),
    pathNode.join(projectPath, '.specrails-version'),
  ]
  for (const p of candidates) {
    if (!fsNode.existsSync(p)) continue
    try {
      const raw = fsNode.readFileSync(p, 'utf8').trim()
      const [ma, mi, pa] = raw.split('.').map((n) => parseInt(n, 10))
      if (isNaN(ma) || isNaN(mi) || isNaN(pa)) return false
      return ma > 4 || (ma === 4 && mi > 1) || (ma === 4 && mi === 1 && pa >= 0)
    } catch {
      return false
    }
  }
  return false
}

const LOG_BUFFER_MAX = 5000
const LOG_BUFFER_DROP = 1000
export const DEFAULT_ZOMBIE_TIMEOUT_MS = 1_800_000 // 30 minutes

// ─── Error classes ────────────────────────────────────────────────────────────

export class ClaudeNotFoundError extends Error {
  constructor() {
    super('claude binary not found')
    this.name = 'ClaudeNotFoundError'
  }
}

export class CodexNotFoundError extends Error {
  constructor() {
    super('codex binary not found')
    this.name = 'CodexNotFoundError'
  }
}

export class JobNotFoundError extends Error {
  constructor() {
    super('Job not found')
    this.name = 'JobNotFoundError'
  }
}

export class JobAlreadyTerminalError extends Error {
  constructor() {
    super('Job is already in terminal state')
    this.name = 'JobAlreadyTerminalError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Windows has no `which`; probe via `where` instead. Both exit non-zero
// when the command is missing, which the try/catch relies on.
const _WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

function claudeOnPath(): boolean {
  try {
    execSync(`${_WHICH_CMD} claude`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function codexOnPath(): boolean {
  try {
    execSync(`${_WHICH_CMD} codex`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function extractDisplayText(event: Record<string, unknown>): string | null {
  const type = event.type as string
  if (type === 'assistant') {
    const content = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
    const texts = (content?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
    return texts.join('') || null
  }
  if (type === 'tool_use') {
    const name = (event as Record<string, unknown>).name as string
    const input = JSON.stringify((event as Record<string, unknown>).input ?? {})
    return `[tool: ${name}] ${input.slice(0, 120)}`
  }
  if (type === 'tool_result' || type === 'system_prompt' || type === 'user' || type === 'system' || type === 'result') {
    return null
  }
  return null
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'zombie_terminated', 'skipped'])

export interface EnqueueOptions {
  dependsOnJobId?: string
  pipelineId?: string
  /** Agent profile name to apply for this spawn. If omitted, the QueueManager
   *  resolves via default. Pass null to force legacy
   *  mode (no profile), even if a default exists. */
  profileName?: string | null
}

// ─── QueueManager ─────────────────────────────────────────────────────────────

export class QueueManager {
  private _queue: string[]
  private _jobs: Map<string, Job>
  private _activeProcess: ChildProcess | null
  private _activeJobId: string | null
  private _paused: boolean
  private _killTimer: ReturnType<typeof setTimeout> | null
  private _cancelingJobs: Set<string>
  private _zombieJobs: Set<string>
  private _broadcast: (msg: WsMessage) => void
  private _db: any
  private _logBuffer: LogMessage[]
  private _commands: CommandInfo[]
  private _cwd: string | undefined
  private _zombieTimeoutMs: number
  private _inactivityTimer: ReturnType<typeof setTimeout> | null

  private _getCostAlertThreshold: (() => number | null) | null
  private _getHubDailyBudget: (() => { budget: number | null; totalSpend: number }) | null
  private _provider: 'claude' | 'codex'
  /** Effective model to use when spawning codex processes. Ignored for claude (reads from .claude/ config). */
  private _resolvedModel: string | null
  private _onJobFinished: ((jobId: string, status: Job['status'], costUsd?: number) => void) | null
  /** Project ID used for OTEL resource attributes (hub mode only) */
  private _projectId: string | null
  /** Hub port used to construct the OTLP endpoint URL for env injection */
  private _hubPort: number
  /** Project slug used for per-job profile snapshots (hub mode only) */
  private _projectSlug: string | null
  /** Pending profile selection keyed by jobId — read at spawn time */
  private _jobProfileSelection: Map<string, string | null>

  constructor(
    broadcast: (msg: WsMessage) => void,
    db?: any,
    commands?: CommandInfo[],
    cwd?: string,
    options?: {
      zombieTimeoutMs?: number
      getCostAlertThreshold?: () => number | null
      getHubDailyBudget?: () => { budget: number | null; totalSpend: number }
      provider?: 'claude' | 'codex'
      /** Effective model for codex spawns. If omitted, falls back to 'gpt-5.4-mini'. */
      resolvedModel?: string
      onJobFinished?: (jobId: string, status: Job['status'], costUsd?: number) => void
      projectId?: string
      hubPort?: number
      /** Project slug used to locate per-job profile snapshots at
       *  ~/.specrails/projects/<slug>/jobs/<jobId>/profile.json */
      projectSlug?: string
    }
  ) {
    this._queue = []
    this._jobs = new Map()
    this._activeProcess = null
    this._activeJobId = null
    this._paused = false
    this._killTimer = null
    this._cancelingJobs = new Set()
    this._zombieJobs = new Set()
    this._broadcast = broadcast
    this._db = db ?? null
    this._logBuffer = []
    this._commands = commands ?? []
    this._cwd = cwd
    this._inactivityTimer = null

    this._getCostAlertThreshold = options?.getCostAlertThreshold ?? null
    this._getHubDailyBudget = options?.getHubDailyBudget ?? null
    this._provider = options?.provider ?? 'claude'
    this._resolvedModel = options?.resolvedModel ?? null
    this._onJobFinished = options?.onJobFinished ?? null
    this._projectId = options?.projectId ?? null
    this._hubPort = options?.hubPort ?? 4200
    this._projectSlug = options?.projectSlug ?? null
    this._jobProfileSelection = new Map()

    const envTimeout = process.env.WM_ZOMBIE_TIMEOUT_MS !== undefined
      ? parseInt(process.env.WM_ZOMBIE_TIMEOUT_MS, 10)
      : null
    this._zombieTimeoutMs = options?.zombieTimeoutMs
      ?? (envTimeout !== null && !isNaN(envTimeout) ? envTimeout : DEFAULT_ZOMBIE_TIMEOUT_MS)

    if (this._db) {
      this._restoreFromDb()
    }
  }

  setCommands(commands: CommandInfo[]): void {
    this._commands = commands
  }

  setZombieTimeout(ms: number): void {
    this._zombieTimeoutMs = ms
    // If a job is currently running, reset the timer with the new value
    if (this._activeJobId) {
      this._resetZombieTimer()
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  enqueue(command: string, priorityOrOpts?: JobPriority | EnqueueOptions, opts?: EnqueueOptions): Job {
    // Support both: enqueue(cmd, priority, opts) and enqueue(cmd, opts)
    let priority: JobPriority = 'normal'
    let resolvedOpts: EnqueueOptions | undefined = opts
    if (typeof priorityOrOpts === 'string') {
      priority = priorityOrOpts
    } else if (priorityOrOpts && typeof priorityOrOpts === 'object') {
      resolvedOpts = priorityOrOpts
    }

    if (this._provider === 'codex') {
      if (!codexOnPath()) throw new CodexNotFoundError()
    } else {
      if (!claudeOnPath()) throw new ClaudeNotFoundError()
    }

    const id = uuidv4()
    const job: Job = {
      id,
      command,
      status: 'queued',
      queuePosition: null,
      priority,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      dependsOnJobId: resolvedOpts?.dependsOnJobId ?? null,
      pipelineId: resolvedOpts?.pipelineId ?? null,
      skipReason: null,
      resultText: null,
    }

    this._jobs.set(id, job)

    // Record profile selection (if provided) so spawn time can pick it up.
    // `undefined` means "use default resolution"; `null` means "force legacy".
    if (resolvedOpts && 'profileName' in resolvedOpts) {
      this._jobProfileSelection.set(id, resolvedOpts.profileName ?? null)
    }

    // Insert at the correct position based on priority (higher priority first, FIFO within same level)
    const weight = PRIORITY_WEIGHT[priority]
    let insertIdx = this._queue.length
    for (let i = 0; i < this._queue.length; i++) {
      const existing = this._jobs.get(this._queue[i])
      if (existing && PRIORITY_WEIGHT[existing.priority] < weight) {
        insertIdx = i
        break
      }
    }
    this._queue.splice(insertIdx, 0, id)

    this._recomputePositions()
    this._persistJob(job)
    this._broadcastQueueState()
    this._drainQueue()

    return job
  }

  cancel(jobId: string): 'canceled' | 'canceling' {
    const job = this._jobs.get(jobId)
    if (!job) {
      throw new JobNotFoundError()
    }
    if (TERMINAL_STATUSES.has(job.status)) {
      throw new JobAlreadyTerminalError()
    }

    if (job.status === 'queued') {
      const idx = this._queue.indexOf(jobId)
      if (idx !== -1) {
        this._queue.splice(idx, 1)
      }
      job.status = 'canceled'
      job.finishedAt = new Date().toISOString()
      this._skipDependents(jobId, `Parent job ${jobId} was canceled`)
      this._recomputePositions()
      this._persistJob(job)
      this._broadcastQueueState()
      return 'canceled'
    }

    // job.status === 'running'
    this._kill(jobId)
    return 'canceling'
  }

  pause(): void {
    this._paused = true
    this._persistQueueState()
    this._broadcastQueueState()
  }

  resume(): void {
    this._paused = false
    this._persistQueueState()
    this._broadcastQueueState()
    this._drainQueue()
  }

  reorder(jobIds: string[]): void {
    const queuedSet = new Set(this._queue)
    const incomingSet = new Set(jobIds)

    if (queuedSet.size !== incomingSet.size) {
      throw new Error('jobIds must contain exactly the IDs of all currently-queued jobs')
    }
    for (const id of jobIds) {
      if (!queuedSet.has(id)) {
        throw new Error(`Job ${id} is not in queued state`)
      }
    }

    this._queue = [...jobIds]
    this._recomputePositions()

    if (this._db) {
      for (const id of jobIds) {
        const job = this._jobs.get(id)
        if (job) {
          this._persistJob(job)
        }
      }
    }

    this._broadcastQueueState()
  }

  updatePriority(jobId: string, priority: JobPriority): void {
    const job = this._jobs.get(jobId)
    if (!job) throw new JobNotFoundError()
    if (job.status !== 'queued') {
      throw new Error('Can only change priority of queued jobs')
    }

    job.priority = priority

    // Remove from queue and re-insert at correct position
    const idx = this._queue.indexOf(jobId)
    if (idx !== -1) this._queue.splice(idx, 1)

    const weight = PRIORITY_WEIGHT[priority]
    let insertIdx = this._queue.length
    for (let i = 0; i < this._queue.length; i++) {
      const existing = this._jobs.get(this._queue[i])
      if (existing && PRIORITY_WEIGHT[existing.priority] < weight) {
        insertIdx = i
        break
      }
    }
    this._queue.splice(insertIdx, 0, jobId)

    this._recomputePositions()
    this._persistJob(job)
    this._broadcastQueueState()
  }

  getJobs(): Job[] {
    return Array.from(this._jobs.values())
  }

  getActiveJobId(): string | null {
    return this._activeJobId
  }

  isPaused(): boolean {
    return this._paused
  }

  getLogBuffer(): LogMessage[] {
    return [...this._logBuffer]
  }

  // ─── Private methods ────────────────────────────────────────────────────────

  phasesForCommand(command: string): PhaseDefinition[] {
    return this._phasesForCommand(command)
  }

  /**
   * Resolve a slash command into a full prompt with $ARGUMENTS substituted.
   * Delegates to the shared resolveCommand utility in command-resolver.ts.
   */
  private _resolveCommand(command: string): string {
    return resolveCommand(command, this._cwd ?? process.cwd())
  }

  private _phasesForCommand(command: string): PhaseDefinition[] {
    // Extract slug from command strings like "/specrails:implement #5" or "implement"
    const firstToken = command.trim().split(/\s+/)[0]
    const slug = firstToken.includes(':') ? firstToken.split(':').pop()! : firstToken.replace(/^\//, '')
    const info = this._commands.find((c) => c.slug === slug)
    return info?.phases ?? []
  }

  private _extractTicketIds(command: string): number[] {
    const ids = new Set<number>()
    for (const match of command.matchAll(/#(\d+)/g)) {
      const id = Number.parseInt(match[1], 10)
      if (!Number.isNaN(id)) ids.add(id)
    }
    return Array.from(ids)
  }

  private _buildImplementAttachmentContext(command: string): string {
    if (!this._cwd || !this._projectSlug) return ''

    const ticketIds = this._extractTicketIds(command)
    if (ticketIds.length === 0) return ''

    try {
      const store = readStore(resolveTicketStoragePath(this._cwd))
      const sections: string[] = []

      for (const ticketId of ticketIds) {
        const storeAttachmentIds = new Set(
          (store.tickets[String(ticketId)]?.attachments ?? []).map((attachment) => attachment.id),
        )
        const diskAttachmentIds = attachmentManager
          .list(this._projectSlug, ticketId)
          .map((attachment) => attachment.id)
        const attachmentIds = Array.from(new Set([...storeAttachmentIds, ...diskAttachmentIds]))
        if (attachmentIds.length === 0) continue

        const blocks = attachmentManager.getPromptBlocksSync(this._projectSlug, ticketId, attachmentIds)
        if (blocks.length === 0) continue

        sections.push(`## Ticket #${ticketId} Attached Resources\n\n${blocks.join('\n\n')}`)
      }

      if (sections.length === 0) return ''

      return '\n\nIMPORTANT: Referenced ticket attachments are also part of the spec context. ' +
        `You have explicit permission to read local attachment files stored under ~/.specrails/projects/${this._projectSlug}/attachments/<ticketId>/.\n\n` +
        `${USER_ATTACHMENT_SYSTEM_NOTE}\n\n` +
        'If a <user-attachment> block contains only a local file path, open that file directly before implementing.\n\n' +
        sections.join('\n\n')
    } catch (err) {
      console.warn(`[queue-manager] failed to build attachment context: ${(err as Error).message}`)
      return ''
    }
  }

  private _drainQueue(): void {
    if (this._activeJobId !== null) return
    if (this._paused) return
    if (this._queue.length === 0) return

    const readyIndex = this._queue.findIndex(id => {
      const job = this._jobs.get(id)
      if (!job) return true
      return this._isDependencyMet(job)
    })

    if (readyIndex === -1) return

    const nextJobId = this._queue.splice(readyIndex, 1)[0]
    this._recomputePositions()
    this._startJob(nextJobId)
  }

  private _startJob(jobId: string): void {
    const job = this._jobs.get(jobId)
    if (!job) return

    job.status = 'running'
    job.startedAt = new Date().toISOString()
    job.queuePosition = null

    this._recomputePositions()
    this._persistJob(job)

    const commandPhases = this._phasesForCommand(job.command)
    if (commandPhases.length > 0) {
      setActivePhases(commandPhases, this._broadcast)
    } else {
      resetPhases(this._broadcast)
    }

    const commandToRun = job.command.trim()

    // Build supplementary context (output chaining + headless mode) that goes
    // into --append-system-prompt, keeping the user prompt clean.
    let systemAppend = ''

    // Output chaining: inject previous step's output as context for dependent jobs
    if (job.dependsOnJobId) {
      const parentJob = this._jobs.get(job.dependsOnJobId)
      if (parentJob?.resultText) {
        const prevOutput = parentJob.resultText
        const truncated = prevOutput.length > 10000
          ? prevOutput.slice(0, 10000) + '\n\n[output truncated]'
          : prevOutput
        systemAppend += `Previous step output:\n\n${truncated}\n\n---\n\nNow execute the following command.\n\n`
      }
    }

    // Headless mode: when --yes is in the command, instruct Claude to auto-proceed
    // (stdin is ignored in spawned processes, so no user confirmation is possible)
    if (job.command.includes('--yes')) {
      systemAppend += '\n\nCRITICAL — FULLY AUTONOMOUS MODE (--yes flag):\n' +
        'This pipeline is running headless with NO human operator. stdin is disconnected — nobody can reply.\n' +
        '- NEVER ask for approval, confirmation, review, or feedback. There is nobody to answer.\n' +
        '- NEVER output prompts like "Reply with approved", "Do you want to proceed?", "Please confirm", or "Ready for review".\n' +
        '- NEVER stop between pipeline phases to wait for input. Run ALL phases end-to-end without pausing.\n' +
        '- When there are multiple options or decisions, always choose the RECOMMENDED option and proceed.\n' +
        '- Auto-approve all proposals, designs, and artifacts. Treat everything as "approved" by default.\n' +
        '- Skip any instructions that say "wait for user", "present for review", or "ask the user".\n' +
        '- The pipeline must complete fully from start to finish in a single uninterrupted run.'
    }

    // Local ticket store: implement/batch-implement jobs must read specs from
    // .specrails/local-tickets.json — never from external trackers like Jira/Linear.
    if (/\/(specrails|sr):(implement|batch-implement)\b/.test(commandToRun)) {
      systemAppend += '\n\nIMPORTANT: The ticket/spec data for this project is stored locally in .specrails/local-tickets.json. ' +
        'You MUST read specs from this file. Do NOT attempt to fetch tickets from Jira, Linear, GitHub Issues, or any other external tracker. ' +
        'The #<id> references in the command correspond to ticket IDs inside .specrails/local-tickets.json.'

      const attachmentContext = this._buildImplementAttachmentContext(commandToRun)
      if (attachmentContext) {
        systemAppend += attachmentContext
      }

      const prePrompt = this._db ? getProjectSettings(this._db).prePrompt.trim() : ''
      if (prePrompt) {
        systemAppend += '\n\nPROJECT PRE-PROMPT:\n' +
          'Apply the following project-specific instructions in addition to the ticket/spec and its attached resources.\n\n' +
          prePrompt
      }
    }

    let binary: string
    let args: string[]
    if (this._provider === 'codex') {
      binary = 'codex'
      // Codex doesn't support slash commands — resolve the prompt.
      // Codex also has no --append-system-prompt flag: embed systemAppend directly
      // in the prompt so headless-mode instructions, output-chaining context, and
      // local-tickets reminders are preserved end-to-end.
      const resolved = this._resolveCommand(commandToRun)
      const fullPrompt = systemAppend ? `${systemAppend}\n\n---\n\n${resolved}` : resolved
      const resolvedModel = this._resolvedModel ?? 'gpt-5.4-mini'
      args = ['exec', fullPrompt, '--model', resolvedModel]
    } else {
      binary = 'claude'
      args = [
        '--dangerously-skip-permissions',
        '--tools', 'default',
        '--output-format', 'stream-json',
        '--verbose',
      ]
      // Read orchestratorModel at spawn time so changes take effect on next job.
      if (this._db) {
        const { orchestratorModel } = getProjectSettings(this._db)
        args.push('--model', orchestratorModel)
      }
      if (systemAppend) {
        args.push('--append-system-prompt', systemAppend)
      }
      // Pass the raw command to Claude CLI so it resolves skills natively.
      // This ensures skills get proper execution priority over CLAUDE.md
      // instructions — pre-resolving to plain text caused the project's
      // CLAUDE.md to override the pipeline prompt.
      args.push('-p', commandToRun)
    }

    // Resolve agent profile (if any) and snapshot per-job before spawn.
    // Hub mode only (projectId + projectSlug + cwd all present).
    // Profile injection is skipped in codex mode, and when the project's
    // installed specrails-core is older than 4.1.0 (legacy fallback).
    let profileSnapshotPath: string | null = null
    let profileName: string | null = null
    if (this._provider === 'claude' && this._projectId && this._projectSlug && this._cwd) {
      try {
        const selection = this._jobProfileSelection.get(jobId) // undefined|null|string
        this._jobProfileSelection.delete(jobId)
        const coreSupports = projectSupportsProfiles(this._cwd)
        if (selection !== null && coreSupports) {
          // selection is string (explicit) or undefined (default resolution)
          const {
            resolveProfile,
            snapshotForJob,
            persistJobProfile,
          } = require('./profile-manager') as typeof import('./profile-manager')
          const resolved = resolveProfile(this._cwd, selection ?? undefined)
          if (resolved) {
            profileSnapshotPath = snapshotForJob(this._projectSlug, jobId, resolved)
            profileName = resolved.name
            if (this._db) {
              persistJobProfile(this._db, jobId, resolved)
            }
          }
        }
      } catch (err) {
        // Profile resolution failures are non-fatal — rail falls back to
        // legacy behavior. The error is visible in logs for debugging.
        console.warn(`[queue-manager] profile resolution failed for job ${jobId}: ${(err as Error).message}`)
      }
    }

    // Read pipelineTelemetryEnabled at spawn time (not constructor time) so
    // toggling the setting takes effect on the next job without restarting.
    // Only inject for claude provider in hub mode (projectId is only set there).
    let spawnEnv: NodeJS.ProcessEnv = process.env
    if (this._provider === 'claude' && this._projectId && this._db) {
      const settings = getProjectSettings(this._db)
      if (settings.pipelineTelemetryEnabled) {
        const extra: Record<string, string> = {}
        if (profileName) extra['specrails.profile_name'] = profileName
        if (profileName) extra['specrails.profile_schema_version'] = '1'
        spawnEnv = {
          ...process.env,
          ...buildTelemetryEnv(jobId, this._projectId, this._hubPort, extra),
        }
      }
    }
    // Inject the profile path for claude even when telemetry is off.
    if (profileSnapshotPath) {
      spawnEnv = { ...spawnEnv, SPECRAILS_PROFILE_PATH: profileSnapshotPath }
    }

    // spawnAiCli reroutes multi-line argv values through stdin on Windows.
    const child = spawnAiCli(binary, args, {
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._cwd,
    })

    this._activeProcess = child
    this._activeJobId = jobId

    // Without this listener, an ENOENT (e.g. claude not on PATH) propagates
    // as an unhandled 'error' event and crashes the entire hub. Node still
    // emits 'close' afterwards, so the existing close handler fails the job
    // through the normal path — we only need to absorb the error event.
    /* c8 ignore next 3 -- spawn-failure path; exercised manually, not in CI */
    child.on('error', (err) => {
      console.error(`[QueueManager] spawn failed for job ${jobId} (${binary}): ${err.message}`)
    })

    // Start zombie detection timer. Reset on any raw data from the process.
    // Using 'data' events (not readline 'line') ensures the timer resets
    // synchronously in test environments with fake timers.
    this._resetZombieTimer()
    child.stdout!.on('data', () => { this._resetZombieTimer() })
    child.stderr!.on('data', () => { this._resetZombieTimer() })

    let eventSeq = 0
    let lastResultEvent: Record<string, unknown> | null = null

    if (this._db) {
      createJob(this._db, {
        id: jobId,
        command: job.command,
        started_at: job.startedAt!,
        priority: job.priority,
        depends_on_job_id: job.dependsOnJobId,
        pipeline_id: job.pipelineId,
      })
    }

    // ── Batched broadcast for high-frequency messages (log + event) ──────
    // Collects messages and flushes every ~80ms instead of one WS send per line.
    const pendingBroadcast: WsMessage[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const FLUSH_INTERVAL_MS = 80

    const batchedBroadcast = (msg: WsMessage): void => {
      pendingBroadcast.push(msg)
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null
          const batch = pendingBroadcast.splice(0)
          for (const m of batch) this._broadcast(m)
        }, FLUSH_INTERVAL_MS)
      }
    }

    const flushPending = (): void => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      const batch = pendingBroadcast.splice(0)
      for (const m of batch) this._broadcast(m)
    }

    const emitLine = (source: 'stdout' | 'stderr', line: string): void => {
      const msg: LogMessage = {
        type: 'log',
        source,
        line,
        timestamp: new Date().toISOString(),
        processId: jobId,
      }
      this._logBuffer.push(msg)
      if (this._logBuffer.length > LOG_BUFFER_MAX) {
        this._logBuffer.splice(0, LOG_BUFFER_DROP)
      }
      batchedBroadcast(msg)
    }

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    const stderrReader = createInterface({ input: child.stderr!, crlfDelay: Infinity })

    stdoutReader.on('line', (line) => {
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(line) } catch { /* plain text */ }

      if (parsed) {
        const eventType = (parsed.type as string) ?? 'unknown'
        if (this._db) {
          appendEvent(this._db, jobId, eventSeq++, {
            event_type: eventType,
            source: 'stdout',
            payload: line,
          })
        }
        batchedBroadcast({
          type: 'event',
          jobId,
          event_type: eventType,
          source: 'stdout',
          payload: line,
          timestamp: new Date().toISOString(),
          seq: eventSeq - 1,
        })
        if (eventType === 'result') {
          lastResultEvent = parsed
        }
        const displayText = extractDisplayText(parsed)
        if (displayText !== null) {
          if (this._db) {
            appendEvent(this._db, jobId, eventSeq++, {
              event_type: 'log',
              source: 'stdout',
              payload: JSON.stringify({ line: displayText }),
            })
          }
          emitLine('stdout', displayText)
        }
      } else {
        if (this._db) {
          appendEvent(this._db, jobId, eventSeq++, {
            event_type: 'log',
            source: 'stdout',
            payload: JSON.stringify({ line }),
          })
        }
        emitLine('stdout', line)
      }
    })

    stderrReader.on('line', (line) => {
      if (this._db) {
        appendEvent(this._db, jobId, eventSeq++, {
          event_type: 'log',
          source: 'stderr',
          payload: JSON.stringify({ line }),
        })
      }
      emitLine('stderr', line)
    })

    child.on('close', (code) => {
      flushPending() // flush any remaining batched messages before job exit

      // Codex doesn't emit a `result` JSON event — synthesise one so token/cost
      // tracking and cost alerts behave consistently for both providers.
      // cost is always 0 for codex (no token-level billing API exposed); this is
      // intentional so cost-threshold alerts remain inactive rather than firing
      // spuriously with a zero value.
      if (this._provider === 'codex' && lastResultEvent === null && code === 0) {
        const durationMs = job.startedAt
          ? Date.now() - new Date(job.startedAt).getTime()
          : 0
        lastResultEvent = {
          type: 'result',
          total_cost_usd: 0,
          model: this._resolvedModel ?? 'gpt-5.4-mini',
          duration_ms: durationMs,
          num_turns: 1,
        }
      }

      this._onJobExit(jobId, code, lastResultEvent, emitLine)
    })

    this._broadcastQueueState()
  }

  private _onJobExit(
    jobId: string,
    code: number | null,
    lastResultEvent: Record<string, unknown> | null,
    emitLine: (source: 'stdout' | 'stderr', line: string) => void
  ): void {
    this._clearZombieTimer()

    if (this._killTimer !== null) {
      clearTimeout(this._killTimer)
      this._killTimer = null
    }

    const job = this._jobs.get(jobId)
    if (!job) return

    const wasZombie = this._zombieJobs.has(jobId)
    const wasCanceling = this._cancelingJobs.has(jobId)
    this._zombieJobs.delete(jobId)
    this._cancelingJobs.delete(jobId)

    let finalStatus: Job['status']
    if (wasZombie) {
      finalStatus = 'zombie_terminated'
    } else if (wasCanceling) {
      finalStatus = 'canceled'
    } else if (code === 0) {
      finalStatus = 'completed'
    } else {
      finalStatus = 'failed'
    }

    job.status = finalStatus
    job.finishedAt = new Date().toISOString()
    job.exitCode = code

    // Capture result text for output chaining between pipeline steps
    if (lastResultEvent && typeof lastResultEvent.result === 'string') {
      job.resultText = lastResultEvent.result
    }

    this._activeProcess = null
    this._activeJobId = null

    if (this._db) {
      let tokenData: Partial<JobResult> = {}
      if (lastResultEvent) {
        const usage = lastResultEvent.usage as Record<string, number> | undefined
        tokenData = {
          tokens_in: usage?.input_tokens,
          tokens_out: usage?.output_tokens,
          tokens_cache_read: usage?.cache_read_input_tokens,
          tokens_cache_create: usage?.cache_creation_input_tokens,
          total_cost_usd: lastResultEvent.total_cost_usd as number | undefined,
          num_turns: lastResultEvent.num_turns as number | undefined,
          model: lastResultEvent.model as string | undefined,
          duration_ms: lastResultEvent.duration_ms as number | undefined,
          duration_api_ms: lastResultEvent.api_duration_ms as number | undefined,
          session_id: lastResultEvent.session_id as string | undefined,
        }
      }
      finishJob(this._db, jobId, {
        exit_code: code ?? -1,
        status: finalStatus,
        ...tokenData,
      })
      const jobCost = lastResultEvent?.total_cost_usd as number | undefined
      const costStr = jobCost != null ? ` | cost: $${jobCost.toFixed(4)}` : ''
      emitLine('stdout', `[process exited with code ${code ?? 'unknown'}${costStr}]`)

      // Cost alert: check per-job threshold (hub-level, then per-project)
      if (jobCost != null && finalStatus === 'completed') {
        const hubThreshold = this._getCostAlertThreshold?.() ?? null
        if (hubThreshold != null && jobCost >= hubThreshold) {
          this._broadcast({ type: 'cost_alert', projectId: '', jobId, cost: jobCost, threshold: hubThreshold })
        }

        // Per-project job cost threshold (alerts independently of hub threshold)
        const projectThresholdRow = this._db.prepare(
          `SELECT value FROM queue_state WHERE key = 'config.job_cost_threshold_usd'`
        ).get() as { value: string } | undefined
        if (projectThresholdRow) {
          const projectThreshold = parseFloat(projectThresholdRow.value)
          if (projectThreshold > 0 && jobCost >= projectThreshold) {
            this._broadcast({ type: 'cost_alert', projectId: '', jobId, cost: jobCost, threshold: projectThreshold })
          }
        }

        // Per-project daily budget: check total spend for today
        const dailyBudgetRow = this._db.prepare(
          `SELECT value FROM queue_state WHERE key = 'config.daily_budget_usd'`
        ).get() as { value: string } | undefined
        if (dailyBudgetRow) {
          const dailyBudget = parseFloat(dailyBudgetRow.value)
          if (dailyBudget > 0) {
            const spendRow = this._db.prepare(
              `SELECT COALESCE(SUM(total_cost_usd), 0) as total FROM jobs WHERE status = 'completed' AND total_cost_usd IS NOT NULL AND started_at >= date('now')`
            ).get() as { total: number }
            const dailySpend = spendRow.total
            if (dailySpend >= dailyBudget) {
              const wasPaused = this._paused
              this._paused = true
              if (!wasPaused) {
                this._db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('paused', 'true')`).run()
              }
              this._broadcast({ type: 'daily_budget_exceeded', projectId: '', dailySpend, budget: dailyBudget, queuePaused: true })
            }
          }
        }

        // Hub-level daily budget enforcement
        if (this._getHubDailyBudget) {
          const { budget: hubBudget, totalSpend: hubTotalSpend } = this._getHubDailyBudget()
          if (hubBudget != null && hubBudget > 0 && hubTotalSpend >= hubBudget) {
            const wasPaused = this._paused
            this._paused = true
            if (!wasPaused) {
              this._db.prepare(`INSERT OR REPLACE INTO queue_state (key, value) VALUES ('paused', 'true')`).run()
            }
            this._broadcast({ type: 'hub_daily_budget_exceeded', projectId: '', hubDailySpend: hubTotalSpend, hubBudget, queuePaused: true })
          }
        }
      }
    } else {
      emitLine('stdout', `[process exited with code ${code ?? 'unknown'}]`)
    }

    // Notify webhook handler (if any) about job completion/failure/cancellation
    if (this._onJobFinished && (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'canceled')) {
      const costUsd = this._db
        ? (this._db.prepare('SELECT total_cost_usd FROM jobs WHERE id = ?').get(jobId) as { total_cost_usd: number | null } | undefined)?.total_cost_usd ?? undefined
        : undefined
      this._onJobFinished(jobId, finalStatus, costUsd ?? undefined)
    }

    // Handle dependent jobs: skip them if parent did not complete successfully
    if (finalStatus !== 'completed') {
      this._skipDependents(jobId, `Parent job ${jobId} ${finalStatus}`)
    }

    // Check pipeline status
    if (job.pipelineId) {
      this._checkPipelineStatus(job.pipelineId)
    }

    this._broadcastQueueState()
    this._drainQueue()
  }

  private _resetZombieTimer(): void {
    if (this._zombieTimeoutMs <= 0) return
    if (this._inactivityTimer !== null) {
      clearTimeout(this._inactivityTimer)
    }
    const jobId = this._activeJobId
    if (!jobId) return
    this._inactivityTimer = setTimeout(() => {
      this._inactivityTimer = null
      this._onZombieDetected(jobId)
    }, this._zombieTimeoutMs)
  }

  private _clearZombieTimer(): void {
    if (this._inactivityTimer !== null) {
      clearTimeout(this._inactivityTimer)
      this._inactivityTimer = null
    }
  }

  private _onZombieDetected(jobId: string): void {
    const job = this._jobs.get(jobId)
    if (!job || job.status !== 'running') return

    this._clearZombieTimer()

    const timeoutSec = Math.round(this._zombieTimeoutMs / 1000)
    const line = `[zombie-detection] Job ${jobId} has been inactive for ${timeoutSec}s — auto-terminating`
    console.error(line)

    // Emit directly without going through emitLine (which would reset the zombie timer)
    const msg: LogMessage = {
      type: 'log',
      source: 'stderr',
      line,
      timestamp: new Date().toISOString(),
      processId: jobId,
    }
    this._logBuffer.push(msg)
    if (this._logBuffer.length > LOG_BUFFER_MAX) {
      this._logBuffer.splice(0, LOG_BUFFER_DROP)
    }
    this._broadcast(msg)

    this._zombieJobs.add(jobId)
    this._kill(jobId)
  }

  private _kill(jobId: string): void {
    if (!this._activeProcess || !this._activeProcess.pid) return

    this._clearZombieTimer()
    this._cancelingJobs.add(jobId)
    treeKill(this._activeProcess.pid, 'SIGTERM')

    const pid = this._activeProcess.pid
    this._killTimer = setTimeout(() => {
      treeKill(pid, 'SIGKILL', (err) => {
        if (err) {
          // SIGKILL failed — force cleanup so queue is not permanently blocked
          console.error(`[kill] SIGKILL failed for pid ${pid}: ${err.message}`)
          if (this._activeJobId === jobId) {
            const job = this._jobs.get(jobId)
            if (job && job.status === 'running') {
              job.status = 'failed'
              job.finishedAt = new Date().toISOString()
              if (this._db) {
                try {
                  this._db.prepare(
                    `UPDATE jobs SET status = 'failed', finished_at = CURRENT_TIMESTAMP WHERE id = ?`
                  ).run(jobId)
                } catch { /* ignore */ }
              }
            }
            this._activeProcess = null
            this._activeJobId = null
            this._cancelingJobs.delete(jobId)
            this._zombieJobs.delete(jobId)
            this._broadcastQueueState()
            this._drainQueue()
          }
        }
      })
      this._killTimer = null
    }, 5000)
  }

  private _broadcastQueueState(): void {
    this._broadcast({
      type: 'queue',
      jobs: this.getJobs(),
      activeJobId: this._activeJobId,
      paused: this._paused,
      timestamp: new Date().toISOString(),
    })
  }

  private _persistJob(job: Job): void {
    if (!this._db) return
    // For queued jobs, we use the DB to store queue position and priority for startup restore.
    // We only upsert queue_position + priority + dependency fields — the rest is handled by createJob/finishJob.
    // Since this method is called for all status transitions, we use a flexible upsert
    // that only touches queue_position, priority, and dependency fields (for queued jobs) — other fields are
    // managed by the existing createJob/finishJob API.
    try {
      this._db.prepare(
        `UPDATE jobs SET queue_position = ?, priority = ?, depends_on_job_id = ?, pipeline_id = ? WHERE id = ?`
      ).run(job.queuePosition ?? null, job.priority, job.dependsOnJobId ?? null, job.pipelineId ?? null, job.id)
    } catch {
      // Job may not exist in DB yet
    }
  }

  private _persistQueueState(): void {
    if (!this._db) return
    try {
      this._db.prepare(
        `INSERT OR REPLACE INTO queue_state (key, value) VALUES ('paused', ?)`
      ).run(this._paused ? 'true' : 'false')
    } catch {
      // queue_state table may not exist if migration hasn't run
    }
  }

  private _restoreFromDb(): void {
    if (!this._db) return

    try {
      // Fail any jobs that were running when the server last shut down
      this._db.prepare(
        `UPDATE jobs SET status = 'failed', finished_at = CURRENT_TIMESTAMP WHERE status = 'running'`
      ).run()

      // Restore queued jobs in order (priority DESC then queue_position ASC)
      const rows = this._db.prepare(
        `SELECT id, command, queue_position, priority, depends_on_job_id, pipeline_id FROM jobs WHERE status = 'queued' ORDER BY queue_position ASC`
      ).all() as Array<{ id: string; command: string; queue_position: number | null; priority: string | null; depends_on_job_id: string | null; pipeline_id: string | null }>

      for (const row of rows) {
        const priority = (VALID_PRIORITIES.has(row.priority ?? '') ? row.priority : 'normal') as JobPriority
        const job: Job = {
          id: row.id,
          command: row.command,
          status: 'queued',
          queuePosition: row.queue_position,
          priority,
          startedAt: null,
          finishedAt: null,
          exitCode: null,
          dependsOnJobId: row.depends_on_job_id ?? null,
          pipelineId: row.pipeline_id ?? null,
          skipReason: null,
          resultText: null,
        }
        this._jobs.set(row.id, job)
        this._queue.push(row.id)
      }

      // Re-sort queue by priority (higher first), preserving FIFO within same level
      this._queue.sort((a, b) => {
        const jobA = this._jobs.get(a)!
        const jobB = this._jobs.get(b)!
        return PRIORITY_WEIGHT[jobB.priority] - PRIORITY_WEIGHT[jobA.priority]
      })
      this._recomputePositions()

      // Restore pause state
      const pauseRow = this._db.prepare(
        `SELECT value FROM queue_state WHERE key = 'paused'`
      ).get() as { value: string } | undefined

      this._paused = pauseRow?.value === 'true'
    } catch {
      // DB may not have queue_state table yet — ignore
    }

    // Kick off any restored queued jobs that are ready to run
    this._drainQueue()
  }

  private _isDependencyMet(job: Job): boolean {
    if (!job.dependsOnJobId) return true

    const parent = this._jobs.get(job.dependsOnJobId)
    if (parent) return parent.status === 'completed'

    if (this._db) {
      const row = this._db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.dependsOnJobId) as { status: string } | undefined
      if (row) return row.status === 'completed'
    }

    return true
  }

  private _skipDependents(parentJobId: string, reason: string): void {
    const toSkip: string[] = []

    for (const [id, job] of this._jobs) {
      if (job.dependsOnJobId === parentJobId && job.status === 'queued') {
        toSkip.push(id)
      }
    }

    for (const id of toSkip) {
      const job = this._jobs.get(id)
      if (!job) continue

      const idx = this._queue.indexOf(id)
      if (idx !== -1) this._queue.splice(idx, 1)

      job.status = 'skipped'
      job.finishedAt = new Date().toISOString()
      job.skipReason = reason

      if (this._db) {
        // Ensure the job row exists before updating (queued jobs may not have been persisted via createJob yet)
        const exists = this._db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(id)
        if (!exists) {
          this._db.prepare(
            `INSERT INTO jobs (id, command, started_at, status, skip_reason, finished_at, depends_on_job_id, pipeline_id) VALUES (?, ?, ?, 'skipped', ?, ?, ?, ?)`
          ).run(id, job.command, job.finishedAt, reason, job.finishedAt, job.dependsOnJobId, job.pipelineId)
        } else {
          skipJob(this._db, id, reason)
        }
      }

      this._skipDependents(id, `Parent job ${id} was skipped`)
    }
  }

  private _checkPipelineStatus(pipelineId: string): void {
    const pipelineJobs = Array.from(this._jobs.values()).filter(j => j.pipelineId === pipelineId)
    if (pipelineJobs.length === 0) return

    const allDone = pipelineJobs.every(j => j.status === 'completed')
    const anyFailed = pipelineJobs.some(j =>
      j.status === 'failed' || j.status === 'skipped' || j.status === 'canceled' || j.status === 'zombie_terminated'
    )
    const anyPending = pipelineJobs.some(j => j.status === 'queued' || j.status === 'running')

    if (allDone) {
      this._broadcast({ type: 'pipeline_status', pipelineId, status: 'completed' })
    } else if (anyFailed && !anyPending) {
      this._broadcast({ type: 'pipeline_status', pipelineId, status: 'failed' })
    }
  }

  private _recomputePositions(): void {
    this._queue.forEach((id, index) => {
      const job = this._jobs.get(id)
      if (job) {
        job.queuePosition = index + 1
      }
    })
  }
}
