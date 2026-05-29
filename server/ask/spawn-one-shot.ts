// Helper around `adapter.buildArgs('ask-answer', ...)` that spawns the
// resolved provider's CLI for a one-shot answer turn.
//
// Centralises the spawn machinery so the Ask SSE handler stays focused on
// stream parsing + finalisation.

import { spawn, type ChildProcess } from 'node:child_process'
import { getAdapter } from '../providers/registry'
import type { ProviderId, AdapterEvent } from '../providers/types'

export interface OneShotOptions {
  providerId: ProviderId
  model: string
  systemPrompt: string
  userPrompt: string
  cwd: string
  maxTurns?: number
  env?: NodeJS.ProcessEnv
}

export interface OneShotHandle {
  child: ChildProcess
  events: AsyncIterable<AdapterEvent>
  /** Resolves with the spawn exit code + accumulated stderr. */
  done: Promise<{ code: number; signal: NodeJS.Signals | null; stderr: string }>
}

export function spawnOneShot(opts: OneShotOptions): OneShotHandle {
  const adapter = getAdapter(opts.providerId)
  const argv = adapter.buildArgs('ask-answer', {
    prompt: opts.userPrompt,
    systemPrompt: opts.systemPrompt,
    model: opts.model,
    maxTurns: opts.maxTurns ?? 1,
  })
  // Codex's `exec` always reads stdin in non-TTY mode, so for codex we feed
  // the folded prompt via stdin and skip the positional argument. Claude is
  // happy with positional.
  const writeStdin = adapter.id === 'codex'
  const argvForLog = argv.map((a) => a.length > 120 ? `${a.slice(0, 100)}…(${a.length} chars)` : a)
  console.log(`[ask] spawn ${adapter.binary} ${argvForLog.join(' ')}${writeStdin ? ' (prompt via stdin)' : ''}`)
  const child = spawn(adapter.binary, argv, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: [writeStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  })
  if (writeStdin && child.stdin) {
    const folded = opts.systemPrompt ? `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}` : opts.userPrompt
    child.stdin.end(folded)
  }

  const events: AsyncIterable<AdapterEvent> = (async function* () {
    let buffer = ''
    if (!child.stdout) return
    for await (const chunk of child.stdout) {
      buffer += chunk.toString('utf8')
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const evt = adapter.parseStreamLine(line)
        if (evt) yield evt
      }
    }
    if (buffer.trim()) {
      const evt = adapter.parseStreamLine(buffer.trim())
      if (evt) yield evt
    }
  })()

  let stderrBuffer = ''
  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString('utf8')
      // Cap to last 4KB so we don't leak a giant blob to the SSE client.
      if (stderrBuffer.length > 4096) stderrBuffer = stderrBuffer.slice(-4096)
    })
  }

  const done = new Promise<{ code: number; signal: NodeJS.Signals | null; stderr: string }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code: code ?? -1, signal, stderr: stderrBuffer }))
  })

  return { child, events, done }
}
