import type { LocalTicket, TicketPriority } from '../types'
import {
  type SpecSortMode,
  type SpecSortDir,
  DEFAULT_SPEC_SORT_MODE,
  DEFAULT_SPEC_SORT_DIR,
} from '../types/spec-sort'

const MODE_KEY = (projectId: string) => `specrails-hub:spec-sort-mode:${projectId}`
const DIR_KEY = (projectId: string) => `specrails-hub:spec-sort-dir:${projectId}`

function isMode(v: unknown): v is SpecSortMode {
  return v === 'default' || v === 'ticket-id' || v === 'priority'
}

function isDir(v: unknown): v is SpecSortDir {
  return v === 'asc' || v === 'desc'
}

export interface SpecSortState {
  mode: SpecSortMode
  dir: SpecSortDir
}

export function loadSpecSort(projectId: string | null): SpecSortState {
  if (!projectId) return { mode: DEFAULT_SPEC_SORT_MODE, dir: DEFAULT_SPEC_SORT_DIR }
  let mode: SpecSortMode = DEFAULT_SPEC_SORT_MODE
  let dir: SpecSortDir = DEFAULT_SPEC_SORT_DIR
  try {
    const m = localStorage.getItem(MODE_KEY(projectId))
    if (isMode(m)) mode = m
  } catch {}
  try {
    const d = localStorage.getItem(DIR_KEY(projectId))
    if (isDir(d)) dir = d
  } catch {}
  return { mode, dir }
}

export function saveSpecSort(
  projectId: string | null,
  mode: SpecSortMode,
  dir: SpecSortDir,
): void {
  if (!projectId) return
  try {
    localStorage.setItem(MODE_KEY(projectId), mode)
    localStorage.setItem(DIR_KEY(projectId), dir)
  } catch {}
}

const PRIORITY_BUCKET: Record<NonNullable<TicketPriority> | 'null', number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  null: 0,
}

function bucketOf(p: TicketPriority | null): number {
  if (p === null) return PRIORITY_BUCKET.null
  return PRIORITY_BUCKET[p]
}

export function sortByTicketId(a: LocalTicket, b: LocalTicket, dir: SpecSortDir): number {
  return dir === 'asc' ? a.id - b.id : b.id - a.id
}

export function sortByPriority(a: LocalTicket, b: LocalTicket, dir: SpecSortDir): number {
  const ba = bucketOf(a.priority)
  const bb = bucketOf(b.priority)
  const bucketDelta = dir === 'asc' ? ba - bb : bb - ba
  if (bucketDelta !== 0) return bucketDelta
  return a.id - b.id
}

export function applySpecSort(
  tickets: LocalTicket[],
  mode: SpecSortMode,
  dir: SpecSortDir,
): LocalTicket[] {
  if (mode === 'ticket-id') return [...tickets].sort((a, b) => sortByTicketId(a, b, dir))
  if (mode === 'priority') return [...tickets].sort((a, b) => sortByPriority(a, b, dir))
  return tickets
}
