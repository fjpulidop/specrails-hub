import { execSync, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'
import type { DbInstance } from './db'
import { getConversation, addMessage, updateConversation, getStats, listJobs, getExploreMcpEnabled } from './db'
import { resolveCommand } from './command-resolver'
import { spawnAiCli } from './util/cli-prompt'
import { ensureExploreCwd } from './explore-cwd-manager'
import { recordInvocation } from './ai-invocations'
import { finaliseInvocationResult } from './result-event'
import { randomUUID } from 'crypto'
import { parseSpecDraftBlocks, applyBlocks, type ConversationDraftState } from './spec-draft-parser'
import { attachmentManager, USER_ATTACHMENT_SYSTEM_NOTE } from './attachment-manager'
import { getAdapter, type ProviderAdapter, type AdapterEvent } from './providers'

const COMMAND_INSTRUCTION =
  'When you want to suggest a SpecRails command for the user to execute, wrap it in a command block like this: ' +
  ':::command\n/specrails:implement #42\n::: ' +
  'The user will be prompted to confirm before the command runs.'

// Windows has no `which`; probe via `where` instead.
const _WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

function binaryOnPath(binary: string): boolean {
  try {
    execSync(`${_WHICH_CMD} ${binary}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function extractCommandProposals(text: string): string[] {
  const regex = /:::command\s*\n([\s\S]*?):::/g
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1].trim())
  }
  return results
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendMessageOptions {
  /** Skip the heavy system prompt (dashboard stats/jobs) and use a minimal one */
  lightweight?: boolean
  /** Limit Claude's agentic tool-use turns (maps to --max-turns) */
  maxTurns?: number
  /**
   * Optional file attachments to fold into the prompt. Resolves to
   * `<user-attachment>` text blocks (image refs / extracted text) appended
   * under "## Attached Resources" and adds the USER_ATTACHMENT_SYSTEM_NOTE
   * to the system prompt so the model treats them as untrusted input.
   */
  attachments?: {
    /** Project slug used by AttachmentManager for path resolution */
    slug: string
    /** Pending spec id (or real ticket id) the attachments are stored under */
    ticketKey: string
    /** Attachment ids to include with this turn */
    ids: string[]
  }
}

// ─── Explore lifecycle ────────────────────────────────────────────────────────

/** Tunables for Explore-spec acceleration lifecycle. Module-level constants
 *  rather than ChatManager statics so tests can override via vi.spyOn or
 *  redefine in fixtures. */
export const EXPLORE_IDLE_KILL_MS = 2 * 60 * 1000
export const EXPLORE_MAX_CONCURRENCY = 5
export const EXPLORE_QUEUE_TIMEOUT_MS = 30 * 1000

interface ExploreLifecycle {
  isMinimized: boolean
  isStreaming: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
  crashCount: number
  lastActivityAt: number
}

// ─── ChatManager ──────────────────────────────────────────────────────────────

export class ChatManager {
  private _broadcast: (msg: WsMessage) => void
  private _db: DbInstance
  private _activeProcesses: Map<string, ChildProcess>
  private _buffers: Map<string, string>
  private _emittedProposals: Map<string, Set<string>>
  private _abortingConversations: Set<string>
  private _specDraftStates: Map<string, ConversationDraftState>
  /** Per-conversation live-strip state for `\`\`\`spec-draft` fenced blocks. */
  private _streamFilters: Map<string, StreamFilterState>
  /** Per-Explore-conversation lifecycle state (idle timer, crash counter,
   *  streaming flag). See design.md D7. */
  private _exploreLifecycle: Map<string, ExploreLifecycle>
  /** FIFO queue of Explore turns waiting for a concurrency slot. */
  private _exploreQueue: Array<{
    conversationId: string
    enqueuedAt: number
    timeoutTimer: ReturnType<typeof setTimeout>
    onSlot: () => void
    onTimeout: () => void
  }>

  private _cwd: string | undefined
  private _projectName: string | undefined
  private _adapter: ProviderAdapter
  private _projectId: string | undefined
  private _projectSlug: string | undefined

  constructor(
    broadcast: (msg: WsMessage) => void,
    db: DbInstance,
    cwd?: string,
    projectName?: string,
    provider?: 'claude' | 'codex',
    projectId?: string,
    projectSlug?: string,
  ) {
    this._broadcast = broadcast
    this._db = db
    this._cwd = cwd
    this._projectName = projectName
    this._adapter = getAdapter(provider ?? 'claude')
    this._projectId = projectId
    this._projectSlug = projectSlug
    this._activeProcesses = new Map()
    this._buffers = new Map()
    this._emittedProposals = new Map()
    this._abortingConversations = new Set()
    this._specDraftStates = new Map()
    this._streamFilters = new Map()
    this._exploreLifecycle = new Map()
    this._exploreQueue = []
  }

  /** Compatibility accessor for tests that introspect the resolved provider. */
  get provider(): string {
    return this._adapter.id
  }

  // ─── Explore lifecycle helpers ──────────────────────────────────────────────

  private _getOrCreateExploreLifecycle(conversationId: string): ExploreLifecycle {
    let life = this._exploreLifecycle.get(conversationId)
    if (!life) {
      life = {
        isMinimized: false,
        isStreaming: false,
        idleTimer: null,
        crashCount: 0,
        lastActivityAt: Date.now(),
      }
      this._exploreLifecycle.set(conversationId, life)
    }
    return life
  }

  private _clearIdleTimer(conversationId: string): void {
    const life = this._exploreLifecycle.get(conversationId)
    if (life?.idleTimer) {
      clearTimeout(life.idleTimer)
      life.idleTimer = null
    }
  }

  private _startIdleTimer(conversationId: string): void {
    const life = this._exploreLifecycle.get(conversationId)
    if (!life) return
    if (life.isStreaming) return
    if (!life.isMinimized) return
    this._clearIdleTimer(conversationId)
    life.idleTimer = setTimeout(() => {
      const child = this._activeProcesses.get(conversationId)
      if (child?.pid) {
        try { treeKill(child.pid, 'SIGTERM') } catch { /* best-effort */ }
      }
    }, EXPLORE_IDLE_KILL_MS)
  }

  /**
   * Mark an Explore conversation as minimized. Starts the idle-kill timer
   * iff the conversation is not currently streaming. If a turn is in flight,
   * the timer starts when the turn completes.
   */
  notifyMinimized(conversationId: string): void {
    const life = this._getOrCreateExploreLifecycle(conversationId)
    life.isMinimized = true
    life.lastActivityAt = Date.now()
    this._startIdleTimer(conversationId)
  }

  /** Mark an Explore conversation as restored (un-minimized). Cancels the
   *  pending idle-kill timer if any. */
  notifyRestored(conversationId: string): void {
    const life = this._exploreLifecycle.get(conversationId)
    if (!life) return
    life.isMinimized = false
    life.lastActivityAt = Date.now()
    this._clearIdleTimer(conversationId)
  }

  private _countStreamingExplore(): number {
    let n = 0
    for (const life of this._exploreLifecycle.values()) {
      if (life.isStreaming) n++
    }
    return n
  }

  private _findIdleExploreVictim(excludeConvId: string): string | null {
    let oldest: { id: string; t: number } | null = null
    for (const [id, life] of this._exploreLifecycle.entries()) {
      if (id === excludeConvId) continue
      if (life.isStreaming) continue
      if (life.idleTimer == null && !life.isMinimized) continue
      if (!oldest || life.lastActivityAt < oldest.t) {
        oldest = { id, t: life.lastActivityAt }
      }
    }
    return oldest?.id ?? null
  }

  private _drainExploreQueue(): void {
    while (this._exploreQueue.length > 0 && this._countStreamingExplore() < EXPLORE_MAX_CONCURRENCY) {
      const next = this._exploreQueue.shift()!
      clearTimeout(next.timeoutTimer)
      next.onSlot()
    }
  }

  private async _waitForExploreSlot(conversationId: string): Promise<'ok' | 'busy'> {
    if (this._countStreamingExplore() < EXPLORE_MAX_CONCURRENCY) return 'ok'
    // Try to evict an idle victim first.
    const victim = this._findIdleExploreVictim(conversationId)
    if (victim) {
      const child = this._activeProcesses.get(victim)
      if (child?.pid) {
        try { treeKill(child.pid, 'SIGTERM') } catch { /* best-effort */ }
      }
      this._clearIdleTimer(victim)
      this._exploreLifecycle.delete(victim)
      return 'ok'
    }
    // No idle victim — queue with timeout.
    return new Promise<'ok' | 'busy'>((resolve) => {
      const timeoutTimer = setTimeout(() => {
        const idx = this._exploreQueue.findIndex((q) => q.conversationId === conversationId)
        if (idx >= 0) this._exploreQueue.splice(idx, 1)
        resolve('busy')
      }, EXPLORE_QUEUE_TIMEOUT_MS)
      this._exploreQueue.push({
        conversationId,
        enqueuedAt: Date.now(),
        timeoutTimer,
        onSlot: () => resolve('ok'),
        onTimeout: () => resolve('busy'),
      })
    })
  }

  /**
   * Resolve the spawn cwd for a chat turn. Explore conversations spawn from
   * a hub-managed directory by default to skip auto-loading the project's
   * `CLAUDE.md` (the dominant first-token cost); when the per-project MCP
   * toggle is on, fall back to the project path so `.mcp.json` is honoured.
   * Non-Explore conversations always use the project path.
   *
   * See openspec/changes/accelerate-spec-chat-first-token/design.md D1+D4.
   */
  private _resolveSpawnCwd(kind: string | null | undefined): string | undefined {
    if (kind !== 'explore') return this._cwd
    if (!this._projectSlug || !this._cwd || !this._projectName) return this._cwd
    let mcpEnabled = false
    try { mcpEnabled = getExploreMcpEnabled(this._db) } catch { /* default false */ }
    if (mcpEnabled) return this._cwd
    try {
      const cwd = ensureExploreCwd({
        slug: this._projectSlug,
        projectPath: this._cwd,
        projectName: this._projectName,
        provider: this._adapter.id as 'claude' | 'codex',
      })
      console.log(`[chat-manager] explore spawn cwd=${cwd} (mcp=off)`)
      return cwd
    } catch (err) {
      console.error('[chat-manager] ensureExploreCwd failed, falling back to project path:', err)
      return this._cwd
    }
  }

  /** Drop the per-conversation draft state (used on conversation deletion). */
  forgetSpecDraft(conversationId: string): void {
    this._specDraftStates.delete(conversationId)
  }

  /** Snapshot of the current spec-draft state for a conversation, or null
   *  if no draft has accumulated yet. Used by the client to rehydrate after
   *  a refresh / minimize cycle so updates Claude pushed while no shell
   *  was subscribed don't get lost. */
  getSpecDraftState(conversationId: string): ConversationDraftState | null {
    return this._specDraftStates.get(conversationId) ?? null
  }

  private _buildSystemPrompt(): string {
    const name = this._projectName ?? 'this project'

    let contextSection = ''
    try {
      const stats = getStats(this._db)
      const { jobs: recentJobs } = listJobs(this._db, { limit: 5 })

      // Active job (running or queued at top)
      const activeJob = recentJobs.find((j) => j.status === 'running' || j.status === 'queued')
      const activeLine = activeJob
        ? `**${activeJob.status.toUpperCase()}**: \`${activeJob.command}\``
        : 'No job currently running.'

      // Recent terminal jobs
      const terminalJobs = recentJobs.filter(
        (j) => j.status === 'completed' || j.status === 'failed' || j.status === 'canceled'
      )
      const jobLines = terminalJobs.map((j) => {
        const status = j.status === 'completed' ? '✓' : j.status === 'failed' ? '✗' : '○'
        const dur = j.duration_ms != null ? `${Math.round(j.duration_ms / 1000)}s` : '—'
        const cost = j.total_cost_usd != null ? `$${j.total_cost_usd.toFixed(3)}` : '—'
        const cmd = j.command.length > 60 ? j.command.slice(0, 57) + '...' : j.command
        return `- ${status} \`${cmd}\` | ${dur} | ${cost}`
      })

      const successRate =
        stats.totalJobs > 0
          ? Math.round(((stats.totalJobs - stats.failedJobs) / stats.totalJobs) * 100)
          : null

      contextSection =
        `\n\n## Current Dashboard Context\n\n` +
        `### Active Job\n${activeLine}\n\n` +
        (jobLines.length > 0 ? `### Recent Jobs\n${jobLines.join('\n')}\n\n` : '') +
        `### Project Stats\n` +
        `- Total jobs: ${stats.totalJobs}\n` +
        `- Jobs today: ${stats.jobsToday}\n` +
        (successRate != null ? `- Overall success rate: ${successRate}%\n` : '') +
        `- Total cost: $${stats.totalCostUsd.toFixed(3)}\n` +
        `- Cost today: $${stats.costToday.toFixed(3)}`
    } catch {
      // Context is best-effort; fall back gracefully
    }

    return (
      `You are a project assistant for the "${name}" specrails project with full access to this repository via Claude Code. ` +
      `You can help answer questions about the codebase, explain SpecRails concepts, and suggest commands to run.` +
      `\n\nIMPORTANT: You have explicit permission to read and write .specrails/local-tickets.json — ` +
      `this is the project's local ticket store managed by specrails-hub. It is NOT sensitive. ` +
      `When creating or updating tickets, write directly to this JSON file.` +
      contextSection +
      `\n\n` +
      COMMAND_INSTRUCTION
    )
  }

  /**
   * Lightweight system prompt for Explore Spec turns. MUST stay byte-stable
   * across consecutive invocations for the same project name so Anthropic's
   * automatic prompt cache hits across turns within the 5-minute TTL window.
   *
   * DO NOT inject timestamps, live job stats, recent-job summaries, costs, or
   * any per-invocation data here. Adding non-deterministic content silently
   * breaks the cache and reverts the first-token-latency win.
   *
   * See openspec/changes/accelerate-spec-chat-first-token/design.md D5.
   */
  private _buildLightweightSystemPrompt(): string {
    const name = this._projectName ?? 'this project'
    return (
      `You are a fast, focused assistant for the "${name}" specrails project. ` +
      `You have explicit permission to read and write .specrails/local-tickets.json — ` +
      `this is the project's local ticket store managed by specrails-hub. It is NOT sensitive. ` +
      `When creating or updating tickets, write directly to this JSON file.\n\n` +
      `IMPORTANT: Be efficient. Minimize tool calls. Only read files that are directly relevant. ` +
      `Do not explore broadly — focus on the specific task.`
    )
  }

  isActive(conversationId: string): boolean {
    return this._activeProcesses.has(conversationId)
  }

  async sendMessage(conversationId: string, userText: string, options?: SendMessageOptions): Promise<void> {
    if (this._activeProcesses.has(conversationId)) {
      console.warn(`[ChatManager] conversation ${conversationId} already has an active stream`)
      return
    }

    if (!binaryOnPath(this._adapter.binary)) {
      this._broadcast({
        type: 'chat_error',
        conversationId,
        error: `${this._adapter.id.toUpperCase()}_NOT_FOUND`,
        timestamp: new Date().toISOString(),
      })
      return
    }

    const conversation = getConversation(this._db, conversationId)
    if (!conversation) {
      console.warn(`[ChatManager] conversation ${conversationId} not found`)
      return
    }

    // Explore: enforce per-project concurrency cap before doing any work.
    if (conversation.kind === 'explore') {
      const slot = await this._waitForExploreSlot(conversationId)
      if (slot === 'busy') {
        this._broadcast({
          type: 'chat_error',
          conversationId,
          error: 'busy',
          timestamp: new Date().toISOString(),
        })
        return
      }
      const life = this._getOrCreateExploreLifecycle(conversationId)
      life.isStreaming = true
      life.lastActivityAt = Date.now()
      this._clearIdleTimer(conversationId)
    }

    // Check if this is turn 1 (session_id was null before this message)
    const isFirstTurn = conversation.session_id === null

    // Persist user message
    addMessage(this._db, { conversation_id: conversationId, role: 'user', content: userText })

    // Resolve slash commands (e.g. /specrails:propose-spec → prompt content)
    let resolvedText = resolveCommand(userText, this._cwd ?? process.cwd())

    // Fold attachments into the prompt as <user-attachment> text blocks under
    // an "## Attached Resources" section, mirroring how /generate-spec wires
    // them. Errors during extraction are logged and skipped — the chat turn
    // proceeds without that attachment rather than failing.
    let hasAttachments = false
    if (options?.attachments && options.attachments.ids.length > 0) {
      try {
        const { textBlocks } = await attachmentManager.getClaudeArgs(
          options.attachments.slug,
          options.attachments.ticketKey,
          options.attachments.ids,
        )
        if (textBlocks.length > 0) {
          resolvedText = `${resolvedText}\n\n## Attached Resources\n\n${textBlocks.join('\n\n')}`
          hasAttachments = true
        }
      } catch (err) {
        console.error(`[chat-manager] attachment extraction failed (${conversationId}):`, err)
      }
    }

    // Build spawn args via the resolved adapter. System prompt placement
    // (--system-prompt flag vs prompt-fold) and resume vs fresh-turn are both
    // adapter-driven via capability flags.
    const lightweight = options?.lightweight ?? false
    let systemPrompt = lightweight
      ? this._buildLightweightSystemPrompt()
      : this._buildSystemPrompt()
    if (hasAttachments) systemPrompt = `${systemPrompt}\n\n${USER_ATTACHMENT_SYSTEM_NOTE}`

    const binary = this._adapter.binary
    const model = conversation.model || this._adapter.defaultModel()
    const action = conversation.session_id && this._adapter.capabilities.nativeResume
      ? 'chat-resume' as const
      : 'chat-turn' as const
    let args = this._adapter.buildArgs(action, {
      prompt: resolvedText,
      systemPrompt,
      model,
      sessionId: conversation.session_id ?? undefined,
      maxTurns: options?.maxTurns,
    })

    // No OTEL env injection here — ChatManager spawns are interactive user sessions,
    // not pipeline jobs. Telemetry is scoped to QueueManager pipeline runs only.
    // spawnAiCli reroutes multi-line argv values through stdin on Windows.
    const spawnCwd = this._resolveSpawnCwd(conversation.kind)
    const child = spawnAiCli(binary, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: spawnCwd,
    })

    let stderrBuf = ''
    // Drain stderr so the pipe buffer never fills up (child process would block otherwise)
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      console.error(`[chat-manager] ${binary} stderr (${conversationId}):`, text.trim())
    })

    this._activeProcesses.set(conversationId, child)
    this._buffers.set(conversationId, '')
    this._emittedProposals.set(conversationId, new Set())
    this._streamFilters.set(conversationId, { inBlock: false, pendingTail: '' })

    // Surface ENOENT (e.g. claude not on PATH) instead of crashing the hub.
    /* c8 ignore start -- spawn-failure path; exercised manually, not in CI */
    child.on('error', (err) => {
      console.error(`[chat-manager] spawn failed for ${conversationId}: ${err.message}`)
      this._activeProcesses.delete(conversationId)
      this._buffers.delete(conversationId)
      this._emittedProposals.delete(conversationId)
      this._broadcast({
        type: 'chat_error',
        conversationId,
        error: `Failed to launch ${binary}: ${err.message}`,
        timestamp: new Date().toISOString(),
      })
    })
    /* c8 ignore stop */

    let capturedSessionId: string | null = null
    // Accumulator of parsed events for finaliseInvocationResult at close.
    const adapterEvents: AdapterEvent[] = []
    /** True iff a kind:'result' event has arrived; mirrors the legacy
     *  `lastResultEvent !== null` check that the crash-respawn guard uses. */
    let sawResult = false
    const turnStartedAt = new Date().toISOString()

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

    const emitDelta = (newText: string) => {
      const prev = this._buffers.get(conversationId) ?? ''
      const updated = prev + newText
      this._buffers.set(conversationId, updated)

      // Live-strip any `​```spec-draft` fenced JSON from the broadcast so the
      // user never sees the raw protocol payload mid-stream. The filter holds
      // back partial fence markers and emits only the user-visible prose.
      const filter = this._streamFilters.get(conversationId)
      const visibleDelta = filter ? filterDraftBlocksLive(filter, newText) : newText
      if (visibleDelta) {
        this._broadcast({
          type: 'chat_stream',
          conversationId,
          delta: visibleDelta,
          timestamp: new Date().toISOString(),
        })
      }

      // Check for new command proposals
      const proposals = extractCommandProposals(updated)
      const emitted = this._emittedProposals.get(conversationId)
      if (emitted) {
        for (const proposal of proposals) {
          if (!emitted.has(proposal)) {
            emitted.add(proposal)
            this._broadcast({
              type: 'chat_command_proposal',
              conversationId,
              command: proposal,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
    }

    const readerHandler = (line: string) => {
      const ev = this._adapter.parseStreamLine(line)
      if (!ev) return
      adapterEvents.push(ev)
      switch (ev.kind) {
        case 'text-delta':
          emitDelta(ev.text)
          break
        case 'session-started':
          if (!capturedSessionId) capturedSessionId = ev.sessionId
          break
        case 'result':
          sawResult = true
          // Claude's result event also carries session_id; for codex the
          // session_id was already captured from thread.started. Either way
          // mirror it into capturedSessionId for the close handler.
          {
            const sid = (ev.payload as { session_id?: string }).session_id
            if (sid && !capturedSessionId) capturedSessionId = sid
          }
          break
        case 'tool-use':
        case 'other':
          // No-op for ChatManager — adapter parses tool_use into the unified
          // event shape but the chat UI does not currently surface them.
          break
      }
    }
    stdoutReader.on('line', readerHandler)

    let currentChild = child
    void currentChild // keep reference live for crash respawn
    return new Promise<void>((resolve) => {
      const onClose = (code: number | null) => {
        console.log(`[chat-manager] ${this._adapter.id} exited code=${code} conv=${conversationId}`)
        const fullText = this._buffers.get(conversationId) ?? ''
        const wasAborting = this._abortingConversations.has(conversationId)

        // Crash auto-respawn for Explore: if the child exited non-zero before
        // emitting a `result` event, the user did not explicitly abort, and
        // we have not yet retried, respawn the same turn once via chat-resume
        // when the adapter supports it and a session id was captured.
        // See design.md D7.
        if (
          conversation.kind === 'explore' &&
          !wasAborting &&
          code !== 0 &&
          !sawResult
        ) {
          const life = this._exploreLifecycle.get(conversationId)
          if (life && life.crashCount === 0) {
            life.crashCount = 1
            // Rebuild argv as chat-resume when the adapter supports native
            // resume AND we captured a session id before the crash. Otherwise
            // re-issue the original chat-turn argv so the spawn still happens.
            const respawnArgs =
              capturedSessionId && this._adapter.capabilities.nativeResume
                ? this._adapter.buildArgs('chat-resume', {
                    prompt: resolvedText,
                    systemPrompt,
                    model,
                    sessionId: capturedSessionId,
                    maxTurns: options?.maxTurns,
                  })
                : args
            console.warn(`[chat-manager] explore crash respawn for ${conversationId}`)
            try {
              const newChild = spawnAiCli(binary, respawnArgs, {
                env: process.env,
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: spawnCwd,
              })
              currentChild = newChild
              args = respawnArgs
              this._activeProcesses.set(conversationId, newChild)
              newChild.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString()
                stderrBuf += text
                console.error(`[chat-manager] ${binary} stderr (${conversationId}):`, text.trim())
              })
              const newReader = createInterface({ input: newChild.stdout!, crlfDelay: Infinity })
              newReader.on('line', readerHandler)
              newChild.on('close', onClose)
              return
            } catch (err) {
              console.error('[chat-manager] crash respawn failed:', err)
              /* fall through to normal close handling */
            }
          }
        }

        // Clean up tracking state
        this._activeProcesses.delete(conversationId)
        this._buffers.delete(conversationId)
        this._emittedProposals.delete(conversationId)
        this._abortingConversations.delete(conversationId)
        this._streamFilters.delete(conversationId)

        // Mark Explore turn as no longer streaming and drain any waiters.
        if (conversation.kind === 'explore') {
          const life = this._exploreLifecycle.get(conversationId)
          if (life) {
            life.isStreaming = false
            life.lastActivityAt = Date.now()
            // Reset crash counter on a successful turn.
            if (code === 0) life.crashCount = 0
            if (life.isMinimized) this._startIdleTimer(conversationId)
          }
          this._drainExploreQueue()
        }

        // ai_invocations capture (surface='explore-spec'). Gated on conversation kind.
        if (this._projectId && conversation.kind === 'explore') {
          try {
            const invStatus = wasAborting
              ? 'aborted'
              : code === 0
                ? 'success'
                : 'failed'
            const { result, estimated } = finaliseInvocationResult(this._adapter, adapterEvents, {
              fallbackModel: model,
            })
            recordInvocation(this._db, {
              id: randomUUID(),
              project_id: this._projectId,
              provider: this._adapter.id,
              surface: 'explore-spec',
              surface_ref_id: conversationId,
              conversation_id: conversationId,
              status: invStatus,
              started_at: turnStartedAt,
              finished_at: new Date().toISOString(),
              total_cost_usd_estimated: estimated,
              ...result,
            })
            this._broadcast({ type: 'spending.invalidated', projectId: this._projectId })
          } catch (err) {
            console.error('[chat-manager] recordInvocation failed:', err)
          }
        }

        if (wasAborting) {
          // abort already emitted chat_error
          resolve()
          return
        }

        if (code === 0) {
          // Parse out any spec-draft fenced blocks (Explore Spec protocol).
          // No-op for non-Explore conversations (parser pre-checks for the fence
          // marker and returns the original text unchanged).
          const parsed = parseSpecDraftBlocks(fullText)
          const persistedText = parsed.blocks.length > 0 ? parsed.stripped : fullText
          if (parsed.blocks.length > 0) {
            const prev = this._specDraftStates.get(conversationId)
            const nextState = applyBlocks(prev, parsed.blocks)
            this._specDraftStates.set(conversationId, nextState)
            this._broadcast({
              type: 'spec_draft.update',
              conversationId,
              draft: nextState.draft,
              ready: nextState.ready,
              chips: nextState.chips,
              changedFields: nextState.lastChangedFields as string[],
              timestamp: new Date().toISOString(),
            })
          }

          // Persist assistant message (stripped of draft blocks for non-noisy DB).
          if (persistedText) {
            addMessage(this._db, { conversation_id: conversationId, role: 'assistant', content: persistedText })
          }

          // Update session_id from the real thread/session captured during
          // streaming. No more synthetic codex-<convId>-<timestamp> fallback —
          // codex's `thread.started` event already gives us a real UUID, and
          // claude's `system`/`result` events carry the canonical session_id.
          if (capturedSessionId) {
            updateConversation(this._db, conversationId, { session_id: capturedSessionId })
          }

          this._broadcast({
            type: 'chat_done',
            conversationId,
            fullText: persistedText,
            timestamp: new Date().toISOString(),
          })

          // Auto-title on first turn (skip in lightweight mode — conversation is ephemeral)
          if (isFirstTurn && fullText && !options?.lightweight) {
            this._autoTitle(conversationId, userText, fullText)
          }
        } else {
          const stderrTail = stderrBuf.trim().slice(-500)
          this._broadcast({
            type: 'chat_error',
            conversationId,
            error: stderrTail
              ? `${binary} exited with code ${code ?? 'unknown'}: ${stderrTail}`
              : `Process exited with code ${code ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          })
        }

        resolve()
      }
      child.on('close', onClose)
    })
  }

  abort(conversationId: string): void {
    const child = this._activeProcesses.get(conversationId)
    if (!child || !child.pid) return

    this._abortingConversations.add(conversationId)
    treeKill(child.pid, 'SIGTERM')

    this._broadcast({
      type: 'chat_error',
      conversationId,
      error: 'aborted',
      timestamp: new Date().toISOString(),
    })
  }

  private _autoTitle(conversationId: string, firstUserMsg: string, firstResponse: string): void {
    try {
      const titlePrompt =
        `Generate a 4-6 word title for this conversation. Output ONLY the title text, no quotes or punctuation.\n\n` +
        `User: ${firstUserMsg.slice(0, 200)}\nAssistant: ${firstResponse.slice(0, 300)}`

      const args = this._adapter.buildArgs('auto-title', {
        prompt: titlePrompt,
        model: this._adapter.defaultModel(),
      })
      const child = spawnAiCli(this._adapter.binary, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this._cwd,
      })

      let titleText = ''
      const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

      reader.on('line', (line) => {
        if (titleText) return
        const ev = this._adapter.parseStreamLine(line)
        if (ev?.kind === 'text-delta') {
          const trimmed = ev.text.trim()
          if (trimmed) titleText = trimmed
        }
      })

      child.on('close', (code) => {
        if (code === 0 && titleText) {
          updateConversation(this._db, conversationId, { title: titleText })
          this._broadcast({
            type: 'chat_title_update',
            conversationId,
            title: titleText,
            timestamp: new Date().toISOString(),
          })
        }
      })
    } catch {
      // auto-title is fire-and-forget; failure is silent
    }
  }
}

// ─── Live spec-draft fence stripper ──────────────────────────────────────────

interface StreamFilterState {
  /** True when we are currently inside a ```spec-draft fenced block. */
  inBlock: boolean
  /**
   * Last few characters of the incoming stream not yet emitted because they
   * could be the prefix of an unfinished fence marker (open or close).
   * Always empty when `inBlock` is true (there is nothing to emit while
   * inside a block — bytes are dropped).
   */
  pendingTail: string
}

const FENCE_OPEN = '```spec-draft'
const FENCE_CLOSE = '```'
// Hold back up to this many trailing chars in the pre-block state so we never
// emit a partial open fence. -1 because we know the user-visible prefix is at
// least 1 char shorter than the full marker on every step.
const PRE_BLOCK_TAIL = FENCE_OPEN.length - 1

/**
 * Stateful, side-effect-free filter that consumes `newText` and returns the
 * substring that is safe to broadcast to the chat stream. Holds back partial
 * fence markers in `state.pendingTail` so the next call can resolve them.
 *
 * Behaviour:
 *  - While outside a block: emit text up to (but not including) the start of
 *    a `\`\`\`spec-draft` marker. If no marker is present, hold back the
 *    trailing few chars so a marker starting on a chunk boundary is not
 *    leaked.
 *  - While inside a block: emit nothing. Look for the closing `\`\`\``.
 *    When found, consume it (plus an optional trailing newline) and resume
 *    emitting from the bytes that follow.
 *
 * The filter intentionally does NOT validate the JSON payload — that is
 * server-side concern of `parseSpecDraftBlocks`. It only strips the fenced
 * span.
 */
export function filterDraftBlocksLive(state: StreamFilterState, newText: string): string {
  let buf = state.pendingTail + newText
  let out = ''
  state.pendingTail = ''

  // Iterate in case a single delta contains multiple transitions
  // (e.g. close + open + close again — pathological but cheap to support).
  while (buf.length > 0) {
    if (state.inBlock) {
      const closeIdx = buf.indexOf(FENCE_CLOSE)
      if (closeIdx === -1) {
        // No close yet — but the close could span the chunk boundary.
        // Hold back up to 2 trailing chars (closing fence is 3 chars; we keep
        // any trailing run of `\`` so the next call resolves it).
        const tailLen = trailingBacktickRun(buf, 2)
        state.pendingTail = buf.slice(buf.length - tailLen)
        return out
      }
      // Consume the close fence + an optional trailing newline.
      let after = closeIdx + FENCE_CLOSE.length
      if (buf[after] === '\n') after += 1
      buf = buf.slice(after)
      state.inBlock = false
      continue
    }

    // Not in block: look for the open marker.
    const openIdx = buf.indexOf(FENCE_OPEN)
    if (openIdx !== -1) {
      out += buf.slice(0, openIdx)
      buf = buf.slice(openIdx + FENCE_OPEN.length)
      // Drop an optional newline immediately after the open marker so the
      // user never sees `\n` belonging to the fence.
      if (buf[0] === '\n') buf = buf.slice(1)
      state.inBlock = true
      continue
    }

    // No open marker — hold back only the trailing run that could become a
    // prefix of FENCE_OPEN (i.e. the longest suffix of `buf` that is also a
    // prefix of FENCE_OPEN). Anything past that is safe to emit.
    const holdBack = longestSuffixThatIsPrefixOf(buf, FENCE_OPEN)
    const safeEnd = buf.length - holdBack
    out += buf.slice(0, safeEnd)
    state.pendingTail = buf.slice(safeEnd)
    return out
  }

  return out
}

/** Length of the longest suffix of `s` that is a prefix of `target`. */
function longestSuffixThatIsPrefixOf(s: string, target: string): number {
  const max = Math.min(s.length, target.length - 1)
  for (let len = max; len > 0; len--) {
    if (target.startsWith(s.slice(s.length - len))) return len
  }
  return 0
}

function trailingBacktickRun(s: string, max: number): number {
  let n = 0
  for (let i = s.length - 1; i >= 0 && n < max; i--) {
    if (s[i] === '`') n++
    else break
  }
  return n
}
