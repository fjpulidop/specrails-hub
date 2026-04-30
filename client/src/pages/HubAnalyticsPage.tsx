import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts'
import { format } from 'date-fns'
import type { HubAnalyticsResponse, AnalyticsPeriod } from '../types'
import { PeriodSelector } from '../components/analytics/PeriodSelector'
import { useActiveTheme } from '../context/ThemeContext'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function HubKpiCards({ kpi }: { kpi: HubAnalyticsResponse['kpi'] }) {
  const cards = [
    {
      label: 'Total Cost',
      value: `$${kpi.totalCostUsd.toFixed(4)}`,
      sub: `$${kpi.costToday.toFixed(4)} today`,
    },
    {
      label: 'Total Jobs',
      value: kpi.totalJobs.toLocaleString(),
      sub: `${kpi.jobsToday} today`,
    },
    {
      label: 'Success Rate',
      value: `${(kpi.successRate * 100).toFixed(1)}%`,
      sub: 'across all projects',
    },
    {
      label: 'Avg Cost / Job',
      value: kpi.totalJobs > 0 ? `$${(kpi.totalCostUsd / kpi.totalJobs).toFixed(5)}` : '—',
      sub: 'period average',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border/40 bg-card/50 p-4">
          <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
          <p className="text-xl font-semibold font-mono">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Cost Timeline ────────────────────────────────────────────────────────────

function HubCostTimeline({ data }: { data: HubAnalyticsResponse['costTimeline'] }) {
  const theme = useActiveTheme()
  const hasData = data.length > 0 && data.some((d) => d.costUsd > 0)
  const tickStep = Math.max(1, Math.floor(data.length / 7))
  const ticks = data.filter((_, i) => i % tickStep === 0).map((d) => d.date)

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <h3 className="text-sm font-medium mb-3">Cross-Project Cost Over Time</h3>
      {!hasData ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
          No cost data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={(d: string) => { try { return format(new Date(d), 'MMM d') } catch { return d } }}
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-popover border border-border/30 rounded-lg p-2 text-xs shadow-lg">
                    <p className="text-muted-foreground mb-1">{label}</p>
                    <p className="font-medium">${(payload[0].value as number).toFixed(4)}</p>
                  </div>
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="costUsd"
              stroke={theme.chart[0]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: theme.chart[0] }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Project Breakdown Table ──────────────────────────────────────────────────

function ProjectBreakdown({ projects }: { projects: HubAnalyticsResponse['projectBreakdown'] }) {
  const theme = useActiveTheme()
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <h3 className="text-sm font-medium mb-3">Project Comparison</h3>
        <p className="text-xs text-muted-foreground">No projects registered.</p>
      </div>
    )
  }

  const maxCost = Math.max(...projects.map((p) => p.totalCostUsd), 0.0001)

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <h3 className="text-sm font-medium mb-4">Project Comparison</h3>
      <div className="space-y-3">
        {projects.map((p, idx) => (
          <div key={p.projectId} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[160px]" title={p.projectName}>
                {p.projectName}
              </span>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>{p.totalJobs} jobs</span>
                <span>{(p.successRate * 100).toFixed(0)}% success</span>
                <span className="font-mono text-foreground">${p.totalCostUsd.toFixed(4)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(p.totalCostUsd / maxCost) * 100}%`,
                  backgroundColor: theme.chart[idx % theme.chart.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Per-Project Bar Chart ────────────────────────────────────────────────────

function ProjectCostBar({ projects }: { projects: HubAnalyticsResponse['projectBreakdown'] }) {
  const theme = useActiveTheme()
  if (projects.length === 0) return null
  const data = projects.map((p) => ({ name: p.projectName.slice(0, 12), costUsd: p.totalCostUsd }))

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <h3 className="text-sm font-medium mb-3">Cost by Project</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-popover border border-border/30 rounded-lg p-2 text-xs shadow-lg">
                  <p className="text-muted-foreground mb-1">{label}</p>
                  <p className="font-medium">${(payload[0].value as number).toFixed(4)}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="costUsd" fill={theme.chart[1]} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HubAnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<HubAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refresh KPIs when jobs complete via WebSocket
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as { type?: string; event_type?: string }
    if (msg.type === 'log' && msg.event_type === 'job_done') {
      void load(period, from, to)
    }
  }, [period, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    registerHandler('hub-analytics', handleWsMessage)
    return () => unregisterHandler('hub-analytics')
  }, [handleWsMessage, registerHandler, unregisterHandler])

  async function load(p: AnalyticsPeriod, f?: string, t?: string) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ period: p })
      if (p === 'custom' && f && t) { params.set('from', f); params.set('to', t) }
      const res = await fetch(`/api/hub/analytics?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as HubAnalyticsResponse
      setData(json)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(period, from, to)
  }, [period, from, to])

  function handlePeriodChange(p: AnalyticsPeriod, f?: string, t?: string) {
    setPeriod(p)
    if (f !== undefined) setFrom(f)
    if (t !== undefined) setTo(t)
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Hub Analytics</h1>
            {data && (
              <span className="text-xs text-muted-foreground">{data.period.label}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              period={period}
              from={from}
              to={to}
              onChange={handlePeriodChange}
            />
            <button
              onClick={() => load(period, from, to)}
              disabled={loading}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              aria-label="Refresh analytics"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-400">
            Failed to load analytics: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-[220px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {data && (
          <div className="space-y-3">
            <HubKpiCards kpi={data.kpi} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <HubCostTimeline data={data.costTimeline} />
              <ProjectCostBar projects={data.projectBreakdown} />
            </div>

            <ProjectBreakdown projects={data.projectBreakdown} />
          </div>
        )}
      </div>
    </div>
  )
}
