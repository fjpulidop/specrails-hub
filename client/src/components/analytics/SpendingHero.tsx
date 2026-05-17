import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { SpendingResponse, Surface } from '../../types/spending'
import { SURFACE_LABEL, SURFACE_ACCENT } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
}

function fmtUsd(v: number): string {
  if (v >= 100) return `$${v.toFixed(0)}`
  if (v >= 10) return `$${v.toFixed(1)}`
  return `$${v.toFixed(2)}`
}

function fmtUsdLarge(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  if (v >= 100) return `$${v.toFixed(2)}`
  return `$${v.toFixed(2)}`
}

const SURFACES: Surface[] = ['job', 'explore-spec', 'quick-spec', 'ai-edit', 'smash']

export function SpendingHero({ data, loading }: Props) {
  const [displayedTotal, setDisplayedTotal] = useState(0)
  const lastValueRef = useRef(0)

  useEffect(() => {
    if (!data) return
    const target = data.summary.totalCostUsd
    // Count up only on first non-zero arrival, not on filter changes.
    if (lastValueRef.current === 0 && target > 0) {
      const start = performance.now()
      const duration = 600
      const from = 0
      const animate = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplayedTotal(from + (target - from) * eased)
        if (t < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    } else {
      setDisplayedTotal(target)
    }
    lastValueRef.current = target
  }, [data])

  if (loading && !data) {
    return <div className="h-44 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data) return null

  const total = data.summary.totalCostUsd
  const totalRuns = data.summary.totalRuns
  const delta = data.summary.deltaPct
  const trackingStartedAt = data.trackingStartedAt
  const segments = SURFACES.map((s) => {
    const row = data.bySurface.find((b) => b.surface === s)
    return { surface: s, costUsd: row?.costUsd ?? 0, count: row?.count ?? 0 }
  })

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Spending
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-5xl font-semibold tabular-nums tracking-tight">
              {fmtUsdLarge(displayedTotal)}
            </div>
            {delta !== null && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                delta >= 0 ? 'text-accent-warning' : 'text-accent-success'
              }`}>
                {delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(delta).toFixed(0)}% vs prev
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {totalRuns} invocation{totalRuns === 1 ? '' : 's'}
          </div>
        </div>
        {totalRuns === 0 && trackingStartedAt && (
          <div className="text-xs text-muted-foreground">
            Tracking started {trackingStartedAt.slice(0, 10)}
          </div>
        )}
      </div>

      {totalRuns === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No invocations yet for this filter window.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Tracking started {trackingStartedAt ? trackingStartedAt.slice(0, 10) : 'on first invocation'}
          </p>
        </div>
      ) : (
        <>
          <div className="h-3 w-full rounded-full overflow-hidden bg-background-deep flex">
            {segments.map((seg) => {
              const pct = total > 0 ? (seg.costUsd / total) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={seg.surface}
                  className={`h-full ${SURFACE_ACCENT[seg.surface].dot}`}
                  style={{ width: `${pct}%` }}
                  title={`${SURFACE_LABEL[seg.surface]}: ${fmtUsd(seg.costUsd)}`}
                />
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            {segments.filter((s) => s.costUsd > 0).map((seg) => (
              <span key={seg.surface} className="inline-flex items-center gap-1.5 tabular-nums">
                <span className={`w-2 h-2 rounded-full ${SURFACE_ACCENT[seg.surface].dot}`} />
                <span className="text-muted-foreground">{SURFACE_LABEL[seg.surface]}</span>
                <span className="text-foreground font-medium">{fmtUsd(seg.costUsd)}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground/80">{seg.count}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
