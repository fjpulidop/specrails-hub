// Centralized claude/codex spawn wrapper.
//
// Why this exists:
//
//   On Windows, cross-spawn invokes claude.cmd / codex.cmd through
//   `cmd.exe /d /s /c "..."`. cmd.exe does NOT preserve newlines
//   inside argv values: any `\n` in `--system-prompt`,
//   `--append-system-prompt`, `-p`, or codex's positional prompt
//   truncates the arg there and the rest of the command line gets
//   reparsed as orphan tokens. Visible symptoms include
//   "Input must be provided either through stdin or as a prompt
//   argument when using --print" and assistant messages that look
//   like "your message got cut off — you wrote 'are' but I'm not
//   sure what you were asking".
//
//   On POSIX argv passes through cleanly, so we keep that path.
//
// The helpers below detect multi-line argv values on Windows,
// reroute them through child stdin (claude reads stdin when
// `-p`/`--print` has no positional argument; codex `exec -` does the
// equivalent), and call spawnCli. POSIX is unchanged byte-for-byte.

import type { ChildProcess, SpawnOptions, StdioOptions } from 'child_process'
import { spawnCli } from './win-spawn'

const isWin = process.platform === 'win32'

const CLAUDE_PROMPT_FLAGS = new Set([
  '--system-prompt',
  '--append-system-prompt',
  '-p',
  '--print',
])

interface WindowsTransform {
  args: string[]
  stdinPayload: string | null
}

export function transformClaudeArgsForWindows(args: string[]): WindowsTransform {
  const collected: string[] = []
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (CLAUDE_PROMPT_FLAGS.has(a) && i + 1 < args.length) {
      collected.push(args[i + 1])
      i++ // skip the value
      continue
    }
    out.push(a)
  }
  if (collected.length === 0) {
    return { args: out, stdinPayload: null }
  }
  // Re-add `-p` so claude knows to read stdin (--print mode).
  out.push('-p')
  return { args: out, stdinPayload: collected.join('\n\n---\n\n') }
}

// Codex `exec` flags we currently use that take a value (rest are
// boolean). Update if we ever pass new value-bearing flags.
const CODEX_EXEC_VALUE_FLAGS = new Set(['--model'])

export function transformCodexArgsForWindows(args: string[]): WindowsTransform {
  // Expected shape: `exec [...flags] <prompt> [...flags]`.
  if (args.length === 0 || args[0] !== 'exec') {
    return { args, stdinPayload: null }
  }
  const out: string[] = ['exec']
  let stdin: string | null = null
  let promptReplacedIdx = -1
  let i = 1
  while (i < args.length) {
    const a = args[i]
    if (a.startsWith('--')) {
      out.push(a)
      if (CODEX_EXEC_VALUE_FLAGS.has(a) && i + 1 < args.length) {
        out.push(args[i + 1])
        i += 2
        continue
      }
      i += 1
      continue
    }
    // First non-flag positional is the prompt.
    if (stdin === null) {
      stdin = a
      promptReplacedIdx = out.length
      out.push('-')
    } else {
      out.push(a)
    }
    i += 1
  }
  if (stdin === null || !stdin.includes('\n')) {
    // Single-line prompts pass through cmd.exe fine — keep argv to
    // dodge any codex versions that don't recognise `-` as stdin.
    if (stdin !== null && promptReplacedIdx >= 0) {
      out[promptReplacedIdx] = stdin
    }
    return { args: out, stdinPayload: null }
  }
  return { args: out, stdinPayload: stdin }
}

export function ensureStdinPipe(stdio: StdioOptions | undefined): StdioOptions {
  const fallback: StdioOptions = ['pipe', 'pipe', 'pipe']
  if (stdio === undefined) return fallback
  if (typeof stdio === 'string') {
    // 'pipe' | 'inherit' | 'ignore' | 'overlapped'
    return ['pipe', stdio, stdio]
  }
  if (Array.isArray(stdio)) {
    return [
      stdio[0] === 'ignore' ? 'pipe' : (stdio[0] ?? 'pipe'),
      stdio[1] ?? 'pipe',
      stdio[2] ?? 'pipe',
    ] as StdioOptions
  }
  return fallback
}

/**
 * Spawn `claude` with arg-rewrite on Windows so multi-line prompts
 * survive. POSIX call is identical to `spawnCli('claude', args, options)`.
 */
export function spawnClaude(args: string[], options: SpawnOptions = {}): ChildProcess {
  if (!isWin) {
    return spawnCli('claude', args, options)
  }
  /* c8 ignore start -- Windows-only branch; coverage runs on Linux/macOS */
  const { args: winArgs, stdinPayload } = transformClaudeArgsForWindows(args)
  if (stdinPayload === null) {
    return spawnCli('claude', winArgs, options)
  }
  const child = spawnCli('claude', winArgs, {
    ...options,
    stdio: ensureStdinPipe(options.stdio),
  })
  if (child.stdin) child.stdin.end(stdinPayload)
  return child
  /* c8 ignore stop */
}

/**
 * Spawn `codex` with arg-rewrite on Windows so multi-line prompts
 * survive. POSIX call is identical to `spawnCli('codex', args, options)`.
 */
export function spawnCodex(args: string[], options: SpawnOptions = {}): ChildProcess {
  if (!isWin) {
    return spawnCli('codex', args, options)
  }
  /* c8 ignore start -- Windows-only branch; coverage runs on Linux/macOS */
  const { args: winArgs, stdinPayload } = transformCodexArgsForWindows(args)
  if (stdinPayload === null) {
    return spawnCli('codex', winArgs, options)
  }
  const child = spawnCli('codex', winArgs, {
    ...options,
    stdio: ensureStdinPipe(options.stdio),
  })
  if (child.stdin) child.stdin.end(stdinPayload)
  return child
  /* c8 ignore stop */
}

/**
 * Convenience: dispatch on binary name. Use when callsite picks the
 * binary dynamically (claude vs codex). Anything else routes through
 * the underlying spawnCli unchanged.
 */
export function spawnAiCli(
  binary: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  if (binary === 'claude') return spawnClaude(args, options)
  if (binary === 'codex') return spawnCodex(args, options)
  return spawnCli(binary, args, options)
}
