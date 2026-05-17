import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis } from 'recharts'
import type { SpendingResponse, ScatterPoint } from '../../types/spending'
import { SURFACE_LABEL } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
  onSelectPoint: (p: ScatterPoint) => void
}

interface ChartPoint {
  id: string
  x: number
  y: number
  surface: string
  ticketId: number | null
  startedAt: string
  raw: ScatterPoint
}

const COLOR: Record<string, string> = {
  job: 'var(--accent-info, #5fa8d3)',
  'quick-spec': 'var(--accent-secondary, #f7768e)',
  'explore-spec': 'var(--accent-highlight, #c084fc)',
  'ai-edit': 'var(--accent-success, #50fa7b)',
  smash: 'var(--accent-highlight, #c084fc)',
}

export function CostScatter({ data, loading, onSelectPoint }: Props) {
  if (loading && !data) {
    return <div className="h-[260px] rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data) return null

  const surfaces: Array<'job' | 'quick-spec' | 'explore-spec' | 'ai-edit' | 'smash'> = ['job', 'quick-spec', 'explore-spec', 'ai-edit', 'smash']
  const datasets = surfaces.map((s) => ({
    surface: s,
    points: data.scatter
      .filter((p) => p.surface === s)
      .map<ChartPoint>((p) => ({
        id: p.id,
        x: p.numTurns ?? Math.round((p.durationMs ?? 0) / 1000),
        y: p.costUsd,
        surface: s,
        ticketId: p.ticketId,
        startedAt: p.startedAt,
        raw: p,
      })),
  }))
  const isEmpty = data.scatter.length === 0

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost vs Turns</h2>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {surfaces.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLOR[s] }} />
              <span className="text-muted-foreground">{SURFACE_LABEL[s]}</span>
            </span>
          ))}
        </div>
      </div>
      {isEmpty ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground/70">
          No invocations to plot.
        </div>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-border/30" />
              <XAxis
                type="number" dataKey="x" name="turns"
                tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground"
                label={{ value: 'turns', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: 'currentColor' }}
              />
              <YAxis
                type="number" dataKey="y" name="cost"
                tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground"
                tickFormatter={(v) => `$${v.toFixed(v < 1 ? 2 : 0)}`}
              />
              <ZAxis range={[40, 80]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', fontSize: 11, borderRadius: 6 }}
                formatter={(value: unknown, name: unknown) => {
                  const n = String(name)
                  if (n === 'cost' && typeof value === 'number') return [`$${value.toFixed(3)}`, 'cost']
                  return [String(value), n]
                }}
              />
              {datasets.map((d) => (
                <Scatter
                  key={d.surface}
                  data={d.points}
                  fill={COLOR[d.surface]}
                  onClick={(point) => {
                    const cp = point as unknown as ChartPoint
                    if (cp?.raw) onSelectPoint(cp.raw)
                  }}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
