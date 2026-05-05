import fs from 'fs'
import path from 'path'
import { atomicWriteFileSync, withFileLock } from './json-mutation'

/**
 * Plugins contribute named sections to `<project>/CLAUDE.md` so the agent's
 * global context includes per-plugin usage hints (e.g., "prefer Serena tools
 * over raw Read/Grep when locating symbols"). Each plugin owns one named
 * block delimited by HTML-comment markers; multiple plugins coexist without
 * stomping each other.
 *
 *   <!-- specrails-hub-managed:<plugin>:start -->
 *   ...content...
 *   <!-- specrails-hub-managed:<plugin>:end -->
 *
 * Operations are surgical, atomic (temp+rename), and serialized via the
 * shared in-process file mutex.
 */

function startMarker(pluginName: string): string {
  return `<!-- specrails-hub-managed:${pluginName}:start -->`
}
function endMarker(pluginName: string): string {
  return `<!-- specrails-hub-managed:${pluginName}:end -->`
}

function claudeMdPath(projectPath: string): string {
  return path.join(projectPath, 'CLAUDE.md')
}

interface BlockMatch {
  start: number
  end: number
  /** Content between markers, trimmed of surrounding blank lines. */
  content: string
}

function locateBlock(text: string, pluginName: string): BlockMatch | null {
  const start = startMarker(pluginName)
  const end = endMarker(pluginName)
  const sIdx = text.indexOf(start)
  if (sIdx < 0) return null
  const eIdx = text.indexOf(end, sIdx + start.length)
  if (eIdx < 0) return null
  const innerStart = sIdx + start.length
  const innerEnd = eIdx
  return {
    start: sIdx,
    end: eIdx + end.length,
    content: text.slice(innerStart, innerEnd).replace(/^\n+|\n+$/g, ''),
  }
}

/** Returns the current managed-block content for `pluginName`, or null if absent. */
export function getBlockContent(projectPath: string, pluginName: string): string | null {
  const file = claudeMdPath(projectPath)
  if (!fs.existsSync(file)) return null
  const text = fs.readFileSync(file, 'utf8')
  const match = locateBlock(text, pluginName)
  return match ? match.content : null
}

/**
 * Insert or replace the managed block for `pluginName`. If CLAUDE.md does
 * not exist, it is created with just the block. If it exists without our
 * block, the block is appended at the end (separated by a blank line).
 */
export async function upsertBlock(
  projectPath: string,
  pluginName: string,
  content: string,
): Promise<void> {
  const file = claudeMdPath(projectPath)
  const block = `${startMarker(pluginName)}\n${content.trim()}\n${endMarker(pluginName)}`
  await withFileLock(file, async () => {
    let next: string
    if (!fs.existsSync(file)) {
      next = block + '\n'
    } else {
      const cur = fs.readFileSync(file, 'utf8')
      const match = locateBlock(cur, pluginName)
      if (match) {
        next = cur.slice(0, match.start) + block + cur.slice(match.end)
      } else {
        const sep = cur.endsWith('\n\n') ? '' : cur.endsWith('\n') ? '\n' : '\n\n'
        next = cur + sep + block + '\n'
      }
    }
    atomicWriteFileSync(file, next)
  })
}

/**
 * Remove the managed block for `pluginName`. No-op when CLAUDE.md is missing
 * or the block is absent. Surrounding user content is preserved byte-identical.
 *
 * If removing the block leaves the file empty (the managed block was the
 * only content), the file is deleted — this restores the pre-install state
 * for projects that didn't have a CLAUDE.md before any plugin install.
 */
export async function removeBlock(projectPath: string, pluginName: string): Promise<void> {
  const file = claudeMdPath(projectPath)
  if (!fs.existsSync(file)) return
  await withFileLock(file, async () => {
    const cur = fs.readFileSync(file, 'utf8')
    const match = locateBlock(cur, pluginName)
    if (!match) return
    // Strip the block plus a single trailing newline if present, so we don't
    // leave a stray blank line behind.
    let next = cur.slice(0, match.start) + cur.slice(match.end)
    next = next.replace(/\n{3,}$/, '\n').replace(/^\n+/, '')
    if (next.trim() === '') {
      fs.unlinkSync(file)
      return
    }
    atomicWriteFileSync(file, next)
  })
}
