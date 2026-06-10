/**
 * Shell-quoting helpers for path injection (drag-drop). Strict — never trust the
 * input string to be safe.
 */

/**
 * POSIX (sh, bash, zsh, fish): single-quote the path, escape any embedded `'`
 * with the canonical `'\''` sequence. Always quoting is the simplest correct
 * approach because single-quoted strings have no escape interpretation in POSIX.
 */
export function quotePosix(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

/**
 * Windows cmd.exe ONLY: wrap in double quotes; escape inner double quotes by
 * doubling (`""`) and caret-escape cmd metacharacters (`%`, `^`).
 *
 * ⚠️ NOT safe for PowerShell (M3): inside a PowerShell double-quoted string,
 * `$(...)` and backtick are interpolated, so a path like `$(calc.exe).txt` would
 * execute once the line reaches the prompt. Use `quoteWindowsPowerShell` for
 * PowerShell. Retained only for callers that KNOW the target shell is cmd.exe.
 */
export function quoteWindowsCmd(path: string): string {
  const escaped = path
    .replace(/\^/g, '^^')
    .replace(/%/g, '^%')
    .replace(/"/g, '""')
  return `"${escaped}"`
}

/**
 * Windows PowerShell: single-quote the path. PowerShell single-quoted strings
 * perform NO interpolation — `$`, `$(...)`, and backtick are all literal — so
 * this is injection-safe (M3). Inner single quotes are doubled (`''`).
 */
export function quoteWindowsPowerShell(path: string): string {
  return `'${path.replace(/'/g, "''")}'`
}

/**
 * Pick the right quoting for the host runtime. POSIX outside Windows; on Windows
 * we quote for PowerShell — the integrated terminal's default shell
 * (server resolveShell → powershell.exe) — which (unlike cmd.exe) interpolates
 * inside double quotes, so cmd-style quoting would be an injection sink (M3).
 */
export function quoteForHost(path: string, isWindows: boolean): string {
  return isWindows ? quoteWindowsPowerShell(path) : quotePosix(path)
}

/** Join multiple paths separated by spaces, each individually quoted. */
export function quotePathList(paths: string[], isWindows: boolean): string {
  return paths.map((p) => quoteForHost(p, isWindows)).join(' ')
}
