export type Surface = 'job' | 'quick-spec' | 'explore-spec' | 'ai-edit' | 'smash'
export type SurfaceFilter = Surface | 'all'
export type Period = '7d' | '30d' | '90d' | 'all' | 'custom'

export interface SpendingFilters {
  period: Period
  from?: string
  to?: string
  surface?: Surface[]
  model?: string[]
  status?: 'success' | 'failed' | 'aborted'
  minCostUsd?: number
  ticketId?: number
}

export interface BySurfaceCount { surface: Surface; count: number; costUsd: number }
export interface ByModelEntry { model: string; count: number; costUsd: number }
export interface DailyEntry {
  date: string
  jobsCostUsd: number
  quickCostUsd: number
  exploreCostUsd: number
  aiEditCostUsd: number
  smashCostUsd: number
  totalCostUsd: number
}
export interface ScatterPoint {
  id: string
  surface: Surface
  costUsd: number
  numTurns: number | null
  durationMs: number | null
  ticketId: number | null
  startedAt: string
}
export interface TopTicketEntry {
  ticketId: number | null
  ticketTitle: string | null
  totalCostUsd: number
  totalRuns: number
  bySurface: Record<Surface, { count: number; costUsd: number }>
  isUnattributed?: boolean
  isDeleted?: boolean
}
export interface ByModeEntry {
  mode: 'quick' | 'explore'
  totalRuns: number
  ticketsCreated: number
  totalCostUsd: number
  avgCostPerSpec: number | null
  avgDurationMs: number | null
  dominantModel: string | null
  sparkline: number[]
}

export interface SpendingResponse {
  summary: {
    totalCostUsd: number
    totalRuns: number
    failureRate: number
    prevTotalCostUsd: number
    deltaPct: number | null
    avgCostPerRun: number | null
  }
  bySurface: BySurfaceCount[]
  byModel: ByModelEntry[]
  byMode: ByModeEntry[]
  dailyTimeline: DailyEntry[]
  scatter: ScatterPoint[]
  topTickets: TopTicketEntry[]
  trackingStartedAt: string | null
  rangeFrom: string
  rangeTo: string
}

export interface InvocationRow {
  id: string
  project_id: string
  surface: Surface
  surface_ref_id: string | null
  ticket_id: number | null
  conversation_id: string | null
  model: string | null
  status: 'success' | 'failed' | 'aborted'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  duration_api_ms: number | null
  tokens_in: number | null
  tokens_out: number | null
  tokens_cache_read: number | null
  tokens_cache_create: number | null
  total_cost_usd: number | null
  num_turns: number | null
  session_id: string | null
  created_at: string
  ticket_title: string | null
}

export interface InvocationsResponse {
  rows: InvocationRow[]
  total: number
  truncated: boolean
  totalAvailable: number
}

export interface TicketSpendingSummary {
  totalCostUsd: number
  totalTurns: number
  activeDurationMs: number
  bySurface: Record<Surface, { count: number; costUsd: number }>
  totalRuns: number
}

export const SURFACE_LABEL: Record<Surface, string> = {
  job: 'Jobs',
  'quick-spec': 'Quick',
  'explore-spec': 'Explore',
  'ai-edit': 'Refine',
  smash: 'SMASH',
}

/** Surface → semantic accent token (Tailwind class name) used across the dashboard. */
export const SURFACE_ACCENT: Record<Surface, { bg: string; text: string; ring: string; dot: string }> = {
  job: {
    bg: 'bg-accent-info/15',
    text: 'text-accent-info',
    ring: 'ring-accent-info/40',
    dot: 'bg-accent-info',
  },
  'quick-spec': {
    bg: 'bg-accent-secondary/15',
    text: 'text-accent-secondary',
    ring: 'ring-accent-secondary/40',
    dot: 'bg-accent-secondary',
  },
  'explore-spec': {
    bg: 'bg-accent-highlight/15',
    text: 'text-accent-highlight',
    ring: 'ring-accent-highlight/40',
    dot: 'bg-accent-highlight',
  },
  'ai-edit': {
    bg: 'bg-accent-success/15',
    text: 'text-accent-success',
    ring: 'ring-accent-success/40',
    dot: 'bg-accent-success',
  },
  smash: {
    bg: 'bg-accent-highlight/15',
    text: 'text-accent-highlight',
    ring: 'ring-accent-highlight/40',
    dot: 'bg-accent-highlight',
  },
}
