import type { SpendingResponse, ByModeEntry } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
}

function fmtUsd(v: number | null): string {
  if (v == null) return '—'
  if (v < 0.005) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function fmtDur(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(0.0001, ...values)
  return (
    <div className="flex items-end gap-[1px] h-5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-foreground/40"
          style={{ height: `${Math.max(2, (v / max) * 20)}px` }}
        />
      ))}
    </div>
  )
}

function ModeColumn({ mode, label, accentClass }: { mode: ByModeEntry; label: string; accentClass: string }) {
  const sparseExplore = mode.mode === 'explore' && mode.totalRuns < 5
  return (
    <div className="flex-1 p-4 first:pr-2 last:pl-2">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${accentClass}`} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {sparseExplore ? (
        <div className="py-3">
          <p className="text-sm text-foreground">Try Explore for richer specs</p>
          <p className="text-xs text-muted-foreground mt-1">
            {mode.totalRuns} run{mode.totalRuns === 1 ? '' : 's'} so far
          </p>
        </div>
      ) : (
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {fmtUsd(mode.avgCostPerSpec)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">per spec</div>
          <div className="mt-3"><Sparkline values={mode.sparkline.length > 0 ? mode.sparkline : [0]} /></div>
          <div className="mt-3 space-y-0.5 text-xs tabular-nums text-muted-foreground">
            <div><span className="text-foreground font-medium">{mode.ticketsCreated}</span> created · {mode.totalRuns} runs</div>
            <div>{fmtDur(mode.avgDurationMs)} avg</div>
            <div className="truncate">{mode.dominantModel ?? '—'}</div>
          </div>
        </>
      )}
    </div>
  )
}

export function QuickVsExploreCard({ data, loading }: Props) {
  if (loading && !data) {
    return <div className="h-[220px] rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data) return null

  const quick = data.byMode.find((m) => m.mode === 'quick')
  const explore = data.byMode.find((m) => m.mode === 'explore')
  if (!quick || !explore) return null

  const ratio = quick.avgCostPerSpec && explore.avgCostPerSpec && quick.avgCostPerSpec > 0
    ? explore.avgCostPerSpec / quick.avgCostPerSpec
    : null
  const showRatio = ratio !== null && quick.totalRuns >= 1 && explore.totalRuns >= 5

  return (
    <div className="rounded-xl border border-border/50 bg-card/40">
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick vs Explore</h2>
      </div>
      <div className="flex divide-x divide-border/40">
        <ModeColumn mode={quick} label="Quick" accentClass="bg-accent-secondary" />
        <ModeColumn mode={explore} label="Explore" accentClass="bg-accent-highlight" />
      </div>
      {showRatio && (
        <div className="px-4 pb-3 -mt-1">
          <div className="text-center text-[11px] text-muted-foreground tabular-nums">
            <span className="px-2">━━━━━━ {ratio!.toFixed(1)}× more per spec ━━━━━━</span>
          </div>
        </div>
      )}
    </div>
  )
}
