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
 * Windows cmd.exe: wrap in double quotes; escape inner double quotes by
 * doubling them (`""`). Caret-escape cmd metacharacters that retain their
 * meaning even inside double quotes (the percent sign and the caret itself).
 *
 * This is conservative — it works for both cmd.exe and PowerShell when the
 * argument is going to be pasted into the terminal as a string, since both
 * accept double-quoted paths as a single token.
 */
export function quoteWindowsCmd(path: string): string {
  const escaped = path
    .replace(/\^/g, '^^')
    .replace(/%/g, '^%')
    .replace(/"/g, '""')
  return `"${escaped}"`
}

/**
 * Pick the right quoting for the host runtime. We default to POSIX outside of
 * Windows; callers that know the target shell explicitly can use the specific
 * function.
 */
export function quoteForHost(path: string, isWindows: boolean): string {
  return isWindows ? quoteWindowsCmd(path) : quotePosix(path)
}

/** Join multiple paths separated by spaces, each individually quoted. */
export function quotePathList(paths: string[], isWindows: boolean): string {
  return paths.map((p) => quoteForHost(p, isWindows)).join(' ')
}
