import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getApiBase } from '../lib/api'
import { useTicketDetailModal } from '../context/TicketDetailModalContext'
import type { TicketSpendingSummary, Surface } from '../types/spending'
import { SURFACE_LABEL } from '../types/spending'

interface Props { ticketId: number }

function fmtCost(v: number): string {
  if (v < 0.005) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function TicketSpendingLine({ ticketId }: Props) {
  const [summary, setSummary] = useState<TicketSpendingSummary | null>(null)
  const navigate = useNavigate()
  const { closeTicketDetail } = useTicketDetailModal()

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${getApiBase()}/tickets/${ticketId}/spending-summary`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() as Promise<TicketSpendingSummary> : null)
      .then((d) => { if (d) setSummary(d) })
      .catch(() => { /* ignore */ })
    return () => ctrl.abort()
  }, [ticketId])

  if (!summary || !summary.bySurface || !summary.totalRuns || summary.totalRuns === 0) return null

  const breakdown = (Object.entries(summary.bySurface) as Array<[Surface, { count: number; costUsd: number }]>)
    .filter(([, v]) => v.count > 0)
    .map(([s, v]) => `${v.count} ${SURFACE_LABEL[s].toLowerCase()}`)
    .join(' + ')

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        closeTicketDetail()
        navigate(`/analytics?ticketId=${ticketId}`)
      }}
      className="mt-1.5 group inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      aria-label="View ticket spending in Analytics"
    >
      <span className="tabular-nums font-medium text-foreground">{fmtCost(summary.totalCostUsd)}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums">{summary.totalTurns} turn{summary.totalTurns === 1 ? '' : 's'}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums">{fmtDur(summary.activeDurationMs)} active</span>
      {breakdown && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span>{breakdown}</span>
        </>
      )}
      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
