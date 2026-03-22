import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AnalyticsResponse } from '../../types'

type KpiData = AnalyticsResponse['kpi']

interface KpiCardsProps {
  kpi: KpiData
}

function formatCost(usd: number) {
  return `$${usd.toFixed(4)}`
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalSecs = Math.round(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

function formatPctDelta(pct: number | null): string | null {
  if (pct === null) return null
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

interface TrendBadgeProps {
  delta: number | null
  deltaPct: number | null
  // lowerIsBetter: green when delta < 0
  lowerIsBetter?: boolean
  formatter?: (v: number) => string
}

function TrendBadge({ delta, deltaPct, lowerIsBetter = false, formatter }: TrendBadgeProps) {
  if (delta === null) return null

  const isPositive = delta > 0
  const isGood = lowerIsBetter ? delta < 0 : delta > 0
  const isNeutral = delta === 0

  const absFormatted = formatter
    ? formatter(Math.abs(delta))
    : delta > 0
    ? `+${delta}`
    : `${delta}`

  const pctStr = formatPctDelta(deltaPct)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded',
        isNeutral
          ? 'text-muted-foreground bg-muted/40'
          : isGood
          ? 'text-green-400 bg-green-400/10'
          : 'text-red-400 bg-red-400/10'
      )}
    >
      {isNeutral ? (
        <Minus className="w-2.5 h-2.5" />
      ) : isPositive ? (
        <TrendingUp className="w-2.5 h-2.5" />
      ) : (
        <TrendingDown className="w-2.5 h-2.5" />
      )}
      {pctStr ?? absFormatted}
    </span>
  )
}

interface CardProps {
  label: string
  value: string
  previousValue?: string | null
  badge: React.ReactNode
}

function KpiCard({ label, value, previousValue, badge }: CardProps) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {previousValue != null && (
            <p className="text-[10px] text-muted-foreground tabular-nums">prev: {previousValue}</p>
          )}
        </div>
        {badge}
      </div>
    </div>
  )
}

export function KpiCards({ kpi }: KpiCardsProps) {
  const prev = kpi.previousPeriod

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Total Cost"
        value={formatCost(kpi.totalCostUsd)}
        previousValue={prev ? formatCost(prev.totalCostUsd) : null}
        badge={
          <TrendBadge
            delta={kpi.costDelta}
            deltaPct={kpi.costDeltaPct}
            lowerIsBetter
            formatter={(v) => `$${v.toFixed(4)}`}
          />
        }
      />
      <KpiCard
        label="Total Jobs"
        value={String(kpi.totalJobs)}
        previousValue={prev ? String(prev.totalJobs) : null}
        badge={
          <TrendBadge
            delta={kpi.jobsDelta}
            deltaPct={kpi.jobsDeltaPct}
            lowerIsBetter={false}
            formatter={(v) => `+${v}`}
          />
        }
      />
      <KpiCard
        label="Success Rate"
        value={formatSuccessRate(kpi.successRate)}
        previousValue={prev ? formatSuccessRate(prev.successRate) : null}
        badge={
          <TrendBadge
            delta={kpi.successRateDelta}
            deltaPct={kpi.successRateDeltaPct}
            lowerIsBetter={false}
            formatter={(v) => `${(v * 100).toFixed(1)}%`}
          />
        }
      />
      <KpiCard
        label="Avg Duration"
        value={formatDuration(kpi.avgDurationMs)}
        previousValue={prev ? formatDuration(prev.avgDurationMs) : null}
        badge={
          <TrendBadge
            delta={kpi.avgDurationDelta}
            deltaPct={kpi.avgDurationDeltaPct}
            lowerIsBetter
            formatter={(v) => formatDuration(v)}
          />
        }
      />
      <KpiCard
        label="Total Tokens"
        value={formatTokens(kpi.totalTokens)}
        previousValue={prev ? formatTokens(prev.totalTokens) : null}
        badge={
          <TrendBadge
            delta={kpi.totalTokensDelta}
            deltaPct={kpi.totalTokensDeltaPct}
            lowerIsBetter
            formatter={(v) => formatTokens(v)}
          />
        }
      />
    </div>
  )
}
