import type { SpendingResponse } from '../../types/spending'
import { SURFACE_LABEL } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
  onSelectTicket: (ticketId: number | null) => void
}

export function TopTicketsCrossSurface({ data, loading, onSelectTicket }: Props) {
  if (loading && !data) {
    return <div className="h-40 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data) return null
  const list = data.topTickets

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top tickets</h2>
      {list.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground/70">No ticket activity in this period.</div>
      ) : (
        <ul className="divide-y divide-border/30">
          {list.map((t, i) => {
            const breakdown = (Object.entries(t.bySurface) as Array<[string, { count: number; costUsd: number }]>)
              .filter(([, v]) => v.count > 0)
              .map(([s, v]) => `${v.count} ${SURFACE_LABEL[s as keyof typeof SURFACE_LABEL].toLowerCase()}`)
              .join(' + ')
            const isUnattributed = t.isUnattributed
            const label = isUnattributed
              ? 'Unattributed'
              : t.ticketTitle
                ? `#${t.ticketId} ${t.ticketTitle}`
                : `deleted ticket #${t.ticketId}`
            const dim = !t.ticketTitle && !isUnattributed ? 'opacity-50' : ''
            return (
              <li key={`${t.ticketId ?? 'u'}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelectTicket(t.ticketId)}
                  className={`w-full text-left flex items-center justify-between gap-3 py-2 px-1 hover:bg-accent/30 rounded transition-colors ${dim}`}
                  disabled={isUnattributed}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{breakdown || '—'}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-sm font-medium">${t.totalCostUsd.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">{t.totalRuns} run{t.totalRuns === 1 ? '' : 's'}</div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
