import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from './db'
import type { DbInstance } from './db'
import { getAnalytics, getTrends } from './analytics'

function insertJob(
  db: DbInstance,
  opts: {
    id: string
    command?: string
    started_at: string
    status?: string
    total_cost_usd?: number | null
    duration_ms?: number | null
    duration_api_ms?: number | null
    model?: string | null
    tokens_in?: number | null
    tokens_out?: number | null
    tokens_cache_read?: number | null
  }
) {
  db.prepare(`
    INSERT INTO jobs (id, command, started_at, status, total_cost_usd, duration_ms, duration_api_ms, model, tokens_in, tokens_out, tokens_cache_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    opts.command ?? 'test-command',
    opts.started_at,
    opts.status ?? 'completed',
    opts.total_cost_usd ?? null,
    opts.duration_ms ?? null,
    opts.duration_api_ms ?? null,
    opts.model ?? null,
    opts.tokens_in ?? null,
    opts.tokens_out ?? null,
    opts.tokens_cache_read ?? null,
  )
}

describe('getAnalytics', () => {
  let db: DbInstance

  beforeEach(() => {
    db = initDb(':memory:')
  })

  it('empty DB returns zero aggregates and empty arrays', () => {
    const result = getAnalytics(db, { period: '7d' })

    expect(result.kpi.totalJobs).toBe(0)
    expect(result.kpi.totalCostUsd).toBe(0)
    expect(result.kpi.successRate).toBe(0)
    expect(result.kpi.avgDurationMs).toBeNull()
    expect(result.statusBreakdown).toHaveLength(0)
    expect(result.tokenEfficiency).toHaveLength(0)
    expect(result.commandPerformance).toHaveLength(0)
    expect(result.durationPercentiles.p50).toBeNull()
    expect(result.durationPercentiles.p75).toBeNull()
    expect(result.durationPercentiles.p95).toBeNull()
  })

  it('single completed job populates KPI correctly', () => {
    insertJob(db, {
      id: 'job-1',
      command: 'sr:implement',
      started_at: new Date().toISOString(),
      status: 'completed',
      total_cost_usd: 0.0042,
      duration_ms: 90000,
    })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.kpi.totalJobs).toBe(1)
    expect(result.kpi.totalCostUsd).toBeCloseTo(0.0042)
    expect(result.kpi.successRate).toBe(1)
    expect(result.kpi.avgDurationMs).toBe(90000)
    // 'all' period has no deltas
    expect(result.kpi.costDelta).toBeNull()
    expect(result.kpi.jobsDelta).toBeNull()
  })

  it('fills zero-cost date gaps in costTimeline', () => {
    // Insert jobs on day 1 and day 3 (gap on day 2)
    insertJob(db, {
      id: 'job-day1',
      started_at: '2026-03-01T12:00:00.000Z',
      status: 'completed',
      total_cost_usd: 0.001,
    })
    insertJob(db, {
      id: 'job-day3',
      started_at: '2026-03-03T12:00:00.000Z',
      status: 'completed',
      total_cost_usd: 0.002,
    })

    const result = getAnalytics(db, { period: 'custom', from: '2026-03-01', to: '2026-03-03' })

    expect(result.costTimeline).toHaveLength(3)
    const dates = result.costTimeline.map((r) => r.date)
    expect(dates).toContain('2026-03-01')
    expect(dates).toContain('2026-03-02')
    expect(dates).toContain('2026-03-03')

    const day2 = result.costTimeline.find((r) => r.date === '2026-03-02')
    expect(day2?.costUsd).toBe(0)
  })

  it('computes correct deltas when previous period has higher cost', () => {
    // Previous period: 2026-02-01 to 2026-02-07 with cost 0.010
    insertJob(db, {
      id: 'prev-job',
      started_at: '2026-02-04T12:00:00.000Z',
      status: 'completed',
      total_cost_usd: 0.010,
    })
    // Current period: 2026-02-08 to 2026-02-14 with cost 0.004
    insertJob(db, {
      id: 'curr-job',
      started_at: '2026-02-11T12:00:00.000Z',
      status: 'completed',
      total_cost_usd: 0.004,
    })

    const result = getAnalytics(db, { period: 'custom', from: '2026-02-08', to: '2026-02-14' })

    // costDelta = current - previous = 0.004 - 0.010 = -0.006
    expect(result.kpi.costDelta).not.toBeNull()
    expect(result.kpi.costDelta!).toBeCloseTo(-0.006, 5)
    // jobsDelta = 1 - 1 = 0
    expect(result.kpi.jobsDelta).toBe(0)
  })

  it('treats NULL cost job as 0 in aggregations', () => {
    insertJob(db, {
      id: 'null-cost-job',
      started_at: new Date().toISOString(),
      status: 'canceled',
      total_cost_usd: null,
    })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.kpi.totalJobs).toBe(1)
    expect(result.kpi.totalCostUsd).toBe(0)
    // canceled job does not count toward success rate
    expect(result.kpi.successRate).toBe(0)
  })

  it('percentiles return correct values for multiple durations', () => {
    // Insert 10 jobs with known durations
    for (let i = 1; i <= 10; i++) {
      insertJob(db, {
        id: `job-${i}`,
        started_at: new Date().toISOString(),
        status: 'completed',
        duration_ms: i * 10000,
      })
    }

    const result = getAnalytics(db, { period: 'all' })

    expect(result.durationPercentiles.p50).not.toBeNull()
    expect(result.durationPercentiles.p75).not.toBeNull()
    expect(result.durationPercentiles.p95).not.toBeNull()
    // p50 should be around 50000ms (5th of 10)
    expect(result.durationPercentiles.p50).toBeLessThanOrEqual(60000)
    expect(result.durationPercentiles.p50).toBeGreaterThanOrEqual(40000)
  })

  it('percentiles return null for no completed jobs', () => {
    insertJob(db, {
      id: 'failed-job',
      started_at: new Date().toISOString(),
      status: 'failed',
      duration_ms: 5000,
    })

    const result = getAnalytics(db, { period: 'all' })
    expect(result.durationPercentiles.p50).toBeNull()
  })

  it('bonus metrics include costPerSuccess, apiEfficiencyPct, failureCostUsd', () => {
    insertJob(db, {
      id: 'success-1',
      started_at: new Date().toISOString(),
      status: 'completed',
      total_cost_usd: 0.01,
      duration_ms: 60000,
      duration_api_ms: 30000,
    })
    insertJob(db, {
      id: 'fail-1',
      started_at: new Date().toISOString(),
      status: 'failed',
      total_cost_usd: 0.005,
    })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.bonusMetrics.costPerSuccess).toBeCloseTo(0.015 / 1, 5) // total cost / success count
    expect(result.bonusMetrics.failureCostUsd).toBeCloseTo(0.005)
    expect(result.bonusMetrics.apiEfficiencyPct).not.toBeNull()
    expect(result.bonusMetrics.apiEfficiencyPct!).toBeCloseTo(50, 0) // 30000/60000 = 50%
  })

  it('model breakdown groups by model', () => {
    insertJob(db, {
      id: 'j1',
      started_at: new Date().toISOString(),
      status: 'completed',
      total_cost_usd: 0.01,
      model: 'claude-sonnet-4-5',
    })
    insertJob(db, {
      id: 'j2',
      started_at: new Date().toISOString(),
      status: 'completed',
      total_cost_usd: 0.02,
      model: 'claude-opus-4-6',
    })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.bonusMetrics.modelBreakdown).toHaveLength(2)
    const opus = result.bonusMetrics.modelBreakdown.find((m: any) => m.model === 'claude-opus-4-6')
    expect(opus).toBeDefined()
    expect(opus!.totalCostUsd).toBeCloseTo(0.02)
  })

  it('token efficiency aggregates by command', () => {
    insertJob(db, {
      id: 'j1',
      started_at: new Date().toISOString(),
      status: 'completed',
      command: 'implement',
      tokens_in: 1000,
      tokens_out: 500,
      tokens_cache_read: 200,
    })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.tokenEfficiency).toHaveLength(1)
    expect(result.tokenEfficiency[0].tokensOut).toBe(500)
    expect(result.tokenEfficiency[0].tokensCacheRead).toBe(200)
    expect(result.tokenEfficiency[0].totalTokens).toBe(1500) // in + out
  })

  it('command performance calculates per-command success rate', () => {
    insertJob(db, { id: 'j1', started_at: new Date().toISOString(), status: 'completed', command: 'implement', total_cost_usd: 0.01 })
    insertJob(db, { id: 'j2', started_at: new Date().toISOString(), status: 'failed', command: 'implement', total_cost_usd: 0.005 })

    const result = getAnalytics(db, { period: 'all' })

    const impl = result.commandPerformance.find((c: any) => c.command === 'implement')
    expect(impl).toBeDefined()
    expect(impl!.totalRuns).toBe(2)
    expect(impl!.successRate).toBeCloseTo(0.5)
  })

  it('daily throughput includes completed, failed, canceled counts', () => {
    const today = new Date().toISOString().slice(0, 10)
    insertJob(db, { id: 'j1', started_at: `${today}T10:00:00Z`, status: 'completed' })
    insertJob(db, { id: 'j2', started_at: `${today}T11:00:00Z`, status: 'failed' })
    insertJob(db, { id: 'j3', started_at: `${today}T12:00:00Z`, status: 'canceled' })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.dailyThroughput.length).toBeGreaterThan(0)
    const todayRow = result.dailyThroughput.find((r: any) => r.date === today)
    expect(todayRow).toBeDefined()
    expect(todayRow!.completed).toBe(1)
    expect(todayRow!.failed).toBe(1)
    expect(todayRow!.canceled).toBe(1)
  })

  it('cost per command aggregates correctly', () => {
    insertJob(db, { id: 'j1', started_at: new Date().toISOString(), status: 'completed', command: 'cmd-a', total_cost_usd: 0.01 })
    insertJob(db, { id: 'j2', started_at: new Date().toISOString(), status: 'completed', command: 'cmd-a', total_cost_usd: 0.02 })
    insertJob(db, { id: 'j3', started_at: new Date().toISOString(), status: 'completed', command: 'cmd-b', total_cost_usd: 0.005 })

    const result = getAnalytics(db, { period: 'all' })

    expect(result.costPerCommand.length).toBe(2)
    const cmdA = result.costPerCommand.find((c: any) => c.command === 'cmd-a')
    expect(cmdA!.totalCostUsd).toBeCloseTo(0.03)
    expect(cmdA!.jobCount).toBe(2)
  })

  it('status breakdown groups by status', () => {
    insertJob(db, { id: 'j1', started_at: new Date().toISOString(), status: 'completed' })
    insertJob(db, { id: 'j2', started_at: new Date().toISOString(), status: 'completed' })
    insertJob(db, { id: 'j3', started_at: new Date().toISOString(), status: 'failed' })

    const result = getAnalytics(db, { period: 'all' })

    const completed = result.statusBreakdown.find((s: any) => s.status === 'completed')
    expect(completed!.count).toBe(2)
    const failed = result.statusBreakdown.find((s: any) => s.status === 'failed')
    expect(failed!.count).toBe(1)
  })

  it('7d period returns correct label and deltas', () => {
    // Insert a job in the current 7d period
    insertJob(db, {
      id: 'recent',
      started_at: new Date().toISOString(),
      status: 'completed',
      total_cost_usd: 0.01,
    })

    const result = getAnalytics(db, { period: '7d' })

    expect(result.period.label).toBe('Last 7 days')
    expect(result.period.from).toBeTruthy()
    expect(result.period.to).toBeTruthy()
    // Deltas should be numbers (not null) because there's a previous period
    expect(result.kpi.costDelta).not.toBeNull()
  })

  it('duration histogram returns fixed bucket order', () => {
    // Insert jobs spanning multiple buckets
    insertJob(db, { id: 'j1', started_at: new Date().toISOString(), status: 'completed', duration_ms: 30000 })  // <1m
    insertJob(db, { id: 'j2', started_at: new Date().toISOString(), status: 'completed', duration_ms: 120000 }) // 1-3m
    insertJob(db, { id: 'j3', started_at: new Date().toISOString(), status: 'completed', duration_ms: 700000 }) // >10m

    const result = getAnalytics(db, { period: 'all' })

    const buckets = result.durationHistogram.map((r) => r.bucket)
    expect(buckets).toEqual(['<1m', '1-3m', '3-5m', '5-10m', '>10m'])
    expect(result.durationHistogram.find((r) => r.bucket === '<1m')?.count).toBe(1)
    expect(result.durationHistogram.find((r) => r.bucket === '1-3m')?.count).toBe(1)
    expect(result.durationHistogram.find((r) => r.bucket === '3-5m')?.count).toBe(0)
    expect(result.durationHistogram.find((r) => r.bucket === '>10m')?.count).toBe(1)
  })
})

describe('getTrends', () => {
  let db: DbInstance

  beforeEach(() => {
    db = initDb(':memory:')
  })

  it('empty DB returns zero-filled points for the period', () => {
    const result = getTrends(db, '7d')
    expect(result.period).toBe('7d')
    expect(result.points).toHaveLength(7)
    for (const pt of result.points) {
      expect(pt.jobCount).toBe(0)
      expect(pt.avgDurationMs).toBeNull()
      expect(pt.avgCostUsd).toBeNull()
      expect(pt.successRate).toBe(0)
    }
  })

  it('1d period returns exactly 1 point', () => {
    const result = getTrends(db, '1d')
    expect(result.points).toHaveLength(1)
  })

  it('30d period returns exactly 30 points', () => {
    const result = getTrends(db, '30d')
    expect(result.points).toHaveLength(30)
  })

  it('aggregates job metrics correctly for a given day', () => {
    const today = new Date().toISOString().slice(0, 10)
    insertJob(db, { id: 'j1', started_at: `${today}T10:00:00.000Z`, status: 'completed', total_cost_usd: 0.01, duration_ms: 60000, tokens_out: 500 })
    insertJob(db, { id: 'j2', started_at: `${today}T11:00:00.000Z`, status: 'failed', total_cost_usd: 0.02, duration_ms: 30000, tokens_out: 200 })

    const result = getTrends(db, '1d')
    expect(result.points).toHaveLength(1)
    const pt = result.points[0]
    expect(pt.jobCount).toBe(2)
    expect(pt.successRate).toBeCloseTo(0.5)
    expect(pt.avgCostUsd).toBeCloseTo(0.015)
  })

  it('fills zero-count gaps between days with no jobs', () => {
    // Use 7d period and only insert on today — all other days should be 0
    const today = new Date().toISOString().slice(0, 10)
    insertJob(db, { id: 'j1', started_at: `${today}T10:00:00.000Z`, status: 'completed', total_cost_usd: 0.005 })

    const result = getTrends(db, '7d')
    expect(result.points).toHaveLength(7)
    const todayPt = result.points.find((p) => p.date === today)
    expect(todayPt?.jobCount).toBe(1)
    const zeroDays = result.points.filter((p) => p.date !== today)
    for (const pt of zeroDays) {
      expect(pt.jobCount).toBe(0)
    }
  })
})
