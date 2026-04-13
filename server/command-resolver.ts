import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Locate the hub repository root (the directory containing .claude/commands/).
 * Works in both dev mode (tsx: __dirname = <hub>/server/) and
 * compiled mode (tsc: __dirname = <hub>/server/dist/).
 */
function findHubRoot(): string | null {
  let dir = resolve(__dirname, '..')
  if (existsSync(join(dir, '.claude', 'commands'))) return dir
  dir = resolve(__dirname, '../..')
  if (existsSync(join(dir, '.claude', 'commands'))) return dir
  return null
}

const HUB_ROOT = findHubRoot()

/**
 * Try to find a command/skill .md file for the given command path parts
 * within the given base directory. Returns the resolved path or null.
 */
function findCommandFile(baseDir: string, parts: string[]): string | null {
  const filePath = join(baseDir, '.claude', 'commands', ...parts) + '.md'
  if (existsSync(filePath)) return filePath
  const skillPath = join(baseDir, '.claude', 'skills', ...parts) + '.md'
  if (existsSync(skillPath)) return skillPath
  return null
}

/**
 * Resolves a slash command string to its full prompt content.
 * Reads the command file from .claude/commands/ or .claude/skills/,
 * strips YAML frontmatter, and substitutes $ARGUMENTS.
 *
 * Searches the project directory first, then falls back to the hub's
 * own .claude/commands/ directory (for hub-namespaced commands like
 * /specrails:implement that aren't installed in the target project).
 *
 * Falls back to returning the command string as-is if the file is not found.
 */
export function resolveCommand(command: string, cwd: string): string {
  const match = command.match(/^\/([^\s]+)\s*(.*)$/s)
  if (!match) return command

  const commandPath = match[1]
  const commandArgs = match[2].trim()
  const parts = commandPath.split(':')

  // 1. Check the project directory
  let resolvedPath = findCommandFile(cwd, parts)

  // 2. Fallback: check the hub's own directory
  if (!resolvedPath && HUB_ROOT && resolve(cwd) !== resolve(HUB_ROOT)) {
    resolvedPath = findCommandFile(HUB_ROOT, parts)
  }

  if (!resolvedPath) return command

  let content = readFileSync(resolvedPath, 'utf-8')
  content = content.replace(/^---[\s\S]*?---\s*/, '')
  content = content.replace(/\$ARGUMENTS/g, commandArgs)
  return content.trim()
}
