import { useState } from 'react'
import type { InvocationRow, Surface } from '../../types/spending'
import { SURFACE_LABEL, SURFACE_ACCENT } from '../../types/spending'

interface TableFilters {
  model?: string
  status?: 'success' | 'failed' | 'aborted'
  minCostUsd?: number
}

interface Props {
  rows: InvocationRow[]
  loading: boolean
  truncated: boolean
  totalAvailable: number
  tableFilters: TableFilters
  onTableFiltersChange: (f: TableFilters) => void
}

function fmtCost(v: number | null): string {
  if (v == null) return '—'
  if (v < 0.005) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
}
function fmtNum(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

export function InvocationsTable({
  rows, loading, truncated, totalAvailable, tableFilters, onTableFiltersChange,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">All invocations</h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <select
            value={tableFilters.status ?? ''}
            onChange={(e) => onTableFiltersChange({ ...tableFilters, status: (e.target.value || undefined) as TableFilters['status'] })}
            className="h-7 px-2 rounded-md bg-background-deep border border-border/60 text-xs"
            aria-label="Status filter"
          >
            <option value="">All status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="aborted">Aborted</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="≥ $0.00"
            value={tableFilters.minCostUsd ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? undefined : parseFloat(e.target.value)
              onTableFiltersChange({ ...tableFilters, minCostUsd: Number.isNaN(n) ? undefined : n })
            }}
            className="h-7 w-24 px-2 rounded-md bg-background-deep border border-border/60 text-xs tabular-nums"
            aria-label="Minimum cost filter"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-32 rounded bg-card/30 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground/70">No invocations match the current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="text-left">
                <th className="font-medium px-2 py-2">Surface</th>
                <th className="font-medium px-2 py-2">Ticket</th>
                <th className="font-medium px-2 py-2 text-right">Cost</th>
                <th className="font-medium px-2 py-2 text-right">Turns</th>
                <th className="font-medium px-2 py-2 text-right">Tokens</th>
                <th className="font-medium px-2 py-2">Model</th>
                <th className="font-medium px-2 py-2">Status</th>
                <th className="font-medium px-2 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const surface = r.surface as Surface
                const accent = SURFACE_ACCENT[surface]
                const totalTokens = (r.tokens_in ?? 0) + (r.tokens_out ?? 0)
                return (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                    className="border-t border-border/30 hover:bg-accent/30 cursor-pointer"
                  >
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 h-5 rounded-full text-[10px] font-medium ${accent.bg} ${accent.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
                        {SURFACE_LABEL[surface]}
                      </span>
                    </td>
                    <td className="px-2 py-2 max-w-[260px]">
                      {r.ticket_id == null
                        ? <span className="text-muted-foreground/70">—</span>
                        : <span className="truncate block">#{r.ticket_id} {r.ticket_title ?? <span className="text-muted-foreground/70 italic">(deleted)</span>}</span>
                      }
                    </td>
                    <td className="px-2 py-2 text-right font-medium">{fmtCost(r.total_cost_usd)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.num_turns)}</td>
                    <td className="px-2 py-2 text-right">{totalTokens > 0 ? fmtNum(totalTokens) : '—'}</td>
                    <td className="px-2 py-2 max-w-[180px] truncate">{r.model ?? '—'}</td>
                    <td className="px-2 py-2">
                      {r.status === 'success'
                        ? <span className="text-accent-success/90">●</span>
                        : r.status === 'failed'
                        ? <span className="text-accent-warning">⚠</span>
                        : <span className="text-muted-foreground">○</span>
                      }
                      <span className="ml-1 text-muted-foreground">{r.status}</span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.started_at.slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {truncated && (
        <div className="mt-2 text-[11px] text-muted-foreground/80">
          Showing first {rows.length} of {totalAvailable.toLocaleString()} matching rows.
        </div>
      )}
    </div>
  )
}
