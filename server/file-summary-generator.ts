import { createInterface } from 'readline'
import { spawnAiCli } from './util/cli-prompt'
import { finaliseInvocationResult } from './result-event'
import type { ProviderAdapter, AdapterEvent } from './providers/types'
import type { GenerateInput, GenerateOutput } from './file-summary-manager'

const GENERATE_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT_EN =
  'You are explaining code to a non-developer. Output 2 to 4 sentences in plain language about what the file does. ' +
  'No code, no jargon, no bullet lists. Output only the explanation, nothing else.'

const SYSTEM_PROMPT_ES =
  'Estás explicando código a una persona no desarrolladora. Escribe entre 2 y 4 frases en lenguaje llano sobre qué hace el archivo. ' +
  'Sin código, sin jerga, sin listas. Devuelve solo la explicación, nada más.'

export function buildSystemPrompt(language: 'en' | 'es'): string {
  return language === 'es' ? SYSTEM_PROMPT_ES : SYSTEM_PROMPT_EN
}

/** Compose the single user-message body that goes to the model. The provider
 *  adapter decides whether the system prompt rides along via a flag or gets
 *  folded into this string (see `adapter.capabilities.systemPromptArg`). */
function buildUserPrompt(input: GenerateInput, adapter: ProviderAdapter): string {
  const body = `${input.relPath}\n${input.contents}`
  if (adapter.capabilities.systemPromptArg) return body
  // Provider does not accept a system-prompt flag; fold the instruction inline.
  return `${buildSystemPrompt(input.language)}\n\n${body}`
}

export interface GeneratorOpts {
  adapter: ProviderAdapter
  cwd: string
  /** Override the model. Defaults to env `SPECRAILS_FILE_SUMMARY_MODEL`, then
   *  to a haiku-class id when adapter.id === 'claude', else adapter default. */
  model?: string
  spawn?: typeof spawnAiCli
  timeoutMs?: number
}

/** Cheapest model per provider for summary generation. Codex MUST run
 *  `gpt-5.4-mini` (product decision: file summaries are non-critical and the
 *  mini tier is the right cost target). Claude uses `haiku`. The per-provider
 *  env overrides exist for ops escape hatches; the generic
 *  `SPECRAILS_FILE_SUMMARY_MODEL` is honoured only when no provider-specific
 *  override is set. */
function defaultModelFor(adapter: ProviderAdapter): string {
  if (adapter.id === 'claude') {
    return process.env.SPECRAILS_FILE_SUMMARY_MODEL_CLAUDE
      ?? process.env.SPECRAILS_FILE_SUMMARY_MODEL
      ?? 'haiku'
  }
  if (adapter.id === 'codex') {
    return process.env.SPECRAILS_FILE_SUMMARY_MODEL_CODEX ?? 'gpt-5.4-mini'
  }
  return process.env.SPECRAILS_FILE_SUMMARY_MODEL ?? adapter.defaultModel()
}

export function createFileSummaryGenerator(opts: GeneratorOpts): (input: GenerateInput) => Promise<GenerateOutput> {
  const adapter = opts.adapter
  const model = opts.model ?? defaultModelFor(adapter)
  const timeoutMs = opts.timeoutMs ?? GENERATE_TIMEOUT_MS
  const spawn = opts.spawn ?? spawnAiCli

  return async function generate(input: GenerateInput): Promise<GenerateOutput> {
    const startedAt = Date.now()
    const args = adapter.buildArgs('spec-gen', {
      prompt: buildUserPrompt(input, adapter),
      systemPrompt: adapter.capabilities.systemPromptArg ? buildSystemPrompt(input.language) : undefined,
      model,
      maxTurns: 1,
    })

    const child = spawn(adapter.binary, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd,
    })

    return await new Promise<GenerateOutput>((resolve, reject) => {
      const events: AdapterEvent[] = []
      let fullText = ''
      let stderrBuf = ''
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { child.kill('SIGTERM') } catch { /* best effort */ }
        reject(new Error(`file-summary generator timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer | string) => {
          stderrBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
          if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192)
        })
      }

      if (!child.stdout) {
        clearTimeout(timer)
        reject(new Error('file-summary generator: child has no stdout'))
        return
      }

      const reader = createInterface({ input: child.stdout, crlfDelay: Infinity })
      reader.on('line', (line: string) => {
        const ev = adapter.parseStreamLine(line)
        if (!ev) return
        events.push(ev)
        if (ev.kind === 'text-delta') fullText += ev.text
      })

      child.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (code !== 0) {
          const tail = stderrBuf.slice(-500)
          reject(new Error(`${adapter.binary} exit code=${code}; ${tail ? `stderr=${tail}` : 'no stderr'}`))
          return
        }
        const summary = fullText.trim()
        if (!summary) {
          reject(new Error(`${adapter.binary} returned empty summary text`))
          return
        }
        const { result, estimated } = finaliseInvocationResult(adapter, events, { fallbackModel: model })
        const durationMs = result.duration_ms ?? (Date.now() - startedAt)
        resolve({
          summary,
          model: result.model ?? model,
          provider: adapter.id,
          costUsd: result.total_cost_usd ?? 0,
          costEstimated: estimated,
          tokensIn: result.tokens_in ?? 0,
          tokensOut: result.tokens_out ?? 0,
          tokensCacheRead: result.tokens_cache_read,
          tokensCacheCreate: result.tokens_cache_create,
          durationMs,
        })
      })
    })
  }
}
