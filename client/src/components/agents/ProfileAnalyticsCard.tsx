import { useEffect, useState } from 'react'
import { getApiBase } from '../../lib/api'

interface AnalyticsRow {
  profileName: string
  jobs: number
  succeeded: number
  successRate: number
  avgDurationMs: number | null
  avgTokens: number | null
  avgCostUsd: number | null
}

interface AnalyticsResponse {
  windowDays: number
  rows: AnalyticsRow[]
}

const WINDOW_OPTIONS: Array<{ label: string; days: number }> = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export function ProfileAnalyticsCard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [windowDays, setWindowDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${getApiBase()}/profiles/analytics?windowDays=${windowDays}`)
      .then((r) => (r.ok ? (r.json() as Promise<AnalyticsResponse>) : null))
      .then((d) => {
        if (!cancelled && d) setData(d)
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [windowDays])

  if (loading && !data) return null
  if (!data || data.rows.length === 0) {
    return (
      <div className="mx-6 my-4 rounded-md border border-border bg-muted/20">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div>
            <div className="text-xs font-medium text-foreground">Profile usage</div>
            <div className="text-[11px] text-muted-foreground">
              Jobs launched per profile in the selected window.
            </div>
          </div>
          <div className="flex gap-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setWindowDays(opt.days)}
                className={
                  'text-[10px] px-2 py-1 rounded transition-colors ' +
                  (windowDays === opt.days
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-8 text-xs text-muted-foreground">
          No profile-scoped jobs yet.
        </div>
      </div>
    )
  }

  const maxJobs = Math.max(...data.rows.map((r) => r.jobs), 1)

  return (
    <div className="mx-6 my-4 rounded-md border border-border bg-muted/20">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div>
          <div className="text-xs font-medium text-foreground">Profile usage</div>
          <div className="text-[11px] text-muted-foreground">
            Jobs launched per profile in the last {data.windowDays} days.
          </div>
        </div>
        <div className="flex gap-0.5">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setWindowDays(opt.days)}
              className={
                'text-[10px] px-2 py-1 rounded transition-colors ' +
                (windowDays === opt.days
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 space-y-2">
        {data.rows.map((row) => (
          <div key={row.profileName} className="flex items-center gap-3">
            <div className="w-32 text-xs font-mono truncate">{row.profileName}</div>
            <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
              <div
                className="h-full bg-accent-primary/70"
                style={{ width: `${Math.max(6, Math.round((row.jobs / maxJobs) * 100))}%` }}
              />
            </div>
            <div className="flex gap-4 text-[11px] text-muted-foreground min-w-0 flex-shrink-0">
              <span title="jobs">
                <span className="text-foreground font-mono">{row.jobs}</span> jobs
              </span>
              <span title="success rate">
                <span className="text-foreground font-mono">
                  {Math.round(row.successRate * 100)}%
                </span>{' '}
                ok
              </span>
              {row.avgDurationMs != null && (
                <span title="avg duration">
                  <span className="text-foreground font-mono">
                    {formatDuration(row.avgDurationMs)}
                  </span>
                </span>
              )}
              {row.avgTokens != null && (
                <span title="avg tokens">
                  <span className="text-foreground font-mono">
                    {formatTokens(row.avgTokens)}
                  </span>{' '}
                  tok
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

function formatTokens(n: number): string {
  if (n < 1000) return Math.round(n).toString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
