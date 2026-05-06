import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { SpendingResponse } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
}

export function SpendingTimeline({ data, loading }: Props) {
  if (loading && !data) {
    return <div className="h-[220px] rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data) return null

  const chartData = data.dailyTimeline.map((d) => ({
    date: d.date.slice(5), // MM-DD
    Jobs: d.jobsCostUsd,
    Explore: d.exploreCostUsd,
    Quick: d.quickCostUsd,
    Refine: d.aiEditCostUsd,
  }))

  const isEmpty = chartData.every((d) => d.Jobs + d.Explore + d.Quick + d.Refine === 0)

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily timeline</h2>
        <span className="text-[10px] text-muted-foreground/70">stacked by surface</span>
      </div>
      {isEmpty ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground/70">
          No spend in this period.
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-border/30" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', fontSize: 11, borderRadius: 6 }}
                formatter={(value: unknown, name: unknown) => [`$${typeof value === 'number' ? value.toFixed(2) : '—'}`, String(name)]}
              />
              <Bar dataKey="Jobs" stackId="a" fill="var(--accent-info, #5fa8d3)" />
              <Bar dataKey="Explore" stackId="a" fill="var(--accent-highlight, #c084fc)" />
              <Bar dataKey="Quick" stackId="a" fill="var(--accent-secondary, #f7768e)" />
              <Bar dataKey="Refine" stackId="a" fill="var(--accent-success, #50fa7b)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
