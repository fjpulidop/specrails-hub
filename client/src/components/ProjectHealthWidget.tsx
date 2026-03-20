import { useEffect } from 'react'
import { GitCommit, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'
import { useProjectCache } from '../hooks/useProjectCache'
import { useHub } from '../hooks/useHub'
import { getApiBase } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoverageInfo {
  pct: number | null
  lines: number | null
  statements: number | null
  functions: number | null
  branches: number | null
  source: string | null
}

interface HealthFactors {
  hasCoverage: boolean
  coverageGood: boolean
  pipelineHealthy: boolean
  hasRecentActivity: boolean
}

interface ProjectMetrics {
  coverage: CoverageInfo
  healthScore: number
  healthFactors: HealthFactors
  recentCommits: Array<{ hash: string; message: string; author: string; date: string }>
  pipeline: {
    lastJobId: string | null
    lastJobStatus: string | null
    lastJobCommand: string | null
    lastJobAt: string | null
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#50fa7b' : score >= 50 ? '#f1fa8c' : '#ff5555'
  const data = [{ name: 'score', value: score, fill: color }]

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="90%"
            startAngle={90}
            endAngle={-270}
            data={data}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Tooltip
              content={() => null}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold font-mono" style={{ color }}>{score}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">health</span>
        </div>
      </div>
    </div>
  )
}

function CoverageBar({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted/30" />
        <span className="text-xs text-muted-foreground font-mono w-10 text-right">n/a</span>
      </div>
    )
  }
  const color = pct >= 80 ? 'bg-[#50fa7b]' : pct >= 60 ? 'bg-[#f1fa8c]' : 'bg-[#ff5555]'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-foreground/80 w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

function FactorRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok
        ? <CheckCircle2 className="w-3 h-3 text-[#50fa7b] flex-shrink-0" />
        : <XCircle className="w-3 h-3 text-[#ff5555]/70 flex-shrink-0" />
      }
      <span className={`text-xs ${ok ? 'text-foreground/70' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  )
}

function PipelineStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">No jobs yet</span>
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Completed', cls: 'text-[#50fa7b]' },
    failed: { icon: <XCircle className="w-3 h-3" />, label: 'Failed', cls: 'text-[#ff5555]' },
    canceled: { icon: <AlertCircle className="w-3 h-3" />, label: 'Canceled', cls: 'text-[#f1fa8c]' },
  }
  const entry = map[status] ?? { icon: <Clock className="w-3 h-3" />, label: status, cls: 'text-muted-foreground' }
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${entry.cls}`}>
      {entry.icon}
      {entry.label}
    </span>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function ProjectHealthWidget() {
  const { activeProjectId } = useHub()

  const { data: metrics, isFirstLoad } = useProjectCache<ProjectMetrics | null>({
    namespace: 'metrics',
    projectId: activeProjectId,
    initialValue: null,
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/metrics`)
      if (!res.ok) return null
      return res.json() as Promise<ProjectMetrics>
    },
    pollInterval: 60_000,
  })

  // Re-fetch when projectId changes
  useEffect(() => { /* handled by useProjectCache via projectId dep */ }, [activeProjectId])

  if (isFirstLoad) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/30 p-4 animate-pulse h-32" />
    )
  }

  if (!metrics) return null

  const { coverage, healthScore, healthFactors, recentCommits, pipeline } = metrics

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/20">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Project Health
        </h2>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Health score + factors */}
        <div className="flex items-start gap-4">
          <HealthScoreGauge score={healthScore} />
          <div className="flex flex-col gap-1 pt-1">
            <FactorRow ok={healthFactors.hasCoverage} label="Coverage available" />
            <FactorRow ok={healthFactors.coverageGood} label="Coverage ≥ 70%" />
            <FactorRow ok={healthFactors.pipelineHealthy} label="Last pipeline green" />
            <FactorRow ok={healthFactors.hasRecentActivity} label="Active this week" />
          </div>
        </div>

        {/* Coverage + pipeline */}
        <div className="flex flex-col gap-3 justify-center">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-16">Lines</span>
                <CoverageBar pct={coverage.lines} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-16">Functions</span>
                <CoverageBar pct={coverage.functions} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-16">Branches</span>
                <CoverageBar pct={coverage.branches} />
              </div>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last pipeline</span>
            <div className="flex items-center gap-2 mt-1">
              <PipelineStatusBadge status={pipeline.lastJobStatus} />
              {pipeline.lastJobAt && (
                <span className="text-[10px] text-muted-foreground">{timeAgo(pipeline.lastJobAt)}</span>
              )}
            </div>
            {pipeline.lastJobCommand && (
              <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                {pipeline.lastJobCommand}
              </p>
            )}
          </div>
        </div>

        {/* Recent commits */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <GitCommit className="w-3 h-3" />
            Recent commits
          </span>
          {recentCommits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No git history found</p>
          ) : (
            <ul className="space-y-1.5">
              {recentCommits.slice(0, 5).map((commit) => (
                <li key={commit.hash} className="flex items-start gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 flex-shrink-0">
                    {commit.hash}
                  </span>
                  <span className="text-[11px] text-foreground/70 leading-tight line-clamp-1">
                    {commit.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
