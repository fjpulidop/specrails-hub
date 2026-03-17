import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Resolves a slash command string to its full prompt content.
 * Reads the command file from .claude/commands/ or .claude/skills/,
 * strips YAML frontmatter, and substitutes $ARGUMENTS.
 *
 * Falls back to returning the command string as-is if the file is not found.
 */
export function resolveCommand(command: string, cwd: string): string {
  const match = command.match(/^\/([^\s]+)\s*(.*)$/s)
  if (!match) return command

  const commandPath = match[1]
  const commandArgs = match[2].trim()

  const filePath = join(cwd, '.claude', 'commands', ...commandPath.split(':')) + '.md'
  const skillPath = join(cwd, '.claude', 'skills', ...commandPath.split(':')) + '.md'

  const resolvedPath = existsSync(filePath) ? filePath : existsSync(skillPath) ? skillPath : null

  if (!resolvedPath) return command

  let content = readFileSync(resolvedPath, 'utf-8')
  content = content.replace(/^---[\s\S]*?---\s*/, '')
  content = content.replace(/\$ARGUMENTS/g, commandArgs)
  return content.trim()
}
