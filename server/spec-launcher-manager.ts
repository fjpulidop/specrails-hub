import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import treeKill from 'tree-kill'
import type { WsMessage } from './types'
import { resolveCommand } from './command-resolver'

// ─── SpecLauncherManager ──────────────────────────────────────────────────────

export class SpecLauncherManager {
  private _broadcast: (msg: WsMessage) => void
  private _cwd: string
  private _activeProcesses: Map<string, ChildProcess>
  private _buffers: Map<string, string>

  constructor(broadcast: (msg: WsMessage) => void, cwd: string) {
    this._broadcast = broadcast
    this._cwd = cwd
    this._activeProcesses = new Map()
    this._buffers = new Map()
  }

  isActive(launchId: string): boolean {
    return this._activeProcesses.has(launchId)
  }

  async launch(launchId: string, description: string): Promise<void> {
    const rawCommand = `/opsx:ff ${description}`
    const prompt = resolveCommand(rawCommand, this._cwd)
    if (prompt === rawCommand) {
      this._broadcastError(launchId, 'This project does not have the /opsx:ff command installed. Run "npx specrails-core@latest" to install it.')
      return
    }

    const args = [
      '--dangerously-skip-permissions',
      '--tools', 'default',
      '--output-format', 'stream-json',
      '--verbose',
      '-p', prompt,
    ]

    // Windows claude is a .cmd shim; shell:true needed to resolve via PATH.
    const child = spawn('claude', args, {
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._cwd,
    })

    this._activeProcesses.set(launchId, child)
    this._buffers.set(launchId, '')

    // Surface ENOENT (e.g. claude not on PATH) instead of crashing the hub.
    child.on('error', (err) => {
      console.error(`[SpecLauncherManager] spawn failed for ${launchId}: ${err.message}`)
      this._activeProcesses.delete(launchId)
      this._buffers.delete(launchId)
      this._broadcast({
        type: 'spec_launcher_error',
        projectId: '',
        launchId,
        error: `Failed to launch claude: ${err.message}`,
        timestamp: new Date().toISOString(),
      })
    })

    // Capture last change ID from output (opsx:ff usually prints the change name)
    let detectedChangeId: string | null = null

    const stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })

    stdoutReader.on('line', (line) => {
      let parsed: Record<string, unknown> | null = null
      try { parsed = JSON.parse(line) } catch { /* skip non-JSON */ }
      if (!parsed) return

      const eventType = parsed.type as string

      if (eventType === 'assistant') {
        const msg = parsed.message as { content?: Array<{ type: string; text?: string; name?: string }> } | undefined
        const blocks = msg?.content ?? []

        const texts = blocks
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
        const newText = texts.join('')
        if (newText) {
          // Try to detect change ID from output (look for "openspec/changes/<id>" pattern)
          const changeMatch = newText.match(/openspec\/changes\/([^\s/]+)/)
          if (changeMatch) detectedChangeId = changeMatch[1]

          const prev = this._buffers.get(launchId) ?? ''
          this._buffers.set(launchId, prev + newText)
          this._broadcast({
            type: 'spec_launcher_stream',
            projectId: '',
            launchId,
            delta: newText,
            timestamp: new Date().toISOString(),
          })
        }

        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name) {
            this._broadcast({
              type: 'spec_launcher_stream',
              projectId: '',
              launchId,
              delta: `<!--tool:${block.name}-->`,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
    })

    return new Promise<void>((resolve) => {
      child.on('close', (code) => {
        const fullText = this._buffers.get(launchId) ?? ''
        this._activeProcesses.delete(launchId)
        this._buffers.delete(launchId)

        if (code === 0) {
          // Also try to extract change ID from full text
          if (!detectedChangeId) {
            const match = fullText.match(/openspec\/changes\/([^\s/]+)/)
            if (match) detectedChangeId = match[1]
          }
          this._broadcast({
            type: 'spec_launcher_done',
            projectId: '',
            launchId,
            changeId: detectedChangeId,
            timestamp: new Date().toISOString(),
          })
        } else {
          this._broadcastError(launchId, 'Spec generation failed')
        }

        resolve()
      })
    })
  }

  cancel(launchId: string): void {
    const child = this._activeProcesses.get(launchId)
    if (child?.pid) {
      treeKill(child.pid, 'SIGTERM')
    }
    this._activeProcesses.delete(launchId)
    this._buffers.delete(launchId)
    this._broadcastError(launchId, 'cancelled')
  }

  private _broadcastError(launchId: string, error: string): void {
    this._broadcast({
      type: 'spec_launcher_error',
      projectId: '',
      launchId,
      error,
      timestamp: new Date().toISOString(),
    })
  }
}
