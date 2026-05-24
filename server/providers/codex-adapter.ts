// Codex (OpenAI) adapter for codex CLI 0.128.0+.
//
// Stream format observed live (2026-05-17):
//   {"type":"thread.started","thread_id":"<UUID>"}
//   {"type":"turn.started"}
//   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
//   {"type":"item.completed","item":{"id":"item_1","type":"function_call",
//     "name":"shell","arguments":"..."}}
//   {"type":"turn.completed","usage":{"input_tokens":N,"cached_input_tokens":N,
//     "output_tokens":N,"reasoning_output_tokens":N}}
//
// Codex does not emit `total_cost_usd`; cost is estimated downstream via
// server/pricing.ts. Codex does not honour Claude's OTEL env vars; signals are
// synthesised by server/codex-otel-bridge.ts.
//
// Spec: openspec/specs/multi-provider-architecture/spec.md

import { execSync } from 'child_process'
import type {
  AdapterEvent,
  DetectionResult,
  NormalisedResult,
  ProviderAdapter,
  SpawnAction,
  SpawnOptions,
} from './types'

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

const CODEX_MIN_VERSION = '0.128.0'

const CODEX_MODELS = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', default: true as const },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
] as const

const SANDBOX_FLAGS = ['--sandbox', 'workspace-write'] as const
const RAIL_SANDBOX_FLAGS = ['--sandbox', 'danger-full-access'] as const
// `codex exec resume` does NOT accept `--sandbox` (the flag only exists on
// `codex exec`); pass the policy as a `-c` config override instead so the
// resumed session honours workspace-write even when the per-project
// `.codex/config.toml` isn't on the spawn cwd (e.g. explore-cwd).
const SANDBOX_RESUME_FLAGS = ['-c', 'sandbox_mode="workspace-write"'] as const
const SKIP_GIT_CHECK = '--skip-git-repo-check' as const

/** Fold system prompt into the user prompt for providers without --system-prompt. */
function fold(systemPrompt: string | undefined, prompt: string): string {
  if (!systemPrompt) return prompt
  return `${systemPrompt}\n\n---\n\n${prompt}`
}

function buildCodexArgs(action: SpawnAction, opts: SpawnOptions): string[] {
  const args: string[] = []

  switch (action) {
    case 'chat-turn': {
      // chat-turn (Explore) spawns codex from the hub-managed explore-cwd,
      // which already ships an AGENTS.md with the Explore stance. Folding the
      // hub's system prompt into the positional argv would double-inject the
      // framing AND, because the user message in Explore is often very short
      // ("quiero hacer un tetris"), the long system text dominates the prompt
      // and codex responds to the system instructions instead of the user.
      // Trust AGENTS.md and pass only the user prompt.
      args.push('exec', '--json', ...SANDBOX_FLAGS, SKIP_GIT_CHECK)
      args.push(opts.prompt)
      args.push('--model', opts.model)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
    case 'spec-gen':
    case 'agent-refine':
    case 'auto-title':
    case 'setup-enrich': {
      args.push('exec', '--json', ...SANDBOX_FLAGS, SKIP_GIT_CHECK)
      args.push(fold(opts.systemPrompt, opts.prompt))
      args.push('--model', opts.model)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
    case 'ask-answer': {
      // Ask-the-Hub: prompt is fed via stdin from spawn-one-shot — no
      // positional prompt here. Codex non-TTY mode always opens stdin,
      // and any positional prompt confuses parsing when stdin is also live.
      // We intentionally DO NOT pass --model: ChatGPT-subscription codex
      // rejects model overrides not available on the user's plan with a
      // silent exit. The user's default model (configured via `codex
      // config`) is used instead.
      args.push('exec', '--json', ...SANDBOX_FLAGS, SKIP_GIT_CHECK)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
    case 'chat-resume': {
      if (!opts.sessionId) {
        throw new Error(`${action} requires sessionId`)
      }
      // See chat-turn note: AGENTS.md in explore-cwd carries the Explore
      // framing; the per-turn argv must stay user-text-only so codex doesn't
      // mistake the system prompt for the user request.
      args.push('exec', 'resume', '--json', ...SANDBOX_RESUME_FLAGS, SKIP_GIT_CHECK)
      args.push(opts.sessionId)
      args.push(opts.prompt)
      args.push('--model', opts.model)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
    case 'setup-enrich-resume': {
      if (!opts.sessionId) {
        throw new Error(`${action} requires sessionId`)
      }
      args.push('exec', 'resume', '--json', ...SANDBOX_RESUME_FLAGS, SKIP_GIT_CHECK)
      args.push(opts.sessionId)
      args.push(fold(opts.systemPrompt, opts.prompt))
      args.push('--model', opts.model)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
    case 'rail-job': {
      // Rail jobs are headless implementation pipelines. They must run repo
      // inspection, edits, tests, and git probes without interactive approval.
      // On Windows, Codex's workspace-write sandbox can fail before the first
      // shell command with `windows sandbox: spawn setup refresh`; full access
      // matches the existing fully-autonomous rail contract.
      args.push('exec', '--json', ...RAIL_SANDBOX_FLAGS, SKIP_GIT_CHECK)
      args.push(fold(opts.systemPrompt, opts.prompt))
      args.push('--model', opts.model)
      if (opts.extraArgs) args.push(...opts.extraArgs)
      return args
    }
  }
}

function parseCodexStreamLine(line: string): AdapterEvent | null {
  if (line.length === 0) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }

  const type = parsed.type as string | undefined
  if (!type) return { kind: 'other', type: '<missing>', raw: parsed }

  if (type === 'thread.started') {
    const sid = parsed.thread_id as string | undefined
    if (sid) return { kind: 'session-started', sessionId: sid }
    return { kind: 'other', type, raw: parsed }
  }

  if (type === 'turn.completed') {
    return { kind: 'result', payload: parsed }
  }

  if (type === 'item.completed') {
    const item = parsed.item as { type?: string; text?: string; name?: string; arguments?: string } | undefined
    if (item?.type === 'agent_message') {
      const text = item.text ?? ''
      if (text) return { kind: 'text-delta', text }
      return { kind: 'other', type, raw: parsed }
    }
    if (item?.type === 'function_call' || item?.type === 'local_shell_call') {
      const name = item.name ?? (item.type === 'local_shell_call' ? 'shell' : '<unnamed>')
      const inputPreview = item.arguments ? item.arguments.slice(0, 200) : ''
      return { kind: 'tool-use', name, inputPreview }
    }
    return { kind: 'other', type, raw: parsed }
  }

  return { kind: 'other', type, raw: parsed }
}

function extractCodexResult(events: readonly AdapterEvent[]): NormalisedResult {
  let sessionId: string | undefined
  let resultPayload: Record<string, unknown> | null = null
  // First text-delta timestamp is unavailable from events (we'd need wall-clock
  // tracking). duration_ms is left undefined and the manager-level wrapper
  // synthesises it from the spawn-close timestamps if it wants to populate.
  for (const ev of events) {
    if (ev.kind === 'session-started') sessionId = ev.sessionId
    else if (ev.kind === 'result') resultPayload = ev.payload
  }

  if (!resultPayload) {
    return { session_id: sessionId }
  }

  const usage = resultPayload.usage as Record<string, number> | undefined
  // OpenAI bills reasoning_output_tokens at the output rate, so we fold it
  // into tokens_out for cost-estimation correctness.
  const baseOut = usage?.output_tokens ?? 0
  const reasoning = usage?.reasoning_output_tokens ?? 0
  const tokensOut = baseOut + reasoning

  return {
    tokens_in: usage?.input_tokens,
    tokens_out: usage ? tokensOut : undefined,
    tokens_cache_read: usage?.cached_input_tokens,
    // Codex has no separate "cache creation" tier — left undefined.
    tokens_cache_create: undefined,
    // total_cost_usd intentionally absent — estimated via pricing.ts.
    num_turns: 1, // codex exec is single-turn; resume is also one turn
    // Model on stream events is not present; manager-level wrapper passes
    // the requested model in via the spawn args and stamps it on the row.
    model: undefined,
    duration_ms: undefined,
    duration_api_ms: undefined,
    session_id: sessionId,
  }
}

function compareSemver(a: string, b: string): number {
  const aParts = a.split('.').map((n) => parseInt(n, 10))
  const bParts = b.split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const av = aParts[i] ?? 0
    const bv = bParts[i] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

async function detectCodexInstalled(): Promise<DetectionResult> {
  try {
    execSync(`${WHICH_CMD} codex`, { stdio: 'ignore' })
  } catch {
    return { installed: false, executable: false }
  }

  try {
    const raw = execSync('codex --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim()
    const match = raw.match(/\d+\.\d+\.\d+/)
    const version = match ? match[0] : raw
    const meetsMinimum = match ? compareSemver(version, CODEX_MIN_VERSION) >= 0 : false
    const result: DetectionResult = {
      installed: true,
      executable: true,
      version,
      meetsMinimum,
    }
    if (!meetsMinimum) {
      result.error = `codex ${version} is older than required ${CODEX_MIN_VERSION}. Upgrade with: brew upgrade codex (or follow https://developers.openai.com/codex).`
    }
    return result
  } catch {
    return { installed: true, executable: false }
  }
}

export const codexAdapter: ProviderAdapter = {
  id: 'codex',
  displayName: 'Codex CLI',
  binary: 'codex',
  minCliVersion: CODEX_MIN_VERSION,
  projectDirName: '.codex',
  instructionsFilename: 'AGENTS.md',
  mcpRegistration: 'cli-add',
  capabilities: {
    nativeResume: true,
    nativeStreamJson: true,
    nativeCostUsd: false,
    nativeOtelEnv: false,
    profileEnvSupport: true,
    systemPromptArg: false,
  },
  modelCatalog: () => CODEX_MODELS,
  defaultModel: () => 'gpt-5.4-mini',
  buildArgs: buildCodexArgs,
  parseStreamLine: parseCodexStreamLine,
  extractResult: extractCodexResult,
  baselineAgents: () => ['sr-architect', 'sr-developer', 'sr-reviewer', 'sr-merge-resolver'],
  detectInstalled: detectCodexInstalled,
}

export { CODEX_MIN_VERSION as _CODEX_MIN_VERSION, compareSemver as _compareSemver }
