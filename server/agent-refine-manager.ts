import fs from 'fs'
import path from 'path'
import { ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { createHash, randomUUID } from 'crypto'
import treeKill from 'tree-kill'
import { spawnClaude } from './util/cli-prompt'
import { testCustomAgent } from './agent-generator'
import type { DbInstance } from './db'
import type {
  WsMessage,
  AgentRefinePhase,
} from './types'
import {
  createRefineSession,
  getRefineSession,
  updateRefineSession,
  deleteRefineSession,
  type RefineHistoryTurn,
  type RefineSessionRow,
} from './agent-refine-db'

const CUSTOM_PREFIX = /^custom-[a-z0-9][a-z0-9-]*$/
const SMART_TEST_DEBOUNCE_MS = 5_000

export interface StartRefineOptions {
  agentId: string
  instruction: string
  autoTest?: boolean
}

export interface SendTurnOptions {
  refineId: string
  instruction: string
}

export interface ApplyResult {
  ok: boolean
  reason?: 'disk_changed' | 'name_changed' | 'session_not_found' | 'invalid_state' | 'agent_not_found'
  version?: number
  body?: string
}

interface ApplyOptions {
  refineId: string
  /** When true, skip the disk-hash guard (force-apply). */
  force?: boolean
}

/**
 * Manager for AI-driven iterative refinement of custom agent .md files.
 *
 * Mirrors ProposalManager: spawn `claude` with stream-json, capture session id
 * on first turn, resume on follow-ups. Streams deltas + phase pills over WS.
 */
export class AgentRefineManager {
  private _broadcast: (msg: WsMessage) => void
  private _db: DbInstance
  private _projectPath: string
  private _activeProcesses = new Map<string, ChildProcess>()
  private _bodyBuffers = new Map<string, string>()

  constructor(broadcast: (msg: WsMessage) => void, db: DbInstance, projectPath: string) {
    this._broadcast = broadcast
    this._db = db
    this._projectPath = projectPath
  }

  isActive(refineId: string): boolean {
    return this._activeProcesses.has(refineId)
  }

  /** Start a new refine session for the given custom agent. */
  async startRefine(opts: StartRefineOptions): Promise<{ refineId: string }> {
    if (!CUSTOM_PREFIX.test(opts.agentId)) {
      throw new Error('not_a_custom_agent')
    }
    const file = this._agentFile(opts.agentId)
    if (!fs.existsSync(file)) {
      throw new Error('agent_not_found')
    }
    const body = fs.readFileSync(file, 'utf8')
    const baseHash = sha256(body)
    const baseVersion = this._currentVersion(opts.agentId)
    const refineId = randomUUID()
    createRefineSession(this._db, {
      id: refineId,
      agentId: opts.agentId,
      baseVersion,
      baseBodyHash: baseHash,
      autoTest: opts.autoTest !== false,
    })
    // Seed history with the user's instruction so reconnects show full thread.
    this._appendHistory(refineId, { role: 'user', content: opts.instruction, timestamp: Date.now() })

    void this._runTurn(refineId, opts.instruction, /* isFirst */ true, body)
    return { refineId }
  }

  /** Send a follow-up instruction on an existing session. */
  async sendTurn(opts: SendTurnOptions): Promise<void> {
    const session = getRefineSession(this._db, opts.refineId)
    if (!session) throw new Error('session_not_found')
    if (session.status === 'streaming') throw new Error('turn_in_progress')
    if (!session.session_id) throw new Error('no_session_id')
    this._appendHistory(opts.refineId, { role: 'user', content: opts.instruction, timestamp: Date.now() })
    void this._runTurn(opts.refineId, opts.instruction, /* isFirst */ false, null)
  }

  /** Cancel an in-flight session. Idempotent. */
  cancel(refineId: string): void {
    const child = this._activeProcesses.get(refineId)
    if (child?.pid) {
      try { treeKill(child.pid, 'SIGTERM') } catch { /* ignore */ }
    }
    const existing = getRefineSession(this._db, refineId)
    if (existing) {
      updateRefineSession(this._db, refineId, { status: 'cancelled', phase: 'idle' })
    }
    this._broadcast({
      type: 'agent_refine_cancelled',
      projectId: '',
      refineId,
      timestamp: new Date().toISOString(),
    })
  }

  /** Toggle auto-test for a session. */
  toggleAutoTest(refineId: string, enabled: boolean): void {
    const session = getRefineSession(this._db, refineId)
    if (!session) throw new Error('session_not_found')
    updateRefineSession(this._db, refineId, { auto_test: enabled ? 1 : 0 })
  }

  /** Apply the current draft_body to disk through the standard write path. */
  apply(opts: ApplyOptions): ApplyResult {
    const session = getRefineSession(this._db, opts.refineId)
    if (!session) return { ok: false, reason: 'session_not_found' }
    if (!session.draft_body) return { ok: false, reason: 'invalid_state' }
    const file = this._agentFile(session.agent_id)
    if (!fs.existsSync(file)) return { ok: false, reason: 'agent_not_found' }
    const currentBody = fs.readFileSync(file, 'utf8')
    if (!opts.force && sha256(currentBody) !== session.base_body_hash) {
      return { ok: false, reason: 'disk_changed' }
    }
    const draftName = extractFrontmatterName(session.draft_body)
    const currentName = extractFrontmatterName(currentBody) ?? session.agent_id
    if (draftName && draftName !== currentName) {
      return { ok: false, reason: 'name_changed' }
    }
    fs.writeFileSync(file, session.draft_body, 'utf8')
    const maxVersion = (this._db
      .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM agent_versions WHERE agent_name = ?`)
      .get(session.agent_id) as { v: number }).v
    const nextVersion = maxVersion + 1
    this._db.prepare(
      `INSERT INTO agent_versions (agent_name, version, body, created_at) VALUES (?, ?, ?, ?)`,
    ).run(session.agent_id, nextVersion, session.draft_body, Date.now())
    updateRefineSession(this._db, opts.refineId, { status: 'applied', phase: 'done' })
    this._broadcast({
      type: 'agent_refine_applied',
      projectId: '',
      refineId: opts.refineId,
      agentId: session.agent_id,
      version: nextVersion,
      timestamp: new Date().toISOString(),
    })
    // Also broadcast the standard catalog change event so existing UI updates.
    this._broadcast({ type: 'agent.changed', projectId: '', id: session.agent_id } as never)
    return { ok: true, version: nextVersion, body: session.draft_body }
  }

  /** Hard-delete a session (used by cleanup/admin paths). */
  destroy(refineId: string): void {
    this.cancel(refineId)
    deleteRefineSession(this._db, refineId)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _agentFile(agentId: string): string {
    return path.join(this._projectPath, '.claude', 'agents', `${agentId}.md`)
  }

  private _currentVersion(agentId: string): number {
    const row = this._db
      .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM agent_versions WHERE agent_name = ?`)
      .get(agentId) as { v: number }
    return row.v
  }

  private _appendHistory(refineId: string, turn: RefineHistoryTurn): void {
    const session = getRefineSession(this._db, refineId)
    if (!session) return
    updateRefineSession(this._db, refineId, { history: [...session.history, turn] })
  }

  private async _runTurn(
    refineId: string,
    instruction: string,
    isFirst: boolean,
    bodyForFirstTurn: string | null,
  ): Promise<void> {
    const session = getRefineSession(this._db, refineId)
    if (!session) return

    updateRefineSession(this._db, refineId, { status: 'streaming', phase: 'reading' })
    this._emitPhase(refineId, 'reading')

    const prompt = isFirst
      ? buildFirstTurnPrompt({
          agentId: session.agent_id,
          currentBody: bodyForFirstTurn ?? '',
          userInstruction: instruction,
        })
      : instruction

    const args: string[] = [
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
    ]
    if (!isFirst && session.session_id) {
      args.push('--resume', session.session_id)
    }
    args.push('-p', prompt)

    let drafted = false
    const child = spawnClaude(args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._projectPath,
    })
    this._activeProcesses.set(refineId, child)
    this._bodyBuffers.set(refineId, '')

    let capturedSessionId: string | null = null
    const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

    reader.on('line', (line) => {
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(line) } catch { return }
      if (!parsed) return
      const eventType = parsed.type as string

      if (eventType === 'system' || eventType === 'init') {
        const sid = (parsed.session_id ?? (parsed.session as { id?: string })?.id) as string | undefined
        if (sid && !capturedSessionId) capturedSessionId = sid
      }
      if (eventType === 'result') {
        const sid = parsed.session_id as string | undefined
        if (sid && !capturedSessionId) capturedSessionId = sid
      }

      if (eventType === 'assistant') {
        const msg = parsed.message as { content?: Array<{ type: string; text?: string; name?: string }> } | undefined
        const blocks = msg?.content ?? []

        const newText = blocks
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
        if (newText) {
          if (!drafted) {
            drafted = true
            updateRefineSession(this._db, refineId, { phase: 'drafting' })
            this._emitPhase(refineId, 'drafting')
          }
          const prev = this._bodyBuffers.get(refineId) ?? ''
          const next = prev + newText
          this._bodyBuffers.set(refineId, next)
          this._broadcast({
            type: 'agent_refine_stream',
            projectId: '',
            refineId,
            delta: newText,
            timestamp: new Date().toISOString(),
          })
          // Persist incrementally so reconnects can show partial draft.
          updateRefineSession(this._db, refineId, { draft_body: next })
        }

        // Emit tool_use markers as zero-width activity hints (kept for parity
        // with ProposalManager's UX; client may render or ignore).
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name) {
            this._broadcast({
              type: 'agent_refine_stream',
              projectId: '',
              refineId,
              delta: `<!--tool:${block.name}-->`,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
    })

    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    return new Promise<void>((resolve) => {
      child.on('error', (err) => {
        this._activeProcesses.delete(refineId)
        this._bodyBuffers.delete(refineId)
        this._emitError(refineId, `Failed to launch claude: ${err.message}`)
        updateRefineSession(this._db, refineId, { status: 'error', phase: 'idle' })
        resolve()
      })
      child.on('close', (code) => {
        this._activeProcesses.delete(refineId)
        const fullDraft = this._bodyBuffers.get(refineId) ?? ''
        this._bodyBuffers.delete(refineId)

        if (code !== 0 || !fullDraft.trim()) {
          this._emitError(
            refineId,
            code !== 0
              ? `claude exited with code ${code}${stderr ? `: ${stderr.slice(-300)}` : ''}`
              : 'claude returned empty output',
          )
          updateRefineSession(this._db, refineId, { status: 'error', phase: 'idle' })
          resolve()
          return
        }

        // Validation phase.
        updateRefineSession(this._db, refineId, { phase: 'validating' })
        this._emitPhase(refineId, 'validating')
        const stripped = stripToolMarkers(fullDraft)
        const validation = validateAgentBody(stripped)
        if (!validation.ok) {
          this._emitError(refineId, `Frontmatter invalid: ${validation.error}`)
          updateRefineSession(this._db, refineId, { status: 'error', phase: 'idle', draft_body: stripped })
          resolve()
          return
        }

        // Append assistant turn to history (use stripped body — markers gone).
        this._appendHistory(refineId, {
          role: 'assistant',
          content: stripped,
          timestamp: Date.now(),
        })

        const patch = {
          status: 'ready' as const,
          phase: 'done' as AgentRefinePhase,
          draft_body: stripped,
          ...(capturedSessionId ? { session_id: capturedSessionId } : {}),
        }
        updateRefineSession(this._db, refineId, patch)
        this._broadcast({
          type: 'agent_refine_ready',
          projectId: '',
          refineId,
          draftBody: stripped,
          timestamp: new Date().toISOString(),
        })
        this._emitPhase(refineId, 'done')

        // Smart-mode auto-test: only run if enabled, body changed since last
        // test, and >5s elapsed. Best-effort; failures are non-fatal.
        const session2 = getRefineSession(this._db, refineId)
        if (session2 && session2.auto_test === 1) {
          const draftHash = sha256(stripped)
          const recent =
            session2.last_test_at !== null && Date.now() - session2.last_test_at < SMART_TEST_DEBOUNCE_MS
          const sameBody = session2.last_test_hash === draftHash
          if (!recent && !sameBody) {
            void this._runAutoTest(refineId, session2.agent_id, stripped, draftHash)
          }
        }

        resolve()
      })
    })
  }

  private async _runAutoTest(
    refineId: string,
    agentId: string,
    draftBody: string,
    draftHash: string,
  ): Promise<void> {
    updateRefineSession(this._db, refineId, { phase: 'testing' })
    this._emitPhase(refineId, 'testing')
    const sampleTask = pickSampleTask(this._db, agentId)
    try {
      const result = await testCustomAgent(this._projectPath, { draftBody, sampleTask })
      this._db.prepare(
        `INSERT INTO agent_tests (agent_name, draft_hash, sample_task_id, tokens, duration_ms, output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(agentId, result.draftHash, null, result.tokens, result.durationMs, result.output, Date.now())
      updateRefineSession(this._db, refineId, {
        last_test_at: Date.now(),
        last_test_hash: draftHash,
        phase: 'done',
      })
      this._appendHistory(refineId, {
        role: 'system',
        kind: 'test_result',
        content: result.output,
        timestamp: Date.now(),
      })
      this._broadcast({
        type: 'agent_refine_test',
        projectId: '',
        refineId,
        result: { output: result.output, tokens: result.tokens, durationMs: result.durationMs },
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      this._emitError(refineId, `Auto-test failed: ${(err as Error).message}`)
      updateRefineSession(this._db, refineId, { phase: 'done' })
    }
  }

  private _emitPhase(refineId: string, phase: AgentRefinePhase): void {
    this._broadcast({
      type: 'agent_refine_phase',
      projectId: '',
      refineId,
      phase,
      timestamp: new Date().toISOString(),
    })
  }

  private _emitError(refineId: string, error: string): void {
    this._broadcast({
      type: 'agent_refine_error',
      projectId: '',
      refineId,
      error,
      timestamp: new Date().toISOString(),
    })
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function stripToolMarkers(s: string): string {
  return s.replace(/<!--tool:[^>]+-->/g, '').trim()
}

function extractFrontmatterName(body: string): string | null {
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const m = fm[1].match(/^name:\s*(\S+)/m)
  return m ? m[1].trim() : null
}

interface ValidationResult {
  ok: boolean
  error?: string
}

export function validateAgentBody(body: string): ValidationResult {
  const trimmed = body.trim()
  if (!trimmed.startsWith('---')) return { ok: false, error: 'missing YAML frontmatter' }
  const fm = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return { ok: false, error: 'unterminated YAML frontmatter' }
  const block = fm[1]
  if (!/^name:\s*\S+/m.test(block)) return { ok: false, error: 'frontmatter must include `name:`' }
  if (!/^description:/m.test(block)) return { ok: false, error: 'frontmatter must include `description:`' }
  if (!/^model:\s*(sonnet|opus|haiku)/m.test(block)) return { ok: false, error: 'frontmatter `model:` must be sonnet|opus|haiku' }
  return { ok: true }
}

export function buildFirstTurnPrompt(opts: {
  agentId: string
  currentBody: string
  userInstruction: string
}): string {
  return [
    'You are refining an existing custom agent. The user wants to iterate on its',
    'definition. Output the COMPLETE refined `.md` file — full YAML frontmatter',
    'between `---` separators, then the body. Do not include code fences,',
    'commentary, or explanations. Start at `---`.',
    '',
    'Hard rules:',
    '  1. Frontmatter MUST include `name`, `description`, and `model` (one of',
    '     `sonnet`, `opus`, `haiku`).',
    `  2. The frontmatter \`name\` MUST remain exactly: ${opts.agentId}`,
    '  3. The id `name` is locked; renaming is a separate explicit action.',
    '',
    `Agent id: ${opts.agentId}`,
    '',
    'Current agent file:',
    '```markdown',
    opts.currentBody,
    '```',
    '',
    `User refinement request:`,
    opts.userInstruction,
    '',
    'Output only the new file content, starting with `---`.',
  ].join('\n')
}

function pickSampleTask(db: DbInstance, agentId: string): string {
  try {
    const row = db
      .prepare(
        `SELECT output FROM agent_tests
         WHERE agent_name = ? AND sample_task_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(agentId) as { output: string } | undefined
    if (row?.output) return row.output
  } catch { /* ignore */ }
  return DEFAULT_SAMPLE_TASK
}

const DEFAULT_SAMPLE_TASK = [
  'Demonstrate how you would handle a small representative task within your',
  'declared focus areas. Keep the answer under 150 words.',
].join(' ')

/** Build a public, JSON-friendly view of a session for the GET /refine/:id endpoint. */
export function refineSessionToJson(row: RefineSessionRow): {
  id: string
  agentId: string
  status: string
  phase: string
  autoTest: boolean
  draftBody: string | null
  history: RefineHistoryTurn[]
  baseVersion: number
  createdAt: number
  updatedAt: number
} {
  return {
    id: row.id,
    agentId: row.agent_id,
    status: row.status,
    phase: row.phase,
    autoTest: row.auto_test === 1,
    draftBody: row.draft_body,
    history: row.history,
    baseVersion: row.base_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
