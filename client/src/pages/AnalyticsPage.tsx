import { useState, useRef, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import type { AnalyticsResponse, AnalyticsPeriod, TrendsResponse, TrendsPeriod } from '../types'
import { PeriodSelector } from '../components/analytics/PeriodSelector'
import { KpiCards } from '../components/analytics/KpiCards'
import { CostTimeline } from '../components/analytics/CostTimeline'
import { StatusBreakdown } from '../components/analytics/StatusBreakdown'
import { DurationHistogram } from '../components/analytics/DurationHistogram'
import { TokenEfficiency } from '../components/analytics/TokenEfficiency'
import { CommandPerformance } from '../components/analytics/CommandPerformance'
import { DailyThroughput } from '../components/analytics/DailyThroughput'
import { CostTreemap } from '../components/analytics/CostTreemap'
import { BonusMetrics } from '../components/analytics/BonusMetrics'
import { TrendsChart } from '../components/analytics/TrendsChart'

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[260px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
        ))}
      </div>
      <div className="h-[180px] rounded-lg border border-border/40 bg-card/50 animate-pulse" />
    </div>
  )
}

interface ErrorBannerProps {
  message: string
  onRetry: () => void
}

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 flex items-center justify-between">
      <p className="text-sm text-red-400">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  )
}

const TRENDS_PERIODS: { value: TrendsPeriod; label: string }[] = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

export default function AnalyticsPage() {
  const { activeProjectId } = useHub()
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const [trendsPeriod, setTrendsPeriod] = useState<TrendsPeriod>('7d')
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null)

  // Per-project cache for analytics
  const cacheRef = useRef<Map<string, AnalyticsResponse>>(new Map())

  useEffect(() => {
    // On project switch, restore cached data instantly
    if (activeProjectId) {
      const cached = cacheRef.current.get(activeProjectId)
      if (cached) {
        setData(cached)
        setLoading(false)
      }
    }

    const controller = new AbortController()
    if (!data && !cacheRef.current.get(activeProjectId ?? '')) {
      setLoading(true)
    }
    setError(null)

    const params = new URLSearchParams({ period })
    if (period === 'custom') {
      if (!from || !to) {
        // Do not fetch until both dates are set
        setLoading(false)
        return
      }
      params.set('from', from)
      params.set('to', to)
    }

    fetch(`${getApiBase()}/analytics?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<AnalyticsResponse>
      })
      .then((responseData) => {
        setData(responseData)
        if (activeProjectId) cacheRef.current.set(activeProjectId, responseData)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })

    return () => controller.abort()
  }, [period, from, to, retryKey, activeProjectId])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${getApiBase()}/trends?period=${trendsPeriod}`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() as Promise<TrendsResponse> : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((d) => setTrendsData(d))
      .catch((err: Error) => { if (err.name !== 'AbortError') console.warn('[analytics] trends fetch failed:', err.message) })
    return () => controller.abort()
  }, [trendsPeriod, activeProjectId])

  function handlePeriodChange(newPeriod: AnalyticsPeriod, newFrom?: string, newTo?: string) {
    setPeriod(newPeriod)
    setFrom(newFrom ?? '')
    setTo(newTo ?? '')
  }

  function handleRetry() {
    setRetryKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Analytics</h1>
          {data && (
            <p className="text-xs text-muted-foreground">{data.period.label}</p>
          )}
        </div>
        <PeriodSelector period={period} from={from} to={to} onChange={handlePeriodChange} />
      </div>

      {loading && <SkeletonGrid />}

      {!loading && error && (
        <ErrorBanner message={`Failed to load analytics: ${error}`} onRetry={handleRetry} />
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          <KpiCards kpi={data.kpi} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CostTimeline data={data.costTimeline} />
            <StatusBreakdown data={data.statusBreakdown} />
            <DurationHistogram
              data={data.durationHistogram}
              percentiles={data.durationPercentiles}
            />
            <TokenEfficiency data={data.tokenEfficiency} />
          </div>

          <CommandPerformance data={data.commandPerformance} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DailyThroughput data={data.dailyThroughput} />
            <CostTreemap data={data.costPerCommand} />
          </div>

          <BonusMetrics data={data.bonusMetrics} />

          {/* Trends chart */}
          {trendsData && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-medium">Trends</h2>
                <div className="flex items-center gap-1">
                  {TRENDS_PERIODS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setTrendsPeriod(p.value)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        trendsPeriod === p.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <TrendsChart points={trendsData.points} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
