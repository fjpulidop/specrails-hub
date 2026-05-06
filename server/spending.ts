import type { DbInstance } from './db'
import type { Surface, InvocationStatus, InvocationRow } from './ai-invocations'

export type Period = '7d' | '30d' | '90d' | 'all' | 'custom'

export interface SpendingFilters {
  period?: Period
  from?: string
  to?: string
  surface?: Surface[]
  model?: string[]
  status?: InvocationStatus
  minCostUsd?: number
  ticketId?: number
}

export interface InvocationsFilters extends SpendingFilters {
  limit?: number
  offset?: number
  cap?: number
}

export interface BySurfaceCount { surface: Surface; count: number; costUsd: number }
export interface ByModelEntry { model: string; count: number; costUsd: number }
export interface DailyEntry {
  date: string
  jobsCostUsd: number
  quickCostUsd: number
  exploreCostUsd: number
  aiEditCostUsd: number
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
  sparkline: number[] // last N days, total cost per day
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

export interface InvocationsResponse {
  rows: InvocationWithTicket[]
  total: number
  truncated: boolean
  totalAvailable: number
}

export interface InvocationWithTicket extends InvocationRow {
  ticket_title: string | null
}

const ALL_SURFACES: Surface[] = ['job', 'quick-spec', 'explore-spec', 'ai-edit']

interface ResolvedRange {
  from: string
  to: string
  prevFrom: string
  prevTo: string
}

function resolveRange(filters: SpendingFilters, now: Date = new Date()): ResolvedRange {
  const period = filters.period ?? '30d'
  if (period === 'custom' && filters.from && filters.to) {
    const fromMs = new Date(filters.from).getTime()
    const toMs = new Date(filters.to).getTime()
    const span = toMs - fromMs
    return {
      from: filters.from,
      to: filters.to,
      prevFrom: new Date(fromMs - span).toISOString(),
      prevTo: filters.from,
    }
  }
  if (period === 'all') {
    return {
      from: '1970-01-01T00:00:00Z',
      to: now.toISOString(),
      prevFrom: '1970-01-01T00:00:00Z',
      prevTo: '1970-01-01T00:00:00Z',
    }
  }
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const toMs = now.getTime()
  const fromMs = toMs - days * 86_400_000
  const prevFromMs = fromMs - days * 86_400_000
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    prevFrom: new Date(prevFromMs).toISOString(),
    prevTo: new Date(fromMs).toISOString(),
  }
}

function buildWhere(
  projectId: string,
  filters: SpendingFilters,
  range: { from: string; to: string },
  alias = ''
): { sql: string; params: unknown[] } {
  const a = alias ? `${alias}.` : ''
  const conditions: string[] = [`${a}project_id = ?`]
  const params: unknown[] = [projectId]
  conditions.push(`${a}started_at >= ?`)
  params.push(range.from)
  conditions.push(`${a}started_at <= ?`)
  params.push(range.to)
  if (filters.surface && filters.surface.length > 0) {
    const placeholders = filters.surface.map(() => '?').join(',')
    conditions.push(`${a}surface IN (${placeholders})`)
    params.push(...filters.surface)
  }
  if (filters.model && filters.model.length > 0) {
    const placeholders = filters.model.map(() => '?').join(',')
    conditions.push(`${a}model IN (${placeholders})`)
    params.push(...filters.model)
  }
  if (filters.status) {
    conditions.push(`${a}status = ?`)
    params.push(filters.status)
  }
  if (typeof filters.minCostUsd === 'number') {
    conditions.push(`${a}total_cost_usd >= ?`)
    params.push(filters.minCostUsd)
  }
  if (typeof filters.ticketId === 'number') {
    conditions.push(`${a}ticket_id = ?`)
    params.push(filters.ticketId)
  }
  return { sql: conditions.join(' AND '), params }
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function eachDay(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  const fromDay = new Date(dateOnly(fromIso) + 'T00:00:00Z').getTime()
  const toDay = new Date(dateOnly(toIso) + 'T00:00:00Z').getTime()
  for (let t = fromDay; t <= toDay; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

interface RowAggSurface { surface: Surface; cnt: number; cost: number | null }
interface RowAggModel { model: string | null; cnt: number; cost: number | null }
interface RowAggDay { day: string; surface: Surface; cost: number | null }
interface RowAggTicket {
  ticket_id: number | null
  surface: Surface
  cnt: number
  cost: number | null
}

export function getSpending(
  db: DbInstance,
  projectId: string,
  filters: SpendingFilters = {}
): SpendingResponse {
  const range = resolveRange(filters)
  const where = buildWhere(projectId, filters, { from: range.from, to: range.to })

  // summary
  const summaryRow = db.prepare(`
    SELECT
      COALESCE(SUM(total_cost_usd), 0) AS totalCost,
      COUNT(*) AS totalRuns,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      AVG(CASE WHEN status = 'success' THEN total_cost_usd END) AS avgCost
    FROM ai_invocations WHERE ${where.sql}
  `).get(...where.params) as {
    totalCost: number
    totalRuns: number
    failed: number | null
    avgCost: number | null
  }

  // prev period
  const prevWhere = buildWhere(projectId, filters, { from: range.prevFrom, to: range.prevTo })
  const prevRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost_usd), 0) AS totalCost
    FROM ai_invocations WHERE ${prevWhere.sql}
  `).get(...prevWhere.params) as { totalCost: number }

  const deltaPct = prevRow.totalCost > 0
    ? ((summaryRow.totalCost - prevRow.totalCost) / prevRow.totalCost) * 100
    : null

  // bySurface
  const surfaceRows = db.prepare(`
    SELECT surface, COUNT(*) AS cnt, COALESCE(SUM(total_cost_usd), 0) AS cost
    FROM ai_invocations WHERE ${where.sql}
    GROUP BY surface
  `).all(...where.params) as RowAggSurface[]
  const bySurface: BySurfaceCount[] = ALL_SURFACES.map((s) => {
    const row = surfaceRows.find((r) => r.surface === s)
    return { surface: s, count: row?.cnt ?? 0, costUsd: row?.cost ?? 0 }
  })

  // byModel (top 10)
  const modelRows = db.prepare(`
    SELECT model, COUNT(*) AS cnt, COALESCE(SUM(total_cost_usd), 0) AS cost
    FROM ai_invocations WHERE ${where.sql} AND model IS NOT NULL
    GROUP BY model ORDER BY cost DESC LIMIT 10
  `).all(...where.params) as RowAggModel[]
  const byModel: ByModelEntry[] = modelRows.map((r) => ({
    model: r.model ?? 'unknown',
    count: r.cnt,
    costUsd: r.cost ?? 0,
  }))

  // dailyTimeline (zero-filled, stacked by surface)
  const dayRows = db.prepare(`
    SELECT substr(started_at, 1, 10) AS day, surface, COALESCE(SUM(total_cost_usd), 0) AS cost
    FROM ai_invocations WHERE ${where.sql}
    GROUP BY day, surface
  `).all(...where.params) as RowAggDay[]
  const days = eachDay(range.from, range.to)
  const dayMap = new Map<string, DailyEntry>()
  for (const day of days) {
    dayMap.set(day, {
      date: day, jobsCostUsd: 0, quickCostUsd: 0, exploreCostUsd: 0, aiEditCostUsd: 0, totalCostUsd: 0,
    })
  }
  for (const r of dayRows) {
    const entry = dayMap.get(r.day)
    if (!entry) continue
    const c = r.cost ?? 0
    if (r.surface === 'job') entry.jobsCostUsd += c
    else if (r.surface === 'quick-spec') entry.quickCostUsd += c
    else if (r.surface === 'explore-spec') entry.exploreCostUsd += c
    else if (r.surface === 'ai-edit') entry.aiEditCostUsd += c
    entry.totalCostUsd += c
  }
  const dailyTimeline = Array.from(dayMap.values())

  // byMode (Quick vs Explore)
  const byMode: ByModeEntry[] = (['quick-spec', 'explore-spec'] as const).map((surface) => {
    const modeKey: 'quick' | 'explore' = surface === 'quick-spec' ? 'quick' : 'explore'
    const r = db.prepare(`
      SELECT
        COUNT(*) AS totalRuns,
        SUM(CASE WHEN ticket_id IS NOT NULL THEN 1 ELSE 0 END) AS ticketsCreated,
        COALESCE(SUM(total_cost_usd), 0) AS totalCost,
        AVG(CASE WHEN status = 'success' AND ticket_id IS NOT NULL THEN total_cost_usd END) AS avgCostPerSpec,
        AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avgDur
      FROM ai_invocations WHERE ${where.sql} AND surface = ?
    `).get(...where.params, surface) as {
      totalRuns: number
      ticketsCreated: number | null
      totalCost: number
      avgCostPerSpec: number | null
      avgDur: number | null
    }
    const dom = db.prepare(`
      SELECT model, COUNT(*) AS cnt FROM ai_invocations
      WHERE ${where.sql} AND surface = ? AND model IS NOT NULL
      GROUP BY model ORDER BY cnt DESC LIMIT 1
    `).get(...where.params, surface) as { model: string | null; cnt: number } | undefined
    const sparkRows = db.prepare(`
      SELECT substr(started_at, 1, 10) AS day, COALESCE(SUM(total_cost_usd), 0) AS cost
      FROM ai_invocations WHERE ${where.sql} AND surface = ?
      GROUP BY day
    `).all(...where.params, surface) as Array<{ day: string; cost: number }>
    const sparkMap = new Map(sparkRows.map((s) => [s.day, s.cost]))
    const sparkline = days.map((d) => sparkMap.get(d) ?? 0)
    return {
      mode: modeKey,
      totalRuns: r.totalRuns,
      ticketsCreated: r.ticketsCreated ?? 0,
      totalCostUsd: r.totalCost,
      avgCostPerSpec: r.avgCostPerSpec,
      avgDurationMs: r.avgDur,
      dominantModel: dom?.model ?? null,
      sparkline,
    }
  })

  // scatter (capped at 500 points to avoid heavy payloads)
  const scatterRows = db.prepare(`
    SELECT id, surface, total_cost_usd, num_turns, duration_ms, ticket_id, started_at
    FROM ai_invocations WHERE ${where.sql} AND total_cost_usd IS NOT NULL
    ORDER BY started_at DESC LIMIT 500
  `).all(...where.params) as Array<{
    id: string
    surface: Surface
    total_cost_usd: number
    num_turns: number | null
    duration_ms: number | null
    ticket_id: number | null
    started_at: string
  }>
  const scatter: ScatterPoint[] = scatterRows.map((r) => ({
    id: r.id,
    surface: r.surface,
    costUsd: r.total_cost_usd,
    numTurns: r.num_turns,
    durationMs: r.duration_ms,
    ticketId: r.ticket_id,
    startedAt: r.started_at,
  }))

  // topTickets (cross-surface aggregation)
  const ticketRows = db.prepare(`
    SELECT ticket_id, surface, COUNT(*) AS cnt, COALESCE(SUM(total_cost_usd), 0) AS cost
    FROM ai_invocations WHERE ${where.sql}
    GROUP BY ticket_id, surface
  `).all(...where.params) as RowAggTicket[]
  const ticketMap = new Map<string, TopTicketEntry>()
  for (const r of ticketRows) {
    const key = r.ticket_id === null ? '__unattributed__' : String(r.ticket_id)
    if (!ticketMap.has(key)) {
      ticketMap.set(key, {
        ticketId: r.ticket_id,
        ticketTitle: null,
        totalCostUsd: 0,
        totalRuns: 0,
        bySurface: {
          job: { count: 0, costUsd: 0 },
          'quick-spec': { count: 0, costUsd: 0 },
          'explore-spec': { count: 0, costUsd: 0 },
          'ai-edit': { count: 0, costUsd: 0 },
        },
        isUnattributed: r.ticket_id === null ? true : undefined,
      })
    }
    const entry = ticketMap.get(key)!
    entry.bySurface[r.surface].count += r.cnt
    entry.bySurface[r.surface].costUsd += r.cost ?? 0
    entry.totalRuns += r.cnt
    entry.totalCostUsd += r.cost ?? 0
  }
  const topTickets = Array.from(ticketMap.values())
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, 10)

  // tracking start (project's first invocation)
  const trackingRow = db.prepare(`
    SELECT MIN(started_at) AS first FROM ai_invocations WHERE project_id = ?
  `).get(projectId) as { first: string | null }

  return {
    summary: {
      totalCostUsd: summaryRow.totalCost,
      totalRuns: summaryRow.totalRuns,
      failureRate: summaryRow.totalRuns > 0 ? (summaryRow.failed ?? 0) / summaryRow.totalRuns : 0,
      prevTotalCostUsd: prevRow.totalCost,
      deltaPct,
      avgCostPerRun: summaryRow.avgCost,
    },
    bySurface,
    byModel,
    byMode,
    dailyTimeline,
    scatter,
    topTickets,
    trackingStartedAt: trackingRow.first,
    rangeFrom: range.from,
    rangeTo: range.to,
  }
}

export function getInvocations(
  db: DbInstance,
  projectId: string,
  filters: InvocationsFilters = {}
): InvocationsResponse {
  const range = resolveRange(filters)
  const where = buildWhere(projectId, filters, { from: range.from, to: range.to })
  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total FROM ai_invocations WHERE ${where.sql}
  `).get(...where.params) as { total: number }
  const cap = filters.cap
  const limit = cap ?? Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0
  const rows = db.prepare(`
    SELECT * FROM ai_invocations WHERE ${where.sql}
    ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(...where.params, limit, offset) as InvocationRow[]
  // (ticket_title joined client-side — tickets store is YAML, not SQLite)
  const enriched: InvocationWithTicket[] = rows.map((r) => ({ ...r, ticket_title: null }))
  return {
    rows: enriched,
    total: cap ? Math.min(rows.length, cap) : rows.length,
    truncated: cap !== undefined && totalRow.total > cap,
    totalAvailable: totalRow.total,
  }
}

export function parseSpendingFilters(query: Record<string, unknown>): SpendingFilters {
  const f: SpendingFilters = {}
  if (typeof query.period === 'string') f.period = query.period as Period
  if (typeof query.from === 'string') f.from = query.from
  if (typeof query.to === 'string') f.to = query.to
  if (typeof query.surface === 'string') {
    f.surface = query.surface.split(',').filter((s) =>
      ['job', 'quick-spec', 'explore-spec', 'ai-edit'].includes(s)
    ) as Surface[]
  }
  if (typeof query.model === 'string') {
    f.model = query.model.split(',').filter((s) => s.length > 0)
  }
  if (typeof query.status === 'string' && ['success', 'failed', 'aborted'].includes(query.status)) {
    f.status = query.status as InvocationStatus
  }
  if (typeof query.minCostUsd === 'string') {
    const v = parseFloat(query.minCostUsd)
    if (!Number.isNaN(v)) f.minCostUsd = v
  }
  if (typeof query.ticketId === 'string') {
    const v = parseInt(query.ticketId, 10)
    if (!Number.isNaN(v)) f.ticketId = v
  }
  return f
}
