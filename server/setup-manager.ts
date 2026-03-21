import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { existsSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'
import { findCoreContract, detectCLISync } from './core-compat'

// ─── Checkpoint definitions ───────────────────────────────────────────────────

export interface CheckpointDefinition {
  key: string
  name: string
}

export const CHECKPOINTS: CheckpointDefinition[] = [
  { key: 'base_install', name: 'Base installation' },
  { key: 'repo_analysis', name: 'Repository analysis' },
  { key: 'stack_conventions', name: 'Stack & conventions' },
  { key: 'product_discovery', name: 'Product discovery' },
  { key: 'agent_generation', name: 'Agent generation' },
  { key: 'command_config', name: 'Command configuration' },
  { key: 'final_verification', name: 'Final verification' },
]

// ─── Checkpoint filesystem checks ─────────────────────────────────────────────

export interface CheckpointStatus {
  key: string
  name: string
  status: 'pending' | 'running' | 'done'
  detail?: string
  duration_ms?: number
}

function checkFilesystem(projectPath: string): Partial<Record<string, boolean>> {
  const hasBaseInstall = existsSync(join(projectPath, '.specrails-version'))
  const hasSetupTemplates = existsSync(join(projectPath, '.claude', 'setup-templates'))
  const hasRules = existsSync(join(projectPath, '.claude', 'rules')) &&
    hasFiles(join(projectPath, '.claude', 'rules'), /\.md$/)
  const hasPersonas = existsSync(join(projectPath, '.claude', 'agents', 'personas')) &&
    hasFiles(join(projectPath, '.claude', 'agents', 'personas'), /\.md$/)
  const hasAgents = existsSync(join(projectPath, '.claude', 'agents')) &&
    hasFiles(join(projectPath, '.claude', 'agents'), /^sr-.*\.md$/)
  const hasCommands = existsSync(join(projectPath, '.claude', 'commands', 'sr')) &&
    hasFiles(join(projectPath, '.claude', 'commands', 'sr'), /\.md$/)
  const hasCLAUDE = existsSync(join(projectPath, 'CLAUDE.md'))

  return {
    base_install: hasBaseInstall,
    // repo_analysis: detected when setup templates exist and CLAUDE.md is written
    // (Claude writes CLAUDE.md after analyzing the repo)
    repo_analysis: hasBaseInstall && (hasCLAUDE || hasSetupTemplates),
    // stack_conventions: detected when rules files are generated
    stack_conventions: hasRules,
    product_discovery: hasPersonas,
    agent_generation: hasAgents,
    command_config: hasCommands,
    // Final verification: agents + commands must exist (manifest from install.sh is unreliable —
    // it's created during scaffolding before /setup generates the actual artifacts)
    final_verification: hasAgents && hasCommands,
  }
}

function hasFiles(dir: string, pattern: RegExp): boolean {
  try {
    return readdirSync(dir).some((f) => pattern.test(f as string))
  } catch {
    return false
  }
}

// ─── Stream-based checkpoint detection ───────────────────────────────────────

function detectCheckpointFromText(
  text: string
): { key: string; detail?: string }[] {
  const hits: { key: string; detail?: string }[] = []

  // Match phase headers from Claude's /setup output
  if (/phase\s*1|codebase\s*analysis|repository\s*analysis/i.test(text)) {
    hits.push({ key: 'repo_analysis', detail: 'Analyzing codebase...' })
  }
  if (/phase\s*2|user\s*personas|product\s*discovery/i.test(text)) {
    hits.push({ key: 'product_discovery', detail: 'Generating personas...' })
  }
  if (/phase\s*3|configuration|agent\s*selection|backlog\s*provider/i.test(text)) {
    hits.push({ key: 'stack_conventions', detail: 'Configuring stack...' })
  }
  if (/generating\s*all\s*files|writing.*agent|sr-architect|sr-developer|sr-reviewer/i.test(text)) {
    hits.push({ key: 'agent_generation', detail: 'Generating agents...' })
  }
  if (/command\s*selection|installing.*commands|\.claude\/commands\/sr/i.test(text)) {
    hits.push({ key: 'command_config', detail: 'Configuring commands...' })
  }

  // File path detection in tool_use events
  if (text.includes('.specrails-version')) hits.push({ key: 'base_install' })
  if (text.includes('/agents/personas/') && text.includes('.md')) {
    hits.push({ key: 'product_discovery', detail: 'Writing personas...' })
  }
  if (/\/agents\/sr-[^/]+\.md/.test(text)) {
    hits.push({ key: 'agent_generation', detail: 'Writing agents...' })
  }
  if (text.includes('/commands/sr/') && text.includes('.md')) {
    hits.push({ key: 'command_config', detail: 'Writing commands...' })
  }
  if (text.includes('/rules/') && text.includes('.md')) {
    hits.push({ key: 'stack_conventions', detail: 'Writing conventions...' })
  }
  if (text.includes('.specrails-manifest.json')) {
    hits.push({ key: 'final_verification' })
  }

  return hits
}

// ─── Setup summary computation ────────────────────────────────────────────────

export interface SetupSummary {
  agents: number
  personas: number
  commands: number
}

function computeSummary(projectPath: string): SetupSummary {
  let agents = 0
  let personas = 0
  let commands = 0

  try {
    const agentsDir = join(projectPath, '.claude', 'agents')
    if (existsSync(agentsDir)) {
      const files = readdirSync(agentsDir) as string[]
      agents = files.filter((f) => /^sr-.*\.md$/.test(f)).length
      const personasDir = join(agentsDir, 'personas')
      if (existsSync(personasDir)) {
        personas = (readdirSync(personasDir) as string[]).filter((f) => f.endsWith('.md')).length
      }
    }
    const commandsDir = join(projectPath, '.claude', 'commands', 'sr')
    if (existsSync(commandsDir)) {
      commands = (readdirSync(commandsDir) as string[]).filter((f) => f.endsWith('.md')).length
    }
  } catch {
    // non-fatal
  }

  return { agents, personas, commands }
}

// ─── Core contract validation ────────────────────────────────────────────────

async function validateCoreContract(): Promise<void> {
  const contractPath = await findCoreContract()
  if (!contractPath) {
    console.warn('[Hub] ⚠️  Could not find integration-contract.json from specrails-core')
    return
  }

  let contract: { checkpoints?: string[]; commands?: string[] }
  try {
    const raw = require('fs').readFileSync(contractPath, 'utf-8') as string
    contract = JSON.parse(raw) as { checkpoints?: string[]; commands?: string[] }
  } catch {
    console.warn('[Hub] ⚠️  Failed to parse integration-contract.json')
    return
  }

  if (contract.checkpoints) {
    const missingCheckpoints = contract.checkpoints.filter(
      (c) => !CHECKPOINTS.some((cp) => cp.key === c)
    )
    const extraCheckpoints = CHECKPOINTS
      .filter((cp) => !contract.checkpoints!.includes(cp.key))
      .map((cp) => cp.key)

    if (missingCheckpoints.length > 0 || extraCheckpoints.length > 0) {
      console.warn('[Hub] ⚠️  specrails-core contract checkpoint mismatch:')
      if (missingCheckpoints.length > 0)
        console.warn(`  Checkpoints in Core but not in Hub: ${missingCheckpoints.join(', ')}`)
      if (extraCheckpoints.length > 0)
        console.warn(`  Checkpoints in Hub but not in Core: ${extraCheckpoints.join(', ')}`)
    }
  }
}

// ─── SetupManager ─────────────────────────────────────────────────────────────

export class SetupManager {
  private _broadcast: (msg: WsMessage) => void
  private _onSessionCaptured?: (projectId: string, sessionId: string) => void
  private _onSetupDone?: (projectId: string) => void
  // Map from projectId → active child processes
  private _installProcesses: Map<string, ChildProcess>
  private _setupProcesses: Map<string, ChildProcess>
  // Track checkpoint states per project
  private _checkpoints: Map<string, Map<string, CheckpointStatus>>
  // Track checkpoint start times
  private _checkpointStart: Map<string, Map<string, number>>

  constructor(
    broadcast: (msg: WsMessage) => void,
    onSessionCaptured?: (projectId: string, sessionId: string) => void,
    onSetupDone?: (projectId: string) => void
  ) {
    this._broadcast = broadcast
    this._onSessionCaptured = onSessionCaptured
    this._onSetupDone = onSetupDone
    this._installProcesses = new Map()
    this._setupProcesses = new Map()
    this._checkpoints = new Map()
    this._checkpointStart = new Map()
    this._pollTimers = new Map()
  }

  // ─── Install: npx specrails-core ─────────────────────────────────────────────

  startInstall(projectId: string, projectPath: string): void {
    if (this._installProcesses.has(projectId)) {
      console.warn(`[SetupManager] install already running for ${projectId}`)
      return
    }

    const child = spawn('npx', ['specrails-core', 'init', '--yes', '--root-dir', projectPath], {
      cwd: projectPath,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this._installProcesses.set(projectId, child)

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    const stderrReader = createInterface({ input: child.stderr!, crlfDelay: Infinity })

    stdoutReader.on('line', (line) => {
      this._broadcast({ type: 'setup_log', projectId, line, stream: 'stdout' })
    })

    stderrReader.on('line', (line) => {
      this._broadcast({ type: 'setup_log', projectId, line, stream: 'stderr' })
    })

    child.on('close', (code) => {
      this._installProcesses.delete(projectId)
      if (code === 0) {
        this._broadcast({
          type: 'setup_install_done',
          projectId,
          timestamp: new Date().toISOString(),
        })
        // Validate that hub constants are in sync with the installed core contract
        validateCoreContract().catch(() => { /* non-fatal */ })
      } else {
        this._broadcast({
          type: 'setup_error',
          projectId,
          error: `npx specrails-core exited with code ${code ?? 'unknown'}`,
        })
      }
    })
  }

  // ─── Setup: claude -p "/setup" ───────────────────────────────────────────────

  startSetup(projectId: string, projectPath: string): void {
    if (this._setupProcesses.has(projectId)) {
      console.warn(`[SetupManager] setup already running for ${projectId}`)
      return
    }

    this._initCheckpoints(projectId)

    // Pre-create the directory structure that /setup will write to.
    // Claude Code's Write tool does not create parent directories automatically —
    // if a target directory doesn't exist the write fails and Claude reports a
    // misleading "write permissions aren't enabled" error.  Creating the dirs
    // here ensures setup runs transparently without any user intervention.
    try {
      mkdirSync(join(projectPath, '.claude', 'agents', 'personas'), { recursive: true })
      mkdirSync(join(projectPath, '.claude', 'commands', 'sr'), { recursive: true })
      mkdirSync(join(projectPath, '.claude', 'rules'), { recursive: true })
    } catch (err) {
      console.warn(`[SetupManager] Failed to pre-create setup directories: ${err}`)
    }

    const args = [
      '-p', '/setup',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
    ]

    this._spawnSetup(projectId, projectPath, args)
  }

  resumeSetup(projectId: string, projectPath: string, sessionId: string, userMessage: string): void {
    if (this._setupProcesses.has(projectId)) {
      console.warn(`[SetupManager] setup already running for ${projectId}`)
      return
    }

    const args = [
      '--resume', sessionId,
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      '-p', userMessage,
    ]

    this._spawnSetup(projectId, projectPath, args)
  }

  // Active filesystem poll timers per project
  private _pollTimers: Map<string, ReturnType<typeof setInterval>>

  private _startFilesystemPoll(projectId: string, projectPath: string): void {
    this._stopFilesystemPoll(projectId)
    const timer = setInterval(() => {
      this._syncFilesystemCheckpoints(projectId, projectPath)
    }, 3000)
    this._pollTimers.set(projectId, timer)
  }

  private _stopFilesystemPoll(projectId: string): void {
    const timer = this._pollTimers.get(projectId)
    if (timer) {
      clearInterval(timer)
      this._pollTimers.delete(projectId)
    }
  }

  private _spawnSetup(projectId: string, projectPath: string, args: string[]): void {
    const provider = detectCLISync()

    let binary: string
    let resolvedArgs: string[]
    if (provider === 'codex') {
      // Codex: extract the prompt value from claude-style args and use 'exec'
      binary = 'codex'
      const promptIdx = args.indexOf('-p')
      const prompt = promptIdx >= 0 ? args[promptIdx + 1] : '/setup'
      resolvedArgs = ['exec', prompt]
    } else {
      // Default to claude (also covers null — warns and tries claude as fallback)
      if (provider === null) {
        console.warn('[SetupManager] No AI CLI detected (claude/codex). Falling back to claude.')
      }
      binary = 'claude'
      resolvedArgs = args
    }

    const child = spawn(binary, resolvedArgs, {
      cwd: projectPath,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this._setupProcesses.set(projectId, child)

    // Start periodic filesystem polling for checkpoint detection
    this._startFilesystemPoll(projectId, projectPath)

    let capturedSessionId: string | null = null

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    const stderrReader = createInterface({ input: child.stderr!, crlfDelay: Infinity })

    stdoutReader.on('line', (line) => {
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(line) } catch { /* plain text */ }

      if (parsed) {
        this._handleSetupStreamEvent(projectId, projectPath, parsed)

        if ((parsed.type as string) === 'result') {
          const sid = parsed.session_id as string | undefined
          if (sid) {
            capturedSessionId = sid
            this._onSessionCaptured?.(projectId, sid)
          }
        }

        // Also broadcast as raw log for the collapsible log viewer
        const eventType = parsed.type as string
        if (eventType === 'assistant') {
          const message = parsed.message as { content?: Array<{ type: string; text?: string; name?: string }> } | undefined
          for (const block of message?.content ?? []) {
            if (block.type === 'text' && block.text) {
              this._broadcast({ type: 'setup_log', projectId, line: block.text, stream: 'stdout' })
            } else if (block.type === 'tool_use' && block.name) {
              this._broadcast({ type: 'setup_log', projectId, line: `[tool] ${block.name}`, stream: 'stdout' })
            }
          }
        }
      } else {
        // Plain text line — broadcast as log
        this._broadcast({ type: 'setup_log', projectId, line, stream: 'stdout' })
      }
    })

    stderrReader.on('line', (line) => {
      this._broadcast({ type: 'setup_log', projectId, line, stream: 'stderr' })
    })

    child.on('close', (code) => {
      this._setupProcesses.delete(projectId)
      this._stopFilesystemPoll(projectId)

      // Final filesystem sync
      this._syncFilesystemCheckpoints(projectId, projectPath)

      if (code === 0) {
        // Sync filesystem checkpoints
        this._syncFilesystemCheckpoints(projectId, projectPath)

        // Check if setup is truly complete — real artifacts must exist
        const hasAgents = existsSync(join(projectPath, '.claude', 'agents')) &&
          hasFiles(join(projectPath, '.claude', 'agents'), /^sr-.*\.md$/)
        const hasCommands = existsSync(join(projectPath, '.claude', 'commands', 'sr')) &&
          hasFiles(join(projectPath, '.claude', 'commands', 'sr'), /\.md$/)
        const isComplete = hasAgents && hasCommands

        if (isComplete) {
          const summary = computeSummary(projectPath)
          this._onSetupDone?.(projectId)
          this._broadcast({
            type: 'setup_complete',
            projectId,
            sessionId: capturedSessionId ?? undefined,
            summary,
          })
        } else {
          // Claude finished one turn but setup isn't done yet.
          // Emit turn_done so the wizard knows to wait for user input.
          this._broadcast({
            type: 'setup_turn_done',
            projectId,
            sessionId: capturedSessionId ?? undefined,
          })
        }
      } else {
        this._onSetupDone?.(projectId)
        this._broadcast({
          type: 'setup_error',
          projectId,
          error: `${binary} setup exited with code ${code ?? 'unknown'}`,
        })
      }
    })
  }

  private _handleSetupStreamEvent(
    projectId: string,
    projectPath: string,
    event: Record<string, unknown>
  ): void {
    const eventType = event.type as string

    // Extract text for chat messages + detect checkpoints from content
    if (eventType === 'assistant') {
      const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
      const texts = (message?.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
      const text = texts.join('')
      if (text) {
        this._broadcast({ type: 'setup_chat', projectId, text, role: 'assistant' })

        // Detect phase transitions from Claude's output text
        const hits = detectCheckpointFromText(text)
        for (const hit of hits) {
          this._advanceCheckpoint(projectId, hit.key, hit.detail)
        }
      }
    }

    // Tool use events — check if writing to checkpoint-relevant paths
    if (eventType === 'tool_use') {
      const inputStr = JSON.stringify(event.input ?? {})
      const hits = detectCheckpointFromText(inputStr)
      for (const hit of hits) {
        this._advanceCheckpoint(projectId, hit.key, hit.detail)
      }
    }

    // After any event, sync filesystem checkpoints
    this._syncFilesystemCheckpoints(projectId, projectPath)
  }

  private _initCheckpoints(projectId: string): void {
    const statuses = new Map<string, CheckpointStatus>()
    const starts = new Map<string, number>()
    for (const def of CHECKPOINTS) {
      statuses.set(def.key, { key: def.key, name: def.name, status: 'pending' })
    }
    this._checkpoints.set(projectId, statuses)
    this._checkpointStart.set(projectId, starts)
  }

  private _advanceCheckpoint(projectId: string, key: string, detail?: string): void {
    const statuses = this._checkpoints.get(projectId)
    if (!statuses) return

    const checkpoint = statuses.get(key)
    if (!checkpoint || checkpoint.status === 'done') return

    const starts = this._checkpointStart.get(projectId)!

    // When a later checkpoint starts, auto-complete all earlier ones
    const checkpointKeys = CHECKPOINTS.map((c) => c.key)
    const targetIdx = checkpointKeys.indexOf(key)
    for (let i = 0; i < targetIdx; i++) {
      const prevKey = checkpointKeys[i]
      const prev = statuses.get(prevKey)
      if (prev && prev.status !== 'done') {
        this._completeCheckpoint(projectId, prevKey)
      }
    }

    if (checkpoint.status === 'pending') {
      checkpoint.status = 'running'
      starts.set(key, Date.now())
      if (detail) checkpoint.detail = detail
      this._broadcast({ type: 'setup_checkpoint', projectId, checkpoint: key, status: 'running', detail })
    }
  }

  private _completeCheckpoint(projectId: string, key: string): void {
    const statuses = this._checkpoints.get(projectId)
    if (!statuses) return

    const checkpoint = statuses.get(key)
    if (!checkpoint || checkpoint.status === 'done') return

    const starts = this._checkpointStart.get(projectId)!
    const startTime = starts.get(key) ?? Date.now()
    const duration_ms = Date.now() - startTime
    starts.delete(key)

    checkpoint.status = 'done'
    checkpoint.duration_ms = duration_ms

    this._broadcast({ type: 'setup_checkpoint', projectId, checkpoint: key, status: 'done', duration_ms })
  }

  private _syncFilesystemCheckpoints(projectId: string, projectPath: string): void {
    const statuses = this._checkpoints.get(projectId)
    if (!statuses) return

    const fsChecks = checkFilesystem(projectPath)

    for (const [key, exists] of Object.entries(fsChecks)) {
      if (!exists) continue
      const cp = statuses.get(key)
      if (!cp) continue

      if (cp.status === 'pending') {
        // Fast-path: mark running then done immediately
        this._advanceCheckpoint(projectId, key)
        this._completeCheckpoint(projectId, key)
      } else if (cp.status === 'running') {
        this._completeCheckpoint(projectId, key)
      }
    }
  }

  // ─── Checkpoint poll endpoint ─────────────────────────────────────────────────

  getCheckpointStatus(projectId: string, projectPath: string): CheckpointStatus[] {
    // Sync from filesystem before returning
    this._syncFilesystemCheckpoints(projectId, projectPath)

    const statuses = this._checkpoints.get(projectId)
    if (!statuses) {
      // Return all-pending if setup hasn't started
      return CHECKPOINTS.map((def) => ({ key: def.key, name: def.name, status: 'pending' as const }))
    }

    return CHECKPOINTS.map((def) => statuses.get(def.key) ?? { key: def.key, name: def.name, status: 'pending' as const })
  }

  // ─── Abort ────────────────────────────────────────────────────────────────────

  abort(projectId: string): void {
    this._stopFilesystemPoll(projectId)
    this._onSetupDone?.(projectId)

    const installChild = this._installProcesses.get(projectId)
    if (installChild?.pid) {
      treeKill(installChild.pid, 'SIGTERM')
      this._installProcesses.delete(projectId)
    }

    const setupChild = this._setupProcesses.get(projectId)
    if (setupChild?.pid) {
      treeKill(setupChild.pid, 'SIGTERM')
      this._setupProcesses.delete(projectId)
    }
  }

  isInstalling(projectId: string): boolean {
    return this._installProcesses.has(projectId)
  }

  isSettingUp(projectId: string): boolean {
    return this._setupProcesses.has(projectId)
  }
}
