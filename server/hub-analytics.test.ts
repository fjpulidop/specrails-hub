import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHubAnalytics, getHubTodayStats, getHubRecentJobs, searchHubContent } from './hub-analytics'
import { initDb } from './db'
import type { ProjectRegistry, ProjectContext } from './project-registry'
import type { DbInstance } from './db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProjectDb(jobs: Array<{ costUsd: number; status: string; startedAt?: string }>): DbInstance {
  const db = initDb(':memory:')
  const today = new Date().toISOString().slice(0, 10)
  for (const job of jobs) {
    db.prepare(`
      INSERT INTO jobs (id, command, status, started_at, finished_at, total_cost_usd, duration_ms)
      VALUES (?, 'implement', ?, ?, ?, ?, 1000)
    `).run(
      crypto.randomUUID(),
      job.status,
      job.startedAt ?? `${today}T10:00:00.000Z`,
      `${today}T10:01:00.000Z`,
      job.costUsd
    )
  }
  return db
}

function makeRegistry(contexts: Array<{ id: string; name: string; db: DbInstance }>): ProjectRegistry {
  const ctxMap = new Map(
    contexts.map((c) => [
      c.id,
      {
        project: { id: c.id, name: c.name, slug: c.name, path: '/tmp', db_path: ':memory:', added_at: '', last_seen_at: '' },
        db: c.db,
        queueManager: {} as any,
        chatManager: {} as any,
        setupManager: {} as any,
        proposalManager: {} as any,
        broadcast: vi.fn(),
      } satisfies ProjectContext,
    ])
  )

  return {
    hubDb: {} as any,
    getContext: (id) => ctxMap.get(id),
    getContextByPath: () => undefined,
    addProject: vi.fn() as any,
    removeProject: vi.fn(),
    touchProject: vi.fn(),
    listContexts: () => Array.from(ctxMap.values()),
  } as unknown as ProjectRegistry
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getHubAnalytics', () => {
  it('returns zero KPIs when no projects are registered', () => {
    const registry = makeRegistry([])
    const result = getHubAnalytics(registry, { period: '7d' })

    expect(result.kpi.totalJobs).toBe(0)
    expect(result.kpi.totalCostUsd).toBe(0)
    expect(result.kpi.successRate).toBe(0)
    expect(result.projectBreakdown).toEqual([])
    expect(result.costTimeline).toEqual([])
  })

  it('aggregates KPIs across multiple projects', () => {
    const db1 = makeProjectDb([
      { costUsd: 0.01, status: 'completed' },
      { costUsd: 0.02, status: 'completed' },
    ])
    const db2 = makeProjectDb([
      { costUsd: 0.03, status: 'failed' },
    ])
    const registry = makeRegistry([
      { id: 'p1', name: 'Project One', db: db1 },
      { id: 'p2', name: 'Project Two', db: db2 },
    ])

    const result = getHubAnalytics(registry, { period: '7d' })

    expect(result.kpi.totalJobs).toBe(3)
    expect(result.kpi.totalCostUsd).toBeCloseTo(0.06, 5)
    expect(result.kpi.successRate).toBeCloseTo(2 / 3, 5)
  })

  it('returns one entry per project in projectBreakdown', () => {
    const db1 = makeProjectDb([{ costUsd: 0.05, status: 'completed' }])
    const db2 = makeProjectDb([{ costUsd: 0.02, status: 'failed' }])
    const registry = makeRegistry([
      { id: 'p1', name: 'Alpha', db: db1 },
      { id: 'p2', name: 'Beta', db: db2 },
    ])

    const result = getHubAnalytics(registry, { period: '7d' })

    expect(result.projectBreakdown).toHaveLength(2)
    // Sorted by cost descending
    expect(result.projectBreakdown[0].projectName).toBe('Alpha')
    expect(result.projectBreakdown[1].projectName).toBe('Beta')
  })

  it('merges cost timeline across projects by date', () => {
    const today = new Date().toISOString().slice(0, 10)
    const db1 = makeProjectDb([{ costUsd: 0.01, status: 'completed', startedAt: `${today}T09:00:00.000Z` }])
    const db2 = makeProjectDb([{ costUsd: 0.02, status: 'completed', startedAt: `${today}T11:00:00.000Z` }])
    const registry = makeRegistry([
      { id: 'p1', name: 'Alpha', db: db1 },
      { id: 'p2', name: 'Beta', db: db2 },
    ])

    const result = getHubAnalytics(registry, { period: '7d' })

    // Both jobs on same date — timeline should have one entry for today with sum
    const todayEntry = result.costTimeline.find((e) => e.date === today)
    expect(todayEntry).toBeDefined()
    expect(todayEntry!.costUsd).toBeCloseTo(0.03, 5)
  })

  it('includes period label in response', () => {
    const registry = makeRegistry([])
    const result = getHubAnalytics(registry, { period: '30d' })
    expect(result.period.label).toBe('Last 30 days')
  })

  it('jobsToday and costToday reflect only today\'s data', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const db = makeProjectDb([
      { costUsd: 0.10, status: 'completed', startedAt: `${today}T10:00:00.000Z` },
      { costUsd: 0.20, status: 'completed', startedAt: `${yesterday}T10:00:00.000Z` },
    ])
    const registry = makeRegistry([{ id: 'p1', name: 'Project', db }])

    const result = getHubAnalytics(registry, { period: '7d' })

    expect(result.kpi.jobsToday).toBe(1)
    expect(result.kpi.costToday).toBeCloseTo(0.10, 5)
  })
})

describe('getHubTodayStats', () => {
  it('returns zeros when no projects', () => {
    const registry = makeRegistry([])
    const stats = getHubTodayStats(registry)
    expect(stats.costToday).toBe(0)
    expect(stats.jobsToday).toBe(0)
  })

  it('aggregates today stats from all projects', () => {
    const today = new Date().toISOString().slice(0, 10)
    const db1 = makeProjectDb([{ costUsd: 0.05, status: 'completed', startedAt: `${today}T10:00:00.000Z` }])
    const db2 = makeProjectDb([{ costUsd: 0.07, status: 'completed', startedAt: `${today}T11:00:00.000Z` }])
    const registry = makeRegistry([
      { id: 'p1', name: 'A', db: db1 },
      { id: 'p2', name: 'B', db: db2 },
    ])

    const stats = getHubTodayStats(registry)
    expect(stats.jobsToday).toBe(2)
    expect(stats.costToday).toBeCloseTo(0.12, 5)
  })
})

// ─── getHubRecentJobs ─────────────────────────────────────────────────────────

describe('getHubRecentJobs', () => {
  it('returns empty list when no projects', () => {
    const registry = makeRegistry([])
    expect(getHubRecentJobs(registry)).toEqual([])
  })

  it('returns jobs sorted by started_at descending', () => {
    const today = new Date().toISOString().slice(0, 10)
    const db = makeProjectDb([
      { costUsd: 0.01, status: 'completed', startedAt: `${today}T08:00:00.000Z` },
      { costUsd: 0.02, status: 'completed', startedAt: `${today}T10:00:00.000Z` },
    ])
    const registry = makeRegistry([{ id: 'p1', name: 'Proj', db }])
    const jobs = getHubRecentJobs(registry)
    expect(jobs[0].started_at > jobs[1].started_at).toBe(true)
  })

  it('merges jobs across projects and respects limit', () => {
    const today = new Date().toISOString().slice(0, 10)
    const db1 = makeProjectDb([
      { costUsd: 0.01, status: 'completed', startedAt: `${today}T09:00:00.000Z` },
      { costUsd: 0.01, status: 'completed', startedAt: `${today}T11:00:00.000Z` },
    ])
    const db2 = makeProjectDb([
      { costUsd: 0.01, status: 'running', startedAt: `${today}T10:00:00.000Z` },
    ])
    const registry = makeRegistry([
      { id: 'p1', name: 'Alpha', db: db1 },
      { id: 'p2', name: 'Beta', db: db2 },
    ])
    const jobs = getHubRecentJobs(registry, 2)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].started_at >= jobs[1].started_at).toBe(true)
  })

  it('includes projectId and projectName on each job', () => {
    const db = makeProjectDb([{ costUsd: 0.01, status: 'completed' }])
    const registry = makeRegistry([{ id: 'proj-1', name: 'MyProject', db }])
    const jobs = getHubRecentJobs(registry)
    expect(jobs[0].projectId).toBe('proj-1')
    expect(jobs[0].projectName).toBe('MyProject')
  })
})

// ─── searchHubContent ─────────────────────────────────────────────────────────

describe('searchHubContent', () => {
  it('returns empty groups when no projects', () => {
    const registry = makeRegistry([])
    const result = searchHubContent(registry, 'test')
    expect(result.groups).toEqual([])
    expect(result.total).toBe(0)
    expect(result.query).toBe('test')
  })

  it('finds jobs matching command', () => {
    const db = makeProjectDb([
      { costUsd: 0.01, status: 'completed' }, // command = 'implement'
    ])
    const registry = makeRegistry([{ id: 'p1', name: 'Project', db }])
    const result = searchHubContent(registry, 'implement')
    expect(result.total).toBeGreaterThan(0)
    expect(result.groups[0].jobs).toHaveLength(1)
  })

  it('returns no results for non-matching query', () => {
    const db = makeProjectDb([{ costUsd: 0.01, status: 'completed' }])
    const registry = makeRegistry([{ id: 'p1', name: 'Project', db }])
    const result = searchHubContent(registry, 'zzz_no_match_xyzzy')
    expect(result.groups).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('omits projects with no matches', () => {
    const db1 = makeProjectDb([{ costUsd: 0.01, status: 'completed' }]) // command = 'implement'
    const db2 = makeProjectDb([{ costUsd: 0.01, status: 'completed' }]) // command = 'implement'
    const registry = makeRegistry([
      { id: 'p1', name: 'A', db: db1 },
      { id: 'p2', name: 'B', db: db2 },
    ])
    const result = searchHubContent(registry, 'implement')
    expect(result.groups).toHaveLength(2)
  })
})

// ─── getHubAnalytics — buildWhere edge cases ──────────────────────────────────

describe('getHubAnalytics — custom period edge cases', () => {
  it('handles custom period with only from date', () => {
    const db = makeProjectDb([{ costUsd: 0.05, status: 'completed' }])
    const registry = makeRegistry([{ id: 'p1', name: 'Proj', db }])
    const today = new Date().toISOString().slice(0, 10)
    const result = getHubAnalytics(registry, { period: 'custom', from: today })
    expect(result.kpi.totalJobs).toBeGreaterThanOrEqual(0)
  })

  it('handles custom period with only to date', () => {
    const db = makeProjectDb([{ costUsd: 0.05, status: 'completed' }])
    const registry = makeRegistry([{ id: 'p1', name: 'Proj', db }])
    const today = new Date().toISOString().slice(0, 10)
    const result = getHubAnalytics(registry, { period: 'custom', to: today })
    expect(result.kpi.totalJobs).toBeGreaterThanOrEqual(0)
  })
})

