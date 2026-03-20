import fs from 'fs'
import path from 'path'
import type { ProjectRegistry } from './project-registry'
import type { AnalyticsOpts } from './types'
import type { DbInstance } from './db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HubProjectStats {
  projectId: string
  projectName: string
  totalCostUsd: number
  totalJobs: number
  successRate: number
  avgDurationMs: number | null
}

export interface HubAnalyticsResponse {
  period: {
    label: string
    from: string | null
    to: string | null
  }
  kpi: {
    totalCostUsd: number
    totalJobs: number
    successRate: number
    costToday: number
    jobsToday: number
  }
  projectBreakdown: HubProjectStats[]
  costTimeline: Array<{ date: string; costUsd: number }>
}

// ─── Period resolution ────────────────────────────────────────────────────────

interface DateBounds {
  from: string | null
  to: string | null
}

function resolveBounds(opts: AnalyticsOpts): { current: DateBounds; label: string } {
  const now = new Date()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)

  if (opts.period === 'all') {
    return { current: { from: null, to: null }, label: 'All time' }
  }
  if (opts.period === 'custom') {
    return {
      current: { from: opts.from!, to: opts.to! },
      label: `${opts.from} to ${opts.to}`,
    }
  }

  const days = opts.period === '7d' ? 7 : opts.period === '30d' ? 30 : 90
  const from = toISO(new Date(now.getTime() - days * 86400000))
  const to = toISO(now)
  const label = opts.period === '7d' ? 'Last 7 days'
    : opts.period === '30d' ? 'Last 30 days'
    : 'Last 90 days'

  return { current: { from, to }, label }
}

function buildWhere(bounds: DateBounds): { clause: string; params: unknown[] } {
  if (!bounds.from && !bounds.to) return { clause: '', params: [] }
  if (bounds.from && bounds.to) {
    const nextDay = new Date(new Date(bounds.to).getTime() + 86400000).toISOString().slice(0, 10)
    return { clause: 'WHERE started_at >= ? AND started_at < ?', params: [bounds.from, nextDay] }
  }
  if (bounds.from) return { clause: 'WHERE started_at >= ?', params: [bounds.from] }
  const nextDay = new Date(new Date(bounds.to!).getTime() + 86400000).toISOString().slice(0, 10)
  return { clause: 'WHERE started_at < ?', params: [nextDay] }
}

// ─── Per-project query ────────────────────────────────────────────────────────

interface ProjectKpi {
  totalCostUsd: number
  totalJobs: number
  successCount: number
  avgDurationMs: number | null
}

function queryProjectKpi(db: DbInstance, clause: string, params: unknown[]): ProjectKpi {
  return db.prepare(`
    SELECT
      COALESCE(SUM(total_cost_usd), 0) as totalCostUsd,
      COUNT(*) as totalJobs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successCount,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avgDurationMs
    FROM jobs ${clause}
  `).get(...params) as ProjectKpi
}

interface TimelineRow {
  date: string
  costUsd: number
}

function queryProjectTimeline(db: DbInstance, clause: string, params: unknown[]): TimelineRow[] {
  return db.prepare(`
    SELECT
      strftime('%Y-%m-%d', started_at) as date,
      COALESCE(SUM(total_cost_usd), 0) as costUsd
    FROM jobs ${clause}
    GROUP BY date
    ORDER BY date ASC
  `).all(...params) as TimelineRow[]
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function getHubAnalytics(
  registry: ProjectRegistry,
  opts: AnalyticsOpts
): HubAnalyticsResponse {
  const { current, label } = resolveBounds(opts)
  const { clause, params } = buildWhere(current)

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const todayClause = 'WHERE started_at >= ? AND started_at < ?'
  const todayParams = [today, tomorrow]

  const contexts = registry.listContexts()

  let totalCostUsd = 0
  let totalJobs = 0
  let totalSuccess = 0
  let costToday = 0
  let jobsToday = 0

  const projectBreakdown: HubProjectStats[] = []
  const timelineMap = new Map<string, number>()

  // Iterate sequentially to avoid SQLite contention
  for (const ctx of contexts) {
    const kpi = queryProjectKpi(ctx.db, clause, params)
    const todayKpi = queryProjectKpi(ctx.db, todayClause, todayParams)
    const timeline = queryProjectTimeline(ctx.db, clause, params)

    totalCostUsd += kpi.totalCostUsd
    totalJobs += kpi.totalJobs
    totalSuccess += kpi.successCount
    costToday += todayKpi.totalCostUsd
    jobsToday += todayKpi.totalJobs

    projectBreakdown.push({
      projectId: ctx.project.id,
      projectName: ctx.project.name,
      totalCostUsd: kpi.totalCostUsd,
      totalJobs: kpi.totalJobs,
      successRate: kpi.totalJobs > 0 ? kpi.successCount / kpi.totalJobs : 0,
      avgDurationMs: kpi.avgDurationMs,
    })

    for (const row of timeline) {
      timelineMap.set(row.date, (timelineMap.get(row.date) ?? 0) + row.costUsd)
    }
  }

  // Build sorted cost timeline
  const costTimeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, costUsd]) => ({ date, costUsd }))

  // Sort projects by cost descending
  projectBreakdown.sort((a, b) => b.totalCostUsd - a.totalCostUsd)

  return {
    period: { label, from: current.from, to: current.to },
    kpi: {
      totalCostUsd,
      totalJobs,
      successRate: totalJobs > 0 ? totalSuccess / totalJobs : 0,
      costToday,
      jobsToday,
    },
    projectBreakdown,
    costTimeline,
  }
}

// ─── Recent jobs across all projects ─────────────────────────────────────────

export interface HubRecentJob {
  id: string
  command: string
  started_at: string
  finished_at: string | null
  status: string
  total_cost_usd: number | null
  projectId: string
  projectName: string
}

export function getHubRecentJobs(registry: ProjectRegistry, limit = 10): HubRecentJob[] {
  const all: HubRecentJob[] = []

  for (const ctx of registry.listContexts()) {
    const rows = ctx.db.prepare(`
      SELECT id, command, started_at, finished_at, status, total_cost_usd
      FROM jobs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string
      command: string
      started_at: string
      finished_at: string | null
      status: string
      total_cost_usd: number | null
    }>

    for (const row of rows) {
      all.push({ ...row, projectId: ctx.project.id, projectName: ctx.project.name })
    }
  }

  return all
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit)
}

// ─── Cross-project search ─────────────────────────────────────────────────────

export interface HubSearchResultGroup {
  projectId: string
  projectName: string
  jobs: Array<{ id: string; command: string; started_at: string; status: string }>
  proposals: Array<{ id: string; idea: string; status: string; created_at: string }>
  messages: Array<{ id: number; content: string; role: string; created_at: string }>
}

export interface HubSearchResponse {
  query: string
  groups: HubSearchResultGroup[]
  total: number
}

export function searchHubContent(registry: ProjectRegistry, query: string): HubSearchResponse {
  const term = `%${query}%`
  const groups: HubSearchResultGroup[] = []
  let total = 0

  for (const ctx of registry.listContexts()) {
    const jobs = ctx.db.prepare(`
      SELECT id, command, started_at, status
      FROM jobs
      WHERE command LIKE ?
      ORDER BY started_at DESC
      LIMIT 5
    `).all(term) as Array<{ id: string; command: string; started_at: string; status: string }>

    const proposals = ctx.db.prepare(`
      SELECT id, idea, status, created_at
      FROM proposals
      WHERE idea LIKE ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(term) as Array<{ id: string; idea: string; status: string; created_at: string }>

    const messages = ctx.db.prepare(`
      SELECT id, content, role, created_at
      FROM chat_messages
      WHERE content LIKE ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(term) as Array<{ id: number; content: string; role: string; created_at: string }>

    if (jobs.length > 0 || proposals.length > 0 || messages.length > 0) {
      groups.push({
        projectId: ctx.project.id,
        projectName: ctx.project.name,
        jobs,
        proposals,
        messages,
      })
      total += jobs.length + proposals.length + messages.length
    }
  }

  return { query, groups, total }
}

// ─── Quick today stats (for /api/hub/state) ────────────────────────────────────

export interface HubTodayStats {
  costToday: number
  jobsToday: number
}

// ─── Hub projects overview ────────────────────────────────────────────────────

export interface HubProjectOverview {
  projectId: string
  projectName: string
  healthScore: number
  activeJobs: number
  jobsToday: number
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunCommand: string | null
  coveragePct: number | null
}

export interface HubOverviewResponse {
  projects: HubProjectOverview[]
  aggregated: {
    totalCount: number
    healthyCount: number
    warningCount: number
    criticalCount: number
    jobsToday: number
    activeJobs: number
  }
  recentJobs: HubRecentJob[]
}

function readCoveragePct(projectPath: string): number | null {
  const candidates = [
    path.join(projectPath, 'coverage', 'coverage-summary.json'),
    path.join(projectPath, 'coverage', 'coverage-final.json'),
  ]
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, { lines?: { pct: number } }>
      return raw['total']?.lines?.pct ?? null
    } catch { /* try next */ }
  }
  return null
}

function computeProjectHealthScore(
  coveragePct: number | null,
  lastJobStatus: string | null,
  hasRecentJob: boolean
): number {
  let score = 0
  if (coveragePct !== null) score += 15
  if (coveragePct !== null && coveragePct >= 70) score += 25
  if (lastJobStatus === 'completed') score += 40
  if (hasRecentJob) score += 20
  return Math.min(100, score)
}

function getProjectOverview(
  projectId: string,
  projectName: string,
  projectPath: string,
  db: DbInstance
): HubProjectOverview {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const activeRow = db.prepare(
    `SELECT COUNT(*) as count FROM jobs WHERE status IN ('running', 'queued')`
  ).get() as { count: number }

  const todayRow = db.prepare(
    `SELECT COUNT(*) as count FROM jobs WHERE started_at >= ? AND started_at < ?`
  ).get(today, tomorrow) as { count: number }

  const lastJobRow = db.prepare(
    `SELECT status, command, finished_at FROM jobs
     WHERE status IN ('completed','failed','canceled','zombie_terminated')
     ORDER BY finished_at DESC LIMIT 1`
  ).get() as { status: string; command: string; finished_at: string } | undefined

  const recentJobRow = db.prepare(
    `SELECT id FROM jobs WHERE started_at >= ? LIMIT 1`
  ).get(sevenDaysAgo) as { id: string } | undefined

  const coveragePct = readCoveragePct(projectPath)
  const healthScore = computeProjectHealthScore(
    coveragePct,
    lastJobRow?.status ?? null,
    !!recentJobRow
  )

  return {
    projectId,
    projectName,
    healthScore,
    activeJobs: activeRow.count,
    jobsToday: todayRow.count,
    lastRunAt: lastJobRow?.finished_at ?? null,
    lastRunStatus: lastJobRow?.status ?? null,
    lastRunCommand: lastJobRow?.command ?? null,
    coveragePct,
  }
}

export function getHubOverview(registry: ProjectRegistry, recentLimit = 15): HubOverviewResponse {
  const projects: HubProjectOverview[] = []
  let totalActiveJobs = 0
  let totalJobsToday = 0

  for (const ctx of registry.listContexts()) {
    const overview = getProjectOverview(
      ctx.project.id,
      ctx.project.name,
      ctx.project.path,
      ctx.db
    )
    projects.push(overview)
    totalActiveJobs += overview.activeJobs
    totalJobsToday += overview.jobsToday
  }

  const healthyCount = projects.filter((p) => p.healthScore >= 60).length
  const warningCount = projects.filter((p) => p.healthScore >= 30 && p.healthScore < 60).length
  const criticalCount = projects.filter((p) => p.healthScore < 30).length

  // Sort by most active/problematic first
  projects.sort((a, b) => {
    // Active jobs first
    if (b.activeJobs !== a.activeJobs) return b.activeJobs - a.activeJobs
    // Then by health score ascending (most problematic first)
    return a.healthScore - b.healthScore
  })

  return {
    projects,
    aggregated: {
      totalCount: projects.length,
      healthyCount,
      warningCount,
      criticalCount,
      jobsToday: totalJobsToday,
      activeJobs: totalActiveJobs,
    },
    recentJobs: getHubRecentJobs(registry, recentLimit),
  }
}

export function getHubTodayStats(registry: ProjectRegistry): HubTodayStats {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const clause = 'WHERE started_at >= ? AND started_at < ?'
  const params = [today, tomorrow]

  let costToday = 0
  let jobsToday = 0

  for (const ctx of registry.listContexts()) {
    const row = ctx.db.prepare(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) as costToday,
        COUNT(*) as jobsToday
      FROM jobs ${clause}
    `).get(...params) as { costToday: number; jobsToday: number }
    costToday += row.costToday
    jobsToday += row.jobsToday
  }

  return { costToday, jobsToday }
}
