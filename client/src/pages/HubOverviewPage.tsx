import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Activity, Layers, DollarSign, CheckCircle, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { HubAnalyticsResponse, HubRecentJob, HubSearchResponse } from '../types'
import { STATUS_COLORS } from '../lib/dracula-colors'
import { useHub } from '../hooks/useHub'

// ─── Global Stats ─────────────────────────────────────────────────────────────

interface OverviewStats {
  projectCount: number
  totalJobs: number
  totalCostUsd: number
  activeJobs: number
  successRate: number
}

function StatsGrid({ stats }: { stats: OverviewStats }) {
  const cards = [
    {
      icon: <Layers className="w-4 h-4" />,
      label: 'Projects',
      value: stats.projectCount.toString(),
    },
    {
      icon: <Activity className="w-4 h-4" />,
      label: 'Total Jobs',
      value: stats.totalJobs.toLocaleString(),
      sub: `${stats.activeJobs} active`,
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'Total Cost',
      value: `$${stats.totalCostUsd.toFixed(4)}`,
    },
    {
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Success Rate',
      value: `${(stats.successRate * 100).toFixed(1)}%`,
      sub: 'all time',
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

// ─── Recent Activity ──────────────────────────────────────────────────────────

function statusDot(status: string) {
  const color = STATUS_COLORS[status] ?? 'hsl(225 27% 51%)'
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

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
              {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
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
  const { projects } = useHub()
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<HubRecentJob[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<HubSearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [analyticsRes, recentRes] = await Promise.all([
        fetch('/api/hub/analytics?period=all'),
        fetch('/api/hub/recent-jobs?limit=10'),
      ])

      if (analyticsRes.ok) {
        const analytics = await analyticsRes.json() as HubAnalyticsResponse
        // Compute activeJobs from recentJobs data
        const recentData = recentRes.ok ? (await recentRes.json() as { jobs: HubRecentJob[] }) : { jobs: [] }
        const activeJobs = recentData.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length
        setStats({
          projectCount: projects.length,
          totalJobs: analytics.kpi.totalJobs,
          totalCostUsd: analytics.kpi.totalCostUsd,
          activeJobs,
          successRate: analytics.kpi.successRate,
        })
        setRecentJobs(recentData.jobs)
      }
    } finally {
      setLoading(false)
    }
  }, [projects.length])

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
            {/* Stats skeleton */}
            {loading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[76px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
                ))}
              </div>
            )}

            {/* Stats */}
            {!loading && stats && <StatsGrid stats={stats} />}

            {/* Recent activity skeleton */}
            {loading && (
              <div className="h-[180px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
            )}

            {/* Recent activity */}
            {!loading && <RecentActivity jobs={recentJobs} />}
          </>
        )}
      </div>
    </div>
  )
}
