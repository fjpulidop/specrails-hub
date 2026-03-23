import fs from 'fs'
import path from 'path'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Ticket {
  id: number
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: string | null
  prerequisites: number[]
  metadata: {
    vpc_scores?: Record<string, unknown>
    effort_level?: string
    user_story?: string
    area?: string
  }
  comments?: Array<{
    id: number
    body: string
    created_at: string
    created_by: string
  }>
  created_at: string
  updated_at: string
  created_by: string
  source: 'manual' | 'product-backlog' | 'propose-spec' | 'hub'
}

export interface TicketStore {
  schema_version: string
  revision: number
  last_updated: string
  next_id: number
  tickets: Record<string, Ticket>
}

const VALID_STATUSES = new Set<TicketStatus>(['todo', 'in_progress', 'done', 'cancelled'])
const VALID_PRIORITIES = new Set<TicketPriority>(['critical', 'high', 'medium', 'low'])

const DEFAULT_STORAGE_PATH = '.claude/local-tickets.json'
const LOCK_SUFFIX = '.lock'
const LOCK_STALE_MS = 10_000 // 10 seconds

// ─── Path resolution ─────────────────────────────────────────────────────────

export function resolveTicketStoragePath(projectPath: string): string {
  // Try to read ticketProvider.storagePath from integration-contract.json
  const contractPath = path.join(projectPath, '.claude', 'integration-contract.json')
  if (fs.existsSync(contractPath)) {
    try {
      const contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'))
      if (contract.ticketProvider?.storagePath) {
        return path.resolve(projectPath, contract.ticketProvider.storagePath)
      }
    } catch {
      // Fall through to default
    }
  }
  return path.resolve(projectPath, DEFAULT_STORAGE_PATH)
}

// ─── Advisory file locking ───────────────────────────────────────────────────

function acquireLock(filePath: string): void {
  const lockPath = filePath + LOCK_SUFFIX
  const maxAttempts = 50
  const retryDelay = 50 // ms

  // Ensure parent directory exists before attempting lock
  const dir = path.dirname(lockPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // O_EXCL ensures atomic create-if-not-exists
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY)
      fs.writeSync(fd, String(process.pid))
      fs.closeSync(fd)
      return
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Check for stale lock
        try {
          const stat = fs.statSync(lockPath)
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(lockPath)
            continue
          }
        } catch {
          // Lock file disappeared, retry
          continue
        }
        // Wait and retry
        const waitUntil = Date.now() + retryDelay
        while (Date.now() < waitUntil) { /* busy wait for short duration */ }
        continue
      }
      throw err
    }
  }
  throw new Error('Could not acquire lock on ticket store')
}

function releaseLock(filePath: string): void {
  const lockPath = filePath + LOCK_SUFFIX
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // Lock already released or missing
  }
}

// ─── Store operations ────────────────────────────────────────────────────────

function emptyStore(): TicketStore {
  return {
    schema_version: '1.0',
    revision: 0,
    last_updated: new Date().toISOString(),
    next_id: 1,
    tickets: {},
  }
}

export function readStore(filePath: string): TicketStore {
  if (!fs.existsSync(filePath)) {
    return emptyStore()
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as TicketStore
    // Basic validation
    if (!data.tickets || typeof data.revision !== 'number') {
      return emptyStore()
    }
    return data
  } catch {
    return emptyStore()
  }
}

function writeStore(filePath: string, store: TicketStore): void {
  store.last_updated = new Date().toISOString()
  store.revision++
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

/** Execute a read-modify-write cycle with advisory locking */
export function withLock<T>(filePath: string, fn: (store: TicketStore) => T): T {
  acquireLock(filePath)
  try {
    return fn(readStore(filePath))
  } finally {
    releaseLock(filePath)
  }
}

/** Execute a read-modify-write cycle, writing changes back */
export function mutateStore(filePath: string, fn: (store: TicketStore) => void): TicketStore {
  acquireLock(filePath)
  try {
    const store = readStore(filePath)
    fn(store)
    writeStore(filePath, store)
    return store
  } finally {
    releaseLock(filePath)
  }
}

// ─── Query helpers ───────────────────────────────────────────────────────────

export interface TicketFilters {
  status?: string
  label?: string
  q?: string
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  let result = tickets

  if (filters.status) {
    const statuses = filters.status.split(',').map(s => s.trim())
    result = result.filter(t => statuses.includes(t.status))
  }

  if (filters.label) {
    const labels = filters.label.split(',').map(l => l.trim().toLowerCase())
    result = result.filter(t =>
      t.labels.some(tl => labels.includes(tl.toLowerCase()))
    )
  }

  if (filters.q) {
    const query = filters.q.toLowerCase()
    result = result.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
    )
  }

  return result
}

// ─── Validation helpers ──────────────────────────────────────────────────────

export function isValidStatus(s: unknown): s is TicketStatus {
  return typeof s === 'string' && VALID_STATUSES.has(s as TicketStatus)
}

export function isValidPriority(p: unknown): p is TicketPriority {
  return typeof p === 'string' && VALID_PRIORITIES.has(p as TicketPriority)
}
