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
import { recordInvocation } from './ai-invocations'
import { isCodeExplorerEnabled, isAskHubEnabled as isAskHubEnabledLocal } from './feature-flags'
import {
  snapshotWorkingTree,
  diffAgainstSnapshot,
  collectDiffPatches,
  recordProvenanceForJob,
  broadcastProvenanceUpdated,
} from './file-provenance'
import { finaliseInvocationResult } from './result-event'
import { randomUUID } from 'crypto'
import { getAdapter, type ProviderAdapter, type AdapterEvent } from './providers'
import { createCodexOtelBridge, type CodexOtelBridge } from './codex-otel-bridge'
import { createJob, finishJob, appendEvent, skipJob, getProjectSettings } from './db'
import type { JobResult } from './db'
import type { CommandInfo } from './config'
import { attachmentManager, USER_ATTACHMENT_SYSTEM_NOTE } from './attachment-manager'
import { extractTicketIdsFromCommand, readStore, resolveTicketStoragePath } from './ticket-store'

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
  // ── Claude `--output-format stream-json` ───────────────────────────────
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
  // ── Codex `exec --json` event types ───────────────────────────────────
  // Codex shape differs from claude: items are nested under `item` with a
  // discriminator at `item.type`. Without explicit handling the Job Detail
  // log shows only the spawn preamble and exit notice — exactly the
  // "2 / 2 lines" symptom that masks 200k+ tokens of real work.
  if (type === 'item.completed' || type === 'item.started') {
    const item = event.item as Record<string, unknown> | undefined
    if (!item) return null
    const itemType = item.type as string | undefined
    if (itemType === 'agent_message') {
      const text = (item.text as string | undefined)?.trim()
      return text && text.length > 0 ? text : null
    }
    if (itemType === 'command_execution') {
      // Only surface the completed line so the log isn't doubled with the
      // matching `item.started` placeholder.
      if (type !== 'item.completed') return null
      const cmd = (item.command as string | undefined) ?? ''
      const exitCode = item.exit_code as number | null | undefined
      const exitStr = typeof exitCode === 'number' ? ` → exit ${exitCode}` : ''
      return `[exec]${exitStr} ${cmd.slice(0, 200)}`
    }
    if (itemType === 'agent_reasoning') {
      const text = (item.text as string | undefined)?.trim()
      return text && text.length > 0 ? `[reasoning] ${text.slice(0, 200)}` : null
    }
    return null
  }
  if (type === 'thread.started' || type === 'turn.started' || type === 'turn.completed') {
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
  private _adapter: ProviderAdapter
  /** Effective model to use when spawning processes. For Claude the adapter
   *  reads its own config; this is the override that gets passed via `--model`.
   *  For codex it controls the catalog model used at spawn time and as the
   *  fallback model name stamped onto the ai_invocations row. */
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
  /** Pre-spawn working-tree snapshot refs keyed by jobId — read at exit time
   *  by the Code-Explorer provenance hook. Cleared on job exit. */
  private _snapshotRefs: Map<string, string>

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
    this._adapter = getAdapter(options?.provider ?? 'claude')
    this._resolvedModel = options?.resolvedModel ?? null
    this._onJobFinished = options?.onJobFinished ?? null
    this._projectId = options?.projectId ?? null
    this._hubPort = options?.hubPort ?? 4200
    this._projectSlug = options?.projectSlug ?? null
    this._jobProfileSelection = new Map()
    this._snapshotRefs = new Map()

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

    if (this._adapter.id === 'codex') {
      if (!codexOnPath()) throw new CodexNotFoundError()
    } else if (this._adapter.id === 'claude') {
      if (!claudeOnPath()) throw new ClaudeNotFoundError()
    } else {
      // Future providers reuse the same pattern: a quick `which` probe via
      // the adapter's binary. We don't throw a typed *NotFoundError because
      // none has been declared; the adapter's id surfaces in the error.
      try {
        execSync(`${_WHICH_CMD} ${this._adapter.binary}`, { stdio: 'ignore' })
      } catch {
        throw new Error(`${this._adapter.binary} binary not found`)
      }
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
    return extractTicketIdsFromCommand(command)
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

  private async _startJob(jobId: string): Promise<void> {
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
        'The #<id> references in the command correspond to ticket IDs inside .specrails/local-tickets.json. ' +
        'Do NOT require jq to inspect this file; on Windows or when jq is unavailable, use PowerShell (`Get-Content .specrails/local-tickets.json -Raw | ConvertFrom-Json`) or Node.js built-ins. ' +
        'When running tests, use the project-defined scripts and package manager commands as-is; do NOT add Jest-only flags such as --runInBand to Vitest commands.'

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

    const binary = this._adapter.binary
    // Adapter-specific slash-command syntax:
    //  - claude: native `/specrails:foo` recognised by Claude CLI directly,
    //    so we pass the command verbatim and the system prompt rides along
    //    via `--system-prompt`.
    //  - codex: there is no `/namespace:cmd` parser; instead codex uses
    //    `$skill_name` to invoke a skill from `.codex/skills/<name>/SKILL.md`.
    //    Translate `/specrails:<name>` → `$<name>` so codex picks up the
    //    matching skill natively (which our scaffold writes for every
    //    claude slash command — propose-spec, implement, batch-implement,
    //    explore-spec, retry, …). This is the rail equivalent of the
    //    user typing `$implement #1 --yes` themselves in `codex`.
    const railPrompt = this._adapter.id === 'codex'
      ? commandToRun.replace(/^\/(specrails|sr):([\w-]+)/, '$$$2')
      : commandToRun
    const railModel = this._adapter.id === 'claude' && this._db
      ? getProjectSettings(this._db).orchestratorModel
      : (this._resolvedModel ?? this._adapter.defaultModel())
    const args = this._adapter.buildArgs('rail-job', {
      prompt: railPrompt,
      systemPrompt: systemAppend || undefined,
      model: railModel,
    })

    // Resolve agent profile (if any) and snapshot per-job before spawn.
    // Hub mode only (projectId + projectSlug + cwd all present).
    // Skipped when the adapter does not honour `SPECRAILS_PROFILE_PATH` AND
    // when the project's installed specrails-core is older than the
    // provider's minimum core version (legacy fallback). Codex skill rails
    // ship in specrails-core 4.6.0+; the projectSupportsProfiles probe today
    // checks the claude minimum (4.1.0) — extending it per-provider is
    // tracked in OpenSpec change task §13.
    let profileSnapshotPath: string | null = null
    let profileName: string | null = null
    if (this._adapter.capabilities.profileEnvSupport && this._projectId && this._projectSlug && this._cwd) {
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
    // OTEL env injection is gated on `adapter.capabilities.nativeOtelEnv`:
    // claude honours OTEL_* env vars natively; codex does not and instead
    // gets signals synthesised by the codex-otel-bridge attached below.
    let spawnEnv: NodeJS.ProcessEnv = process.env
    const telemetryEnabled = !!(this._projectId && this._db && getProjectSettings(this._db).pipelineTelemetryEnabled)
    if (telemetryEnabled && this._adapter.capabilities.nativeOtelEnv && this._projectId) {
      const extra: Record<string, string> = {}
      if (profileName) extra['specrails.profile_name'] = profileName
      if (profileName) extra['specrails.profile_schema_version'] = '1'
      spawnEnv = {
        ...process.env,
        ...buildTelemetryEnv(jobId, this._projectId, this._hubPort, extra),
      }
    }
    // Inject the profile path whenever the adapter honours it (was: claude-
    // only). The codex skill rails read SPECRAILS_PROFILE_PATH the same way.
    if (profileSnapshotPath) {
      spawnEnv = { ...spawnEnv, SPECRAILS_PROFILE_PATH: profileSnapshotPath }
    }

    // ─── Plugin resolution + snapshot ──────────────────────────────────────
    // Active = installed + verify ok; degraded = installed but verify failed
    // or timed out. Degraded does NOT block spawn — rail proceeds, UI gets
    // a `plugin.degraded` event so the user can reinstall.
    //
    // Today PluginManager only supports the `project-json` MCP registration
    // (claude). Codex (`cli-add`) is covered by tasks §14 — until that lands
    // we skip plugin resolution for non-`project-json` adapters so the rail
    // spawns cleanly without errors.
    let pluginActive: Array<{ name: string; version: string }> = []
    let pluginDegraded: Array<{ name: string; reason: string }> = []
    let pluginSnapshotPath: string | null = null
    if (this._adapter.mcpRegistration === 'project-json' && this._projectId && this._projectSlug && this._cwd) {
      try {
        const { resolvePluginsForSpawn, snapshotPluginsForJob } =
          require('./plugins/rail-integration') as typeof import('./plugins/rail-integration')
        const resolution = await resolvePluginsForSpawn(this._cwd, this._projectId, jobId)
        pluginActive = resolution.active
        pluginDegraded = resolution.degraded
        if (pluginActive.length > 0 || pluginDegraded.length > 0) {
          pluginSnapshotPath = snapshotPluginsForJob(
            this._projectSlug, jobId, this._projectId, pluginActive, pluginDegraded,
          )
        }
        for (const d of pluginDegraded) {
          this._broadcast({
            type: 'plugin.degraded',
            projectId: this._projectId,
            name: d.name,
            reason: d.reason,
            jobId,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.warn(`[queue-manager] plugin resolution failed for job ${jobId}: ${(err as Error).message}`)
      }
    }
    if (pluginActive.length > 0 && pluginSnapshotPath) {
      spawnEnv = {
        ...spawnEnv,
        SPECRAILS_PLUGINS_ACTIVE: pluginActive.map((p) => p.name).join(','),
        SPECRAILS_PLUGINS_SNAPSHOT: pluginSnapshotPath,
      }
    }
    // Add OTEL attrs when telemetry already on AND the adapter accepts env
    // injection. Codex spawns receive these attributes via the bridge's
    // resource attribute block instead (see codex-otel-bridge.ts).
    if (this._adapter.capabilities.nativeOtelEnv && this._projectId && this._db) {
      const settings = getProjectSettings(this._db)
      if (settings.pipelineTelemetryEnabled && (pluginActive.length > 0 || pluginDegraded.length > 0)) {
        const extra: Record<string, string> = {}
        if (pluginActive.length > 0) {
          extra['specrails.plugins.active'] = JSON.stringify(pluginActive.map((p) => p.name))
          extra['specrails.plugins.versions'] = JSON.stringify(
            Object.fromEntries(pluginActive.map((p) => [p.name, p.version])),
          )
        }
        if (pluginDegraded.length > 0) {
          extra['specrails.plugins.degraded'] = JSON.stringify(pluginDegraded.map((d) => d.name))
        }
        spawnEnv = {
          ...spawnEnv,
          ...buildTelemetryEnv(jobId, this._projectId, this._hubPort, extra),
        }
      }
    }

    // Code-Explorer pre-spawn snapshot. Captures the working-tree state via
    // `git stash create --include-untracked` so the post-exit hook can diff
    // against it. Gated by SPECRAILS_CODE_EXPLORER — when off, no-op.
    if (isCodeExplorerEnabled() && this._cwd) {
      try {
        const ref = snapshotWorkingTree(this._cwd)
        this._snapshotRefs.set(jobId, ref)
      } catch (err) {
        console.warn(`[queue-manager] provenance snapshot failed: ${(err as Error).message}`)
      }
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

    // Accumulator of parsed AdapterEvent for finaliseInvocationResult on close.
    const adapterEvents: AdapterEvent[] = []

    // Synthetic OTEL bridge for providers whose CLI does not honour OTEL_*
    // env vars (codex today). Lifecycle bound to the spawn's close handler.
    let otelBridge: CodexOtelBridge | null = null
    if (telemetryEnabled && !this._adapter.capabilities.nativeOtelEnv && this._projectId) {
      otelBridge = createCodexOtelBridge({
        jobId,
        projectId: this._projectId,
        hubPort: this._hubPort,
        model: railModel,
      })
    }

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

      // Feed the adapter for the canonical event shape used by
      // finaliseInvocationResult and (optionally) the OTEL bridge. Done
      // alongside the raw event persistence below, NOT in place of it: the
      // raw event log is what feeds the live Job Detail UI and the
      // telemetry export ZIP for non-bridge providers.
      const adapterEv = this._adapter.parseStreamLine(line)
      if (adapterEv) {
        adapterEvents.push(adapterEv)
        otelBridge?.consumeEvent(adapterEv)
      }

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
        // For adapters whose stream is JSONL (claude, codex), a non-parseable
        // line is unexpected noise. For future plain-text adapters this is
        // their normal output. emitLine surfaces it either way.
        if (adapterEv?.kind === 'text-delta') {
          emitLine('stdout', adapterEv.text)
        } else {
          emitLine('stdout', line)
        }
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

      // Finalise the OTEL bridge (best-effort, async). The bridge POSTs to
      // the in-process OTLP receiver; failures are warned, not thrown.
      if (otelBridge) {
        otelBridge.finalize({ exitCode: code }).catch((err) => {
          console.warn('[queue-manager] otel bridge finalize failed:', err)
        })
      }

      this._onJobExit(jobId, code, lastResultEvent, emitLine, adapterEvents, railModel)
    })

    this._broadcastQueueState()
  }

  private _onJobExit(
    jobId: string,
    code: number | null,
    lastResultEvent: Record<string, unknown> | null,
    emitLine: (source: 'stdout' | 'stderr', line: string) => void,
    adapterEvents: readonly AdapterEvent[] = [],
    spawnedModel?: string,
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
      // Adapter-driven result finalisation handles tokens, cost (or pricing-
      // table estimate for non-native-cost providers), and session_id stamping.
      const { result: normalised, estimated } = finaliseInvocationResult(
        this._adapter,
        adapterEvents,
        { fallbackModel: spawnedModel },
      )
      const tokenData: Partial<JobResult> = lastResultEvent || adapterEvents.length > 0
        ? {
            tokens_in: normalised.tokens_in,
            tokens_out: normalised.tokens_out,
            tokens_cache_read: normalised.tokens_cache_read,
            tokens_cache_create: normalised.tokens_cache_create,
            total_cost_usd: normalised.total_cost_usd,
            num_turns: normalised.num_turns,
            model: normalised.model,
            duration_ms: normalised.duration_ms,
            duration_api_ms: normalised.duration_api_ms,
            session_id: normalised.session_id,
          }
        : {}
      finishJob(this._db, jobId, {
        exit_code: code ?? -1,
        status: finalStatus,
        ...tokenData,
      })

      // ai_invocations capture (surface='job'). One row per job exit.
      if (this._projectId) {
        try {
          const invStatus = finalStatus === 'completed'
            ? 'success'
            : (finalStatus === 'canceled' || finalStatus === 'zombie_terminated')
              ? 'aborted'
              : 'failed'
          const ticketIds = this._extractTicketIds(job.command)
          recordInvocation(this._db, {
            id: randomUUID(),
            project_id: this._projectId,
            provider: this._adapter.id,
            surface: 'job',
            surface_ref_id: jobId,
            ticket_id: ticketIds[0] ?? null,
            status: invStatus,
            started_at: job.startedAt ?? new Date().toISOString(),
            finished_at: job.finishedAt,
            total_cost_usd_estimated: estimated,
            ...normalised,
          })
          this._broadcast({ type: 'spending.invalidated', projectId: this._projectId })
        } catch (err) {
          console.error('[queue-manager] recordInvocation failed:', err)
        }
      }

      // Code-Explorer post-exit provenance hook. Diffs the working tree against
      // the pre-spawn snapshot and inserts one row per touched path. Gated by
      // SPECRAILS_CODE_EXPLORER (re-checked at each completion so the flag can
      // be flipped off mid-session without leaving partial writes).
      if (isCodeExplorerEnabled() && this._cwd && this._projectId) {
        const ref = this._snapshotRefs.get(jobId) ?? ''
        this._snapshotRefs.delete(jobId)
        try {
          const diff = diffAgainstSnapshot(this._cwd, ref)
          const patches = collectDiffPatches(this._cwd, ref, diff)
          if (diff.length > 50) {
            console.warn(`[provenance.large_job] job=${jobId} files=${diff.length}`)
          }
          const ticketIds = this._extractTicketIds(job.command)
          const rows = recordProvenanceForJob(
            this._db,
            this._projectId,
            jobId,
            ticketIds[0] ?? null,
            diff,
            Date.now(),
            patches,
          )
          for (const row of rows) {
            broadcastProvenanceUpdated(this._broadcast, this._projectId, row)
          }
        } catch (err) {
          console.warn(`[queue-manager] provenance recording failed: ${(err as Error).message}`)
        }
      }

      // Ask-the-Hub incremental index — upsert a `job` doc plus any newly
      // touched ticket docs. Fire-and-forget; failures never affect the rail.
      if (isAskHubEnabledLocal() && this._cwd && this._projectId) {
        const projectId = this._projectId
        const projectPath = this._cwd
        const db = this._db
        const command = job.command
        const broadcast = this._broadcast as unknown as (m: Record<string, unknown>) => void
        void (async () => {
          try {
            const ask = await import('./ask/indexer')
            const chunker = await import('./ask/chunker')
            const enumerator = await import('./ask/enumerator')
            // Job doc
            await ask.upsertDoc(db, projectId, chunker.chunkJob({
              id: jobId, command, status: finalStatus, finished_at: new Date().toISOString(),
            }))
            // Touched tickets
            const ticketIds = this._extractTicketIds(command)
            if (ticketIds.length > 0) {
              const ctx = { db, projectPath, projectStateDir: '' }
              const tickets = enumerator.enumerateTickets(ctx)
              for (const t of tickets) {
                if (t.ticket_id != null && ticketIds.includes(Number(t.ticket_id))) {
                  await ask.upsertDoc(db, projectId, t)
                }
              }
            }
            broadcast({ type: 'ask.index_updated', added: 0, updated: 1 })
          } catch (err) {
            console.warn(`[queue-manager] ask reindex failed: ${(err as Error).message}`)
          }
        })()
      }

      // Cost comes from the normalised result so providers without a native
      // total_cost_usd field (codex today) still trigger cost alerts based on
      // the pricing-table estimate. When `estimated`, the figure is best-
      // effort — alerts still fire because the user opted into the threshold
      // explicitly and a noisy alert is better than a missed one.
      const jobCost = normalised.total_cost_usd
      const costStr = jobCost != null ? ` | cost: ${estimated ? '~' : ''}$${jobCost.toFixed(4)}` : ''
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
