import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'

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
    // Final verification requires actual generated artifacts
    final_verification: existsSync(join(projectPath, '.specrails-manifest.json')) &&
      hasAgents && hasCommands,
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

function detectCheckpointFromLine(
  line: string
): { key: string; detail?: string } | null {
  // Tool use events writing to checkpoint paths
  if (line.includes('.specrails-version')) return { key: 'base_install' }
  if (line.includes('stack') || line.includes('language') || line.includes('framework')) {
    return { key: 'repo_analysis', detail: 'Analyzing stack...' }
  }
  if (line.includes('layers') || line.includes('conventions') || line.includes('rules')) {
    return { key: 'stack_conventions', detail: 'Generating conventions...' }
  }
  if (line.includes('personas') || (line.includes('.claude/agents') && line.includes('personas'))) {
    return { key: 'product_discovery', detail: 'Discovering product context...' }
  }
  if (line.includes('.claude/agents/sr-') || (line.includes('sr-') && line.includes('.md'))) {
    return { key: 'agent_generation', detail: 'Generating agents...' }
  }
  if (line.includes('.claude/commands/sr') || (line.includes('commands') && line.includes('sr'))) {
    return { key: 'command_config', detail: 'Configuring commands...' }
  }
  if (line.includes('.specrails-manifest.json')) return { key: 'final_verification' }
  return null
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

// ─── SetupManager ─────────────────────────────────────────────────────────────

export class SetupManager {
  private _broadcast: (msg: WsMessage) => void
  // Map from projectId → active child processes
  private _installProcesses: Map<string, ChildProcess>
  private _setupProcesses: Map<string, ChildProcess>
  // Track checkpoint states per project
  private _checkpoints: Map<string, Map<string, CheckpointStatus>>
  // Track checkpoint start times
  private _checkpointStart: Map<string, Map<string, number>>

  constructor(broadcast: (msg: WsMessage) => void) {
    this._broadcast = broadcast
    this._installProcesses = new Map()
    this._setupProcesses = new Map()
    this._checkpoints = new Map()
    this._checkpointStart = new Map()
    this._pollTimers = new Map()
  }

  // ─── Install: npx specrails ──────────────────────────────────────────────────

  startInstall(projectId: string, projectPath: string): void {
    if (this._installProcesses.has(projectId)) {
      console.warn(`[SetupManager] install already running for ${projectId}`)
      return
    }

    const child = spawn('npx', ['specrails', 'init', '--yes'], {
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
      } else {
        this._broadcast({
          type: 'setup_error',
          projectId,
          error: `npx specrails exited with code ${code ?? 'unknown'}`,
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
    const child = spawn('claude', args, {
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
          if (sid) capturedSessionId = sid
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

        // Check if setup is truly complete — manifest exists AND real artifacts generated
        const hasAgents = existsSync(join(projectPath, '.claude', 'agents')) &&
          hasFiles(join(projectPath, '.claude', 'agents'), /^sr-.*\.md$/)
        const hasCommands = existsSync(join(projectPath, '.claude', 'commands', 'sr')) &&
          hasFiles(join(projectPath, '.claude', 'commands', 'sr'), /\.md$/)
        const isComplete = existsSync(join(projectPath, '.specrails-manifest.json')) &&
          hasAgents && hasCommands

        if (isComplete) {
          const summary = computeSummary(projectPath)
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
        this._broadcast({
          type: 'setup_error',
          projectId,
          error: `claude setup exited with code ${code ?? 'unknown'}`,
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

    // Extract text for chat messages
    if (eventType === 'assistant') {
      const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
      const texts = (message?.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
      const text = texts.join('')
      if (text) {
        this._broadcast({ type: 'setup_chat', projectId, text, role: 'assistant' })
      }
    }

    // Tool use events — check if writing to checkpoint-relevant paths
    if (eventType === 'tool_use') {
      const inputStr = JSON.stringify(event.input ?? {})
      const hit = detectCheckpointFromLine(inputStr)
      if (hit) {
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
