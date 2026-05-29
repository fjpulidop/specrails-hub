// Answer generation — spawns the resolved provider with the structured Ask
// prompt and streams text deltas to the caller. Parses the structured JSON
// envelope at the end to extract citations + followups.

import type { ProviderId } from '../providers/types'
import { getAdapter } from '../providers/registry'
import { ASK_SYSTEM_PROMPT, buildUserPrompt, type PreviousTurn } from './prompts'
import { spawnOneShot } from './spawn-one-shot'
import type { AskAnswerEnvelope, AskPipelineContext } from './types'

export interface AnswerOptions {
  providerId: ProviderId
  model: string
  pipelineContext: AskPipelineContext
  cwd: string
  /** Recent Q&A pairs from the same modal session — prepended to the user
   *  prompt so the model can resolve "it" / "instead" / "yes" references. */
  previousTurns?: PreviousTurn[]
  /** Called for every text delta received from the model. */
  onTextDelta?: (text: string) => void
  /** Called when the spawned CLI reports a `result` payload (cost / tokens). */
  onResult?: (payload: Record<string, unknown>) => void
  /** Aborts the spawn if signalled. */
  abortSignal?: AbortSignal
}

export interface AnswerOutcome {
  status: 'success' | 'failed' | 'aborted'
  envelope: AskAnswerEnvelope | null
  rawText: string
  resultPayload: Record<string, unknown> | null
  exitCode: number
  signal: NodeJS.Signals | null
  /** Captured stderr from the spawned provider CLI (capped at 4KB). */
  stderr: string
}

export async function generateAnswer(opts: AnswerOptions): Promise<AnswerOutcome> {
  const adapter = getAdapter(opts.providerId)
  const userPrompt = buildUserPrompt(
    opts.pipelineContext.question,
    opts.pipelineContext.sources.map((s) => ({
      kind: s.kind,
      source_id: s.source_id,
      title: s.title,
      body: s.body,
    })),
    opts.pipelineContext.aggregateContext,
    opts.previousTurns,
  )

  const handle = spawnOneShot({
    providerId: opts.providerId,
    model: opts.model,
    systemPrompt: ASK_SYSTEM_PROMPT,
    userPrompt,
    cwd: opts.cwd,
  })

  const abortHandler = () => {
    try { handle.child.kill('SIGTERM') } catch { /* noop */ }
    setTimeout(() => { try { handle.child.kill('SIGKILL') } catch { /* noop */ } }, 1000).unref()
  }
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) abortHandler()
    else opts.abortSignal.addEventListener('abort', abortHandler, { once: true })
  }

  let rawText = ''
  let resultPayload: Record<string, unknown> | null = null

  try {
    for await (const evt of handle.events) {
      if (evt.kind === 'text-delta') {
        rawText += evt.text
        opts.onTextDelta?.(evt.text)
      } else if (evt.kind === 'result') {
        resultPayload = evt.payload
        opts.onResult?.(evt.payload)
      }
    }
  } catch (err) {
    // stream error — caller decides
  }

  const exit = await handle.done

  if (opts.abortSignal?.aborted) {
    return { status: 'aborted', envelope: null, rawText, resultPayload, exitCode: exit.code, signal: exit.signal, stderr: exit.stderr }
  }
  if (exit.code !== 0 && !resultPayload) {
    return { status: 'failed', envelope: null, rawText, resultPayload, exitCode: exit.code, signal: exit.signal, stderr: exit.stderr }
  }
  void adapter

  const envelope = extractEnvelope(rawText, opts.pipelineContext.sources.length)
  return { status: 'success', envelope, rawText, resultPayload, exitCode: exit.code, signal: exit.signal, stderr: exit.stderr }
}

/** Extract the JSON envelope from streamed text. Tolerant — accepts an
 *  envelope wrapped in code fences or surrounded by stray text. */
export function extractEnvelope(text: string, maxCitations: number): AskAnswerEnvelope | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const candidate = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(candidate) as Partial<AskAnswerEnvelope>
    if (typeof parsed.answer !== 'string') return null
    const cleaned = stripUnresolvedCitations(parsed.answer, maxCitations)
    return {
      answer: cleaned,
      citations: Array.isArray(parsed.citations) ? parsed.citations.filter((c) => typeof c?.n === 'number') : [],
      followups: Array.isArray(parsed.followups) ? parsed.followups.filter((f) => typeof f === 'string') : [],
    }
  } catch {
    return null
  }
}

/** Strip `[N]` markers whose N is outside [1..maxCitations]. */
export function stripUnresolvedCitations(answer: string, maxCitations: number): string {
  return answer.replace(/\[(\d+)\]/g, (m, raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    if (n < 1 || n > maxCitations) return ''
    return m
  })
}
