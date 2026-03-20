import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { DbInstance } from './db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

export interface CoverageInfo {
  pct: number | null
  lines: number | null
  statements: number | null
  functions: number | null
  branches: number | null
  source: string | null
}

export interface PipelineStatus {
  lastJobId: string | null
  lastJobStatus: string | null
  lastJobCommand: string | null
  lastJobAt: string | null
}

export interface HealthFactors {
  hasCoverage: boolean
  coverageGood: boolean
  pipelineHealthy: boolean
  hasRecentActivity: boolean
}

export interface ProjectMetrics {
  coverage: CoverageInfo
  healthScore: number
  healthFactors: HealthFactors
  recentCommits: GitCommit[]
  pipeline: PipelineStatus
}

// ─── Coverage reader ──────────────────────────────────────────────────────────

interface CoverageSummaryTotal {
  lines?: { pct: number }
  statements?: { pct: number }
  functions?: { pct: number }
  branches?: { pct: number }
}

function readCoverage(projectPath: string): CoverageInfo {
  const candidatePaths = [
    path.join(projectPath, 'coverage', 'coverage-summary.json'),
    path.join(projectPath, 'coverage', 'coverage-final.json'),
  ]

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, CoverageSummaryTotal>
      const total = raw['total']
      if (total) {
        return {
          pct: total.lines?.pct ?? null,
          lines: total.lines?.pct ?? null,
          statements: total.statements?.pct ?? null,
          functions: total.functions?.pct ?? null,
          branches: total.branches?.pct ?? null,
          source: path.relative(projectPath, filePath),
        }
      }
    } catch { /* malformed file — try next */ }
  }

  return { pct: null, lines: null, statements: null, functions: null, branches: null, source: null }
}

// ─── Git activity ─────────────────────────────────────────────────────────────

function getGitCommits(projectPath: string, limit = 10): GitCommit[] {
  try {
    const out = execSync(
      `git log --pretty=format:"%H|%s|%an|%ai" -${limit}`,
      { cwd: projectPath, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim()
    if (!out) return []
    return out.split('\n').map((line) => {
      const parts = line.split('|')
      return {
        hash: (parts[0] ?? '').slice(0, 7),
        message: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
      }
    })
  } catch {
    return []
  }
}

// ─── Pipeline status ──────────────────────────────────────────────────────────

function getPipelineStatus(db: DbInstance): PipelineStatus {
  const row = db.prepare(
    `SELECT id, status, command, finished_at
     FROM jobs
     WHERE status IN ('completed', 'failed', 'canceled', 'zombie_terminated')
     ORDER BY finished_at DESC
     LIMIT 1`
  ).get() as { id: string; status: string; command: string; finished_at: string } | undefined

  if (!row) {
    return { lastJobId: null, lastJobStatus: null, lastJobCommand: null, lastJobAt: null }
  }
  return {
    lastJobId: row.id,
    lastJobStatus: row.status,
    lastJobCommand: row.command,
    lastJobAt: row.finished_at,
  }
}

// ─── Health score computation ─────────────────────────────────────────────────

function computeHealthScore(
  coverage: CoverageInfo,
  pipeline: PipelineStatus,
  commits: GitCommit[]
): { score: number; factors: HealthFactors } {
  const hasCoverage = coverage.pct !== null
  const coverageGood = hasCoverage && (coverage.pct ?? 0) >= 70
  const pipelineHealthy = pipeline.lastJobStatus === 'completed'

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const hasRecentActivity = commits.some((c) => new Date(c.date) > sevenDaysAgo)

  // Weighted score: pipeline 35pts, coverage pass 25pts, recent activity 25pts, any coverage 15pts
  let score = 0
  if (hasCoverage) score += 15
  if (coverageGood) score += 25
  if (pipelineHealthy) score += 35
  if (hasRecentActivity) score += 25

  return {
    score: Math.min(100, score),
    factors: { hasCoverage, coverageGood, pipelineHealthy, hasRecentActivity },
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getProjectMetrics(projectPath: string, db: DbInstance): ProjectMetrics {
  const coverage = readCoverage(projectPath)
  const recentCommits = getGitCommits(projectPath, 10)
  const pipeline = getPipelineStatus(db)
  const { score, factors } = computeHealthScore(coverage, pipeline, recentCommits)

  return {
    coverage,
    healthScore: score,
    healthFactors: factors,
    recentCommits,
    pipeline,
  }
}
