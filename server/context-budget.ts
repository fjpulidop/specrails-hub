// Context budget — coarse token estimates for the four Add Spec context scopes.
// Powers the live numeric line in the Cost Awareness meter.
//
// Estimates are bytes/4 (ASCII heuristic). Codebase walk respects common
// ignore patterns (node_modules, .git, dist, build) but does not parse
// .gitignore — keeping it cheap and fast.

import fs from 'node:fs'
import path from 'node:path'
import { buildSpecrailsTicketsSection, buildOpenSpecSpecsSection } from './context-scope'

export interface ContextBudget {
  /** Token estimate for .specrails/local-tickets.json (the project's ticket store). */
  specrailsTicketsTokens: number
  openspecSpecsTokens: number
  codebaseFileCount: number
  codebaseEstimatedTokens: number
  mcpServers: string[]
}

const BYTES_PER_TOKEN = 4
const CACHE_TTL_MS = 60_000
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
  'coverage', '.cache', 'tmp', '.specrails',
])
const SOURCE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.md', '.json', '.css', '.scss', '.html',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.cs',
])

interface CacheEntry {
  value: ContextBudget
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function clearContextBudgetCache(projectId?: string): void {
  if (projectId) cache.delete(projectId)
  else cache.clear()
}

function walkCodebase(root: string): { fileCount: number; bytes: number } {
  if (!fs.existsSync(root)) return { fileCount: 0, bytes: 0 }
  let fileCount = 0
  let bytes = 0
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue
      if (e.name.startsWith('.') && e.name !== '.specrails-skip-marker') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        stack.push(full)
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase()
        if (!SOURCE_EXT.has(ext)) continue
        try {
          bytes += fs.statSync(full).size
          fileCount += 1
        } catch { /* skip */ }
      }
    }
  }
  return { fileCount, bytes }
}

function readMcpServers(projectPath: string): string[] {
  const file = path.join(projectPath, '.mcp.json')
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }
    return parsed.mcpServers ? Object.keys(parsed.mcpServers).sort() : []
  } catch {
    return []
  }
}

function bytesOfSection(section: string | null): number {
  return section ? Buffer.byteLength(section, 'utf8') : 0
}

export function computeContextBudget(projectPath: string): ContextBudget {
  // Use the same builders the spawn path uses — token estimates reflect what
  // will actually land in the system prompt (caps + formatting included), not
  // the raw on-disk byte count of source files.
  const ticketsBytes = bytesOfSection(buildSpecrailsTicketsSection(projectPath))
  const openspecBytes = bytesOfSection(buildOpenSpecSpecsSection(projectPath))
  const { fileCount, bytes: codebaseBytes } = walkCodebase(projectPath)
  return {
    specrailsTicketsTokens: Math.round(ticketsBytes / BYTES_PER_TOKEN),
    openspecSpecsTokens: Math.round(openspecBytes / BYTES_PER_TOKEN),
    codebaseFileCount: fileCount,
    codebaseEstimatedTokens: Math.round(codebaseBytes / BYTES_PER_TOKEN),
    mcpServers: readMcpServers(projectPath),
  }
}

export function getContextBudget(projectId: string, projectPath: string): ContextBudget {
  const now = Date.now()
  const hit = cache.get(projectId)
  if (hit && hit.expiresAt > now) return hit.value
  const value = computeContextBudget(projectPath)
  cache.set(projectId, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}
