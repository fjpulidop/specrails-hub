import { execSync, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'
import type { DbInstance } from './db'
import { getConversation, addMessage, updateConversation, getStats, listJobs } from './db'
import { resolveCommand } from './command-resolver'
import { spawnAiCli, spawnClaude, spawnCodex } from './util/cli-prompt'
import { parseSpecDraftBlocks, applyBlocks, type ConversationDraftState } from './spec-draft-parser'
import { attachmentManager, USER_ATTACHMENT_SYSTEM_NOTE } from './attachment-manager'

const COMMAND_INSTRUCTION =
  'When you want to suggest a SpecRails command for the user to execute, wrap it in a command block like this: ' +
  ':::command\n/specrails:implement #42\n::: ' +
  'The user will be prompted to confirm before the command runs.'

// Windows has no `which`; probe via `where` instead.
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

function extractTextFromEvent(event: Record<string, unknown>): string | null {
  const type = event.type as string
  if (type === 'assistant') {
    const content = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
    const texts = (content?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
    return texts.join('') || null
  }
  return null
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

  private _cwd: string | undefined
  private _projectName: string | undefined
  private _provider: 'claude' | 'codex'

  constructor(broadcast: (msg: WsMessage) => void, db: DbInstance, cwd?: string, projectName?: string, provider?: 'claude' | 'codex') {
    this._broadcast = broadcast
    this._db = db
    this._cwd = cwd
    this._projectName = projectName
    this._provider = provider ?? 'claude'
    this._activeProcesses = new Map()
    this._buffers = new Map()
    this._emittedProposals = new Map()
    this._abortingConversations = new Set()
    this._specDraftStates = new Map()
    this._streamFilters = new Map()
  }

  /** Drop the per-conversation draft state (used on conversation deletion). */
  forgetSpecDraft(conversationId: string): void {
    this._specDraftStates.delete(conversationId)
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

    if (this._provider === 'codex') {
      if (!codexOnPath()) {
        this._broadcast({
          type: 'chat_error',
          conversationId,
          error: 'CODEX_NOT_FOUND',
          timestamp: new Date().toISOString(),
        })
        return
      }
    } else {
      if (!claudeOnPath()) {
        this._broadcast({
          type: 'chat_error',
          conversationId,
          error: 'CLAUDE_NOT_FOUND',
          timestamp: new Date().toISOString(),
        })
        return
      }
    }

    const conversation = getConversation(this._db, conversationId)
    if (!conversation) {
      console.warn(`[ChatManager] conversation ${conversationId} not found`)
      return
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

    // Build spawn args based on provider
    let binary: string
    let args: string[]

    if (this._provider === 'codex') {
      binary = 'codex'
      // Codex: single-turn exec with model selection.
      // Default to gpt-5.4-mini (matches the budget preset default).
      const model = conversation.model || 'gpt-5.4-mini'
      // Embed the system prompt directly in the prompt (codex has no --system-prompt flag).
      // This ensures project context, local-tickets permission, and COMMAND_INSTRUCTION
      // are honoured on every codex chat turn.
      const lightweight = options?.lightweight ?? false
      let systemPrompt = lightweight
        ? this._buildLightweightSystemPrompt()
        : this._buildSystemPrompt()
      if (hasAttachments) systemPrompt = `${systemPrompt}\n\n${USER_ATTACHMENT_SYSTEM_NOTE}`
      const fullPrompt = `${systemPrompt}\n\n---\n\n${resolvedText}`
      args = ['exec', fullPrompt, '--model', model]
    } else {
      binary = 'claude'
      const lightweight = options?.lightweight ?? false
      let systemPrompt = lightweight
        ? this._buildLightweightSystemPrompt()
        : this._buildSystemPrompt()
      if (hasAttachments) systemPrompt = `${systemPrompt}\n\n${USER_ATTACHMENT_SYSTEM_NOTE}`
      args = [
        '--model', conversation.model,
        '--dangerously-skip-permissions',
        '--tools', 'default',
        '--output-format', 'stream-json',
        '--verbose',
        '--system-prompt', systemPrompt,
        '-p', resolvedText,
      ]
      if (conversation.session_id) {
        args.push('--resume', conversation.session_id)
      }
      const maxTurns = options?.maxTurns
      if (maxTurns != null) {
        args.push('--max-turns', String(maxTurns))
      }
    }

    // No OTEL env injection here — ChatManager spawns are interactive user sessions,
    // not pipeline jobs. Telemetry is scoped to QueueManager pipeline runs only.
    // spawnAiCli reroutes multi-line argv values through stdin on Windows.
    const child = spawnAiCli(binary, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._cwd,
    })

    // Drain stderr so the pipe buffer never fills up (child process would block otherwise)
    child.stderr?.resume()
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[chat-manager] claude stderr (${conversationId}):`, chunk.toString().trim())
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

    stdoutReader.on('line', (line) => {
      if (this._provider === 'codex') {
        // Codex outputs plain text
        if (line) emitDelta(line + '\n')
      } else {
        // Claude outputs JSON stream
        let parsed: Record<string, unknown> | null = null
        try { parsed = JSON.parse(line) } catch { /* skip non-JSON */ }
        if (!parsed) return

        const eventType = parsed.type as string

        if (eventType === 'result') {
          const sid = parsed.session_id as string | undefined
          if (sid) capturedSessionId = sid
        }

        const newText = extractTextFromEvent(parsed)
        if (newText) emitDelta(newText)
      }
    })

    return new Promise<void>((resolve) => {
      child.on('close', (code) => {
        console.log(`[chat-manager] claude exited code=${code} conv=${conversationId}`)
        const fullText = this._buffers.get(conversationId) ?? ''
        const wasAborting = this._abortingConversations.has(conversationId)

        // Clean up tracking state
        this._activeProcesses.delete(conversationId)
        this._buffers.delete(conversationId)
        this._emittedProposals.delete(conversationId)
        this._abortingConversations.delete(conversationId)
        this._streamFilters.delete(conversationId)

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

          // Update session_id.
          // For codex: generate a synthetic session ID so that subsequent refreshes
          // can still resolve the conversation. Pattern mirrors setup-manager.ts:810.
          if (!capturedSessionId && this._provider === 'codex') {
            capturedSessionId = `codex-${conversationId}-${Date.now()}`
          }
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
          this._broadcast({
            type: 'chat_error',
            conversationId,
            error: `Process exited with code ${code ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          })
        }

        resolve()
      })
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

      if (this._provider === 'codex') {
        // Codex outputs plain text — spawn codex exec and take the first non-empty line
        const child = spawnCodex([
          'exec', titlePrompt,
          '--model', 'gpt-5.4-mini',
        ], {
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: this._cwd,
        })

        let titleText = ''
        const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

        reader.on('line', (line) => {
          // Take the first non-empty output line as the title
          if (!titleText && line.trim()) {
            titleText = line.trim()
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
        return
      }

      // Claude: JSON stream parsing
      const child = spawnClaude([
        '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '--verbose',
        '-p', titlePrompt,
      ], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this._cwd,
      })

      let titleText = ''
      const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

      reader.on('line', (line) => {
        let parsed: Record<string, unknown> | null = null
        try { parsed = JSON.parse(line) } catch { return }
        if (!parsed) return

        // Take only the first assistant event's text
        if (!titleText) {
          const text = extractTextFromEvent(parsed)
          if (text) titleText = text.trim()
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
