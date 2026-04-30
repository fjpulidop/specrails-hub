import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { format } from 'date-fns'
import { useActiveTheme } from '../../context/ThemeContext'
import type { TrendPoint } from '../../types'

interface TrendsChartProps {
  points: TrendPoint[]
}

type Metric = 'cost' | 'duration' | 'successRate'

interface TooltipPayload {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border/30 rounded-lg p-2 text-xs shadow-lg space-y-1">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function formatXAxis(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d')
  } catch {
    return dateStr
  }
}

export function TrendsChart({ points }: TrendsChartProps) {
  const theme = useActiveTheme()
  const METRICS: { key: Metric; label: string; color: string }[] = [
    { key: 'cost',        label: 'Avg Cost ($)',        color: theme.chart[0] },
    { key: 'duration',    label: 'Avg Duration (min)',  color: theme.chart[1] },
    { key: 'successRate', label: 'Success Rate (%)',    color: theme.chart[2] },
  ]
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['cost', 'successRate']))

  const hasData = points.some((p) => p.jobCount > 0)

  // Derive chart data with formatted values
  const chartData = points.map((p) => ({
    date: p.date,
    cost: p.avgCostUsd !== null ? parseFloat(p.avgCostUsd.toFixed(4)) : 0,
    duration: p.avgDurationMs !== null ? parseFloat((p.avgDurationMs / 60000).toFixed(2)) : 0,
    successRate: parseFloat((p.successRate * 100).toFixed(1)),
    jobCount: p.jobCount,
  }))

  const tickStep = Math.max(1, Math.floor(points.length / 7))
  const ticks = points.filter((_, i) => i % tickStep === 0).map((p) => p.date)

  function toggleMetric(key: Metric) {
    setActiveMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Performance Trends</h3>
        <div className="flex items-center gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMetric(m.key)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors ${
                activeMetrics.has(m.key)
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block shrink-0"
                style={{ background: m.color }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
          No job data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
            {activeMetrics.has('cost') && (
              <Line
                type="monotone"
                dataKey="cost"
                name="Avg Cost ($)"
                stroke={theme.chart[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: theme.chart[0] }}
              />
            )}
            {activeMetrics.has('duration') && (
              <Line
                type="monotone"
                dataKey="duration"
                name="Avg Duration (min)"
                stroke={theme.chart[1]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: theme.chart[1] }}
              />
            )}
            {activeMetrics.has('successRate') && (
              <Line
                type="monotone"
                dataKey="successRate"
                name="Success Rate (%)"
                stroke={theme.chart[2]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: theme.chart[2] }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
