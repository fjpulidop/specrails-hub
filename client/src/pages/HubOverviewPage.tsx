import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Activity, Layers, CheckCircle, AlertTriangle, XCircle, Clock, X, Zap, HeartPulse, DollarSign } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { HubOverviewResponse, HubProjectOverview, HubRecentJob, HubSearchResponse, HubHealthResponse } from '../types'
import { STATUS_COLORS } from '../lib/dracula-colors'
import { useHub } from '../hooks/useHub'
import ProjectHealthGrid from '../components/ProjectHealthGrid'

// ─── Aggregated Stats Bar ─────────────────────────────────────────────────────

function AggregatedStats({ data }: { data: HubOverviewResponse['aggregated'] }) {
  const cards = [
    {
      icon: <Layers className="w-4 h-4" />,
      label: 'Projects',
      value: data.totalCount.toString(),
    },
    {
      icon: <Zap className="w-4 h-4 text-[#f1fa8c]" />,
      label: 'Active Jobs',
      value: data.activeJobs.toString(),
    },
    {
      icon: <Activity className="w-4 h-4" />,
      label: 'Jobs Today',
      value: data.jobsToday.toString(),
    },
    {
      icon: <CheckCircle className="w-4 h-4 text-[#50fa7b]" />,
      label: 'Healthy',
      value: data.healthyCount.toString(),
      sub: `${data.warningCount} warning · ${data.criticalCount} critical`,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            {card.icon}
            <p className="text-xs">{card.label}</p>
          </div>
          <p className="text-xl font-semibold font-mono">{card.value}</p>
          {card.sub && <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ─── Budget Status Card ───────────────────────────────────────────────────────

function BudgetStatusCard({ costToday, budget }: { costToday: number; budget: number | null }) {
  if (budget == null) return null

  const pct = Math.min((costToday / budget) * 100, 100)
  const color = pct >= 90 ? '#ff5555' : pct >= 60 ? '#f1fa8c' : '#50fa7b'

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign className="w-4 h-4" />
          <p className="text-xs">Daily Budget</p>
        </div>
        <p className="text-xs font-mono text-muted-foreground">{pct.toFixed(0)}%</p>
      </div>
      <p className="text-xl font-semibold font-mono">
        ${costToday.toFixed(2)}{' '}
        <span className="text-sm text-muted-foreground">/ ${budget.toFixed(2)}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-border/30 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ─── Health indicator ─────────────────────────────────────────────────────────

function HealthBadge({ score }: { score: number }) {
  if (score >= 60) {
    return (
      <span className="flex items-center gap-1 text-[#50fa7b] text-xs font-medium">
        <CheckCircle className="w-3 h-3" />
        {score}
      </span>
    )
  }
  if (score >= 30) {
    return (
      <span className="flex items-center gap-1 text-[#f1fa8c] text-xs font-medium">
        <AlertTriangle className="w-3 h-3" />
        {score}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[#ff5555] text-xs font-medium">
      <XCircle className="w-3 h-3" />
      {score}
    </span>
  )
}

function statusDot(status: string) {
  const color = STATUS_COLORS[status] ?? 'hsl(225 27% 51%)'
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

// ─── Project Cards Grid ───────────────────────────────────────────────────────

function ProjectCard({ project, onSwitch }: { project: HubProjectOverview; onSwitch: () => void }) {
  const healthColor = project.healthScore >= 60
    ? 'border-l-[#50fa7b]/60'
    : project.healthScore >= 30
      ? 'border-l-[#f1fa8c]/60'
      : 'border-l-[#ff5555]/60'

  return (
    <button
      type="button"
      onClick={onSwitch}
      className={`w-full text-left rounded-lg border border-border/40 border-l-2 ${healthColor} bg-card/50 p-4 hover:bg-card/80 transition-colors group`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium truncate group-hover:text-foreground transition-colors">
          {project.projectName}
        </p>
        <HealthBadge score={project.healthScore} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 flex-shrink-0" />
          <span>{project.activeJobs > 0 ? (
            <span className="text-[#f1fa8c]">{project.activeJobs} running</span>
          ) : (
            'idle'
          )}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 flex-shrink-0" />
          <span>{project.jobsToday} today</span>
        </div>
        {project.coveragePct !== null && (
          <div className="flex items-center gap-1.5 col-span-2">
            <span className="text-muted-foreground/60">cov</span>
            <div className="flex-1 h-1 rounded-full bg-border/30 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, project.coveragePct)}%`,
                  backgroundColor: project.coveragePct >= 70 ? '#50fa7b' : project.coveragePct >= 50 ? '#f1fa8c' : '#ff5555',
                }}
              />
            </div>
            <span className="font-mono text-foreground/70">{project.coveragePct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {project.lastRunAt && (
        <div className="mt-3 pt-2.5 border-t border-border/20 flex items-center gap-1.5 text-xs text-muted-foreground">
          {project.lastRunStatus && statusDot(project.lastRunStatus)}
          <span className="truncate font-mono text-[10px]">{project.lastRunCommand}</span>
          <span className="flex-shrink-0 flex items-center gap-0.5 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo(project.lastRunAt)}
          </span>
        </div>
      )}
    </button>
  )
}

function ProjectsGrid({
  projects,
  onSwitchProject,
}: {
  projects: HubProjectOverview[]
  onSwitchProject: (projectId: string) => void
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-6 text-center">
        <p className="text-xs text-muted-foreground">No projects registered yet.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {projects.map((p) => (
        <ProjectCard key={p.projectId} project={p} onSwitch={() => onSwitchProject(p.projectId)} />
      ))}
    </div>
  )
}

// ─── Recent Activity Feed ─────────────────────────────────────────────────────

function RecentActivity({ jobs }: { jobs: HubRecentJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
        <p className="text-xs text-muted-foreground py-4 text-center">No jobs yet across any project.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={`${job.projectId}-${job.id}`} className="flex items-center gap-2 text-xs">
            {statusDot(job.status)}
            <span className="text-muted-foreground flex-shrink-0 max-w-[80px] truncate" title={job.projectName}>
              {job.projectName}
            </span>
            <span className="flex-1 truncate font-mono text-foreground/80" title={job.command}>
              {job.command}
            </span>
            <span className="text-muted-foreground flex-shrink-0">
              {timeAgo(job.started_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cross-project Search ─────────────────────────────────────────────────────

function SearchResults({ results, onClear }: { results: HubSearchResponse; onClear: () => void }) {
  if (results.total === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">No results for "{results.query}"</p>
          <button
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {results.total} result{results.total !== 1 ? 's' : ''} for "{results.query}"
        </p>
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {results.groups.map((group) => (
        <div key={group.projectId} className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">{group.projectName}</p>

          {group.jobs.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Jobs</p>
              <div className="space-y-1">
                {group.jobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2 text-xs">
                    {statusDot(job.status)}
                    <span className="font-mono truncate text-foreground/80">{job.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {group.proposals.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Proposals</p>
              <div className="space-y-1">
                {group.proposals.map((p) => (
                  <div key={p.id} className="text-xs truncate text-foreground/80">
                    {p.idea}
                  </div>
                ))}
              </div>
            </div>
          )}

          {group.messages.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Chat messages</p>
              <div className="space-y-1">
                {group.messages.map((m) => (
                  <div key={m.id} className="text-xs truncate text-foreground/60 italic">
                    "{m.content.slice(0, 100)}{m.content.length > 100 ? '…' : ''}"
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HubOverviewPage() {
  const { projects, setActiveProjectId } = useHub()
  const [overview, setOverview] = useState<HubOverviewResponse | null>(null)
  const [health, setHealth] = useState<HubHealthResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<HubSearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewRes, healthRes] = await Promise.all([
        fetch('/api/hub/overview'),
        fetch('/api/hub/health'),
      ])
      if (overviewRes.ok) {
        setOverview(await overviewRes.json() as HubOverviewResponse)
      }
      if (healthRes.ok) {
        setHealth(await healthRes.json() as HubHealthResponse)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults(null)
      return
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/hub/search?q=${encodeURIComponent(searchQuery.trim())}`)
        if (res.ok) {
          setSearchResults(await res.json() as HubSearchResponse)
        }
      } finally {
        setSearching(false)
      }
    }, 350)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery])

  function handleClearSearch() {
    setSearchQuery('')
    setSearchResults(null)
  }

  function handleSwitchProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setActiveProjectId(projectId)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Hub Overview</h1>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search across all projects: jobs, proposals, chat…"
            className="w-full h-9 pl-8 pr-4 rounded-lg border border-border/60 bg-card/50 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-current border-t-transparent rounded-full animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Search results or main content */}
        {searchResults ? (
          <SearchResults results={searchResults} onClear={handleClearSearch} />
        ) : (
          <>
            {/* Aggregated stats skeleton */}
            {loading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[76px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
                ))}
              </div>
            )}
            {!loading && overview && <AggregatedStats data={overview.aggregated} />}
            {!loading && overview && (
              <BudgetStatusCard
                costToday={overview.aggregated.costToday}
                budget={overview.aggregated.hubDailyBudgetUsd}
              />
            )}

            {/* Project cards skeleton */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: Math.max(2, projects.length) }).map((_, i) => (
                  <div key={i} className="h-[120px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
                ))}
              </div>
            )}
            {!loading && overview && (
              <ProjectsGrid
                projects={overview.projects}
                onSwitchProject={handleSwitchProject}
              />
            )}

            {/* Project Health Grid */}
            {!loading && health && health.projects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <HeartPulse className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Project Health</h2>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {health.aggregated.greenCount} healthy · {health.aggregated.yellowCount} warning · {health.aggregated.redCount} critical
                  </span>
                </div>
                <ProjectHealthGrid
                  projects={health.projects}
                  onSelectProject={handleSwitchProject}
                />
              </div>
            )}
            {loading && (
              <div className="h-[120px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
            )}

            {/* Recent activity skeleton */}
            {loading && (
              <div className="h-[180px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
            )}
            {!loading && overview && <RecentActivity jobs={overview.recentJobs} />}
          </>
        )}
      </div>
    </div>
  )
}
