/**
 * Format a job's stored `command` field for display.
 *
 * Jobs are queued with the canonical claude-shape command string
 * (`/specrails:implement #N`, `/sr:batch-implement`, …) regardless
 * of the project's provider — that's the form the wizard builds and
 * the form the queue-manager regex parses to extract ticket ids.
 *
 * For codex projects the user types / sees `$implement #N` (codex's
 * skill-mention syntax), so the UI translates at render time. The
 * stored value never changes.
 *
 * Translation map (codex only):
 *   /specrails:<name>  →  $<name>
 *   /sr:<name>         →  $<name>   (alias used in some docs)
 *
 * For claude projects the command is returned verbatim.
 */
export function formatCommandForProvider(
  command: string,
  provider: string | null | undefined,
): string {
  if (provider !== 'codex') return command
  return command
    .replace(/^\/(specrails|sr):([\w-]+)/g, '$$$2')
    .replace(/(\s)\/(specrails|sr):([\w-]+)/g, '$1$$$3')
}
