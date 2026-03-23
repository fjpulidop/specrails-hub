import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Ticket, Search } from 'lucide-react'
import { TicketContextMenu } from './TicketContextMenu'
import { TicketStatusDot, TicketStatusRow } from './TicketStatusIndicator'
import type { LocalTicket, TicketStatus, TicketPriority } from '../types'

const PRIORITY_STYLES: Record<TicketPriority, { className: string; label: string }> = {
  critical: { className: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'critical' },
  high: { className: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'high' },
  medium: { className: '', label: '' },
  low: { className: 'bg-gray-500/15 text-gray-400 border-gray-500/30', label: 'low' },
}

const ALL_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'done', 'cancelled']

const STATUS_LABEL: Record<TicketStatus, string> = {
  todo: 'todo',
  in_progress: 'in progress',
  done: 'done',
  cancelled: 'cancelled',
}

type SortField = 'status' | 'priority' | 'updated_at'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<TicketStatus, number> = { todo: 0, in_progress: 1, done: 2, cancelled: 3 }
const PRIORITY_ORDER: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function formatRelTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

const PAGE_SIZE = 20

interface TicketListViewProps {
  tickets: LocalTicket[]
  isLoading: boolean
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
}

export function TicketListView({
  tickets,
  isLoading,
  onTicketClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
}: TicketListViewProps) {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | null>(null)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  const allLabels = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) {
      for (const l of t.labels) set.add(l)
    }
    return Array.from(set).sort()
  }, [tickets])

  const filteredAndSorted = useMemo(() => {
    let result = tickets

    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter)
    }
    if (labelFilter) {
      result = result.filter((t) => t.labels.includes(labelFilter))
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      )
    }

    const sorted = [...result]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          break
        case 'priority':
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          break
        case 'updated_at':
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [tickets, statusFilter, labelFilter, searchQuery, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 bg-muted/30 rounded-md animate-pulse" />
        ))}
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 bg-card/50 p-8 text-center space-y-2">
        <Ticket className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">No tickets yet</p>
        <p className="text-xs text-muted-foreground/60">
          Create your first ticket or run a product backlog command to populate tickets
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              statusFilter === null
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            All ({tickets.length})
          </button>
          {ALL_STATUSES.map((s) => {
            const count = tickets.filter((t) => t.status === s).length
            if (count === 0) return null
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {STATUS_LABEL[s]} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {allLabels.length > 0 && (
            <select
              value={labelFilter ?? ''}
              onChange={(e) => setLabelFilter(e.target.value || null)}
              className="h-6 rounded border border-border bg-input px-1.5 text-[10px] text-foreground"
            >
              <option value="">All labels</option>
              {allLabels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-6 w-32 rounded border border-border bg-input pl-5 pr-1.5 text-[10px] text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <button type="button" onClick={() => toggleSort('status')} className="w-20 text-left hover:text-foreground transition-colors">
          Status{sortIndicator('status')}
        </button>
        <span className="flex-1 min-w-0">Title</span>
        <button type="button" onClick={() => toggleSort('priority')} className="w-14 text-right hover:text-foreground transition-colors">
          Priority{sortIndicator('priority')}
        </button>
        <span className="w-24 text-right hidden sm:block">Labels</span>
        <button type="button" onClick={() => toggleSort('updated_at')} className="w-20 text-right hover:text-foreground transition-colors">
          Updated{sortIndicator('updated_at')}
        </button>
      </div>

      {/* Ticket rows */}
      <div className="space-y-0.5">
        {filteredAndSorted.slice(0, displayLimit).map((ticket) => {
          const priorityInfo = PRIORITY_STYLES[ticket.priority]
          const isDone = ticket.status === 'done'
          const isCancelled = ticket.status === 'cancelled'

          return (
            <TicketContextMenu
              key={ticket.id}
              ticket={ticket}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
            >
              <TicketStatusRow
                status={ticket.status}
                role="button"
                tabIndex={0}
                className="flex items-center gap-3 pr-3 py-2 rounded-md transition-colors cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onTicketClick(ticket)}
                onKeyDown={(e) => { if (e.key === 'Enter') onTicketClick(ticket) }}
              >
                {/* Status indicator */}
                <div className="w-20 flex items-center gap-1.5 shrink-0">
                  <TicketStatusDot status={ticket.status} />
                  <span className={`text-[10px] ${isCancelled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                    {STATUS_LABEL[ticket.status]}
                  </span>
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs truncate block ${
                    isCancelled
                      ? 'text-foreground/40 line-through decoration-muted-foreground/40'
                      : isDone
                        ? 'text-foreground/50'
                        : 'text-foreground/80'
                  }`}>
                    {ticket.title}
                  </span>
                </div>

                {/* Priority */}
                <div className="w-14 text-right shrink-0">
                  {ticket.priority !== 'medium' && priorityInfo.label && (
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border ${priorityInfo.className}`}>
                      {priorityInfo.label}
                    </span>
                  )}
                </div>

                {/* Labels */}
                <div className="w-24 text-right hidden sm:flex justify-end gap-0.5 overflow-hidden shrink-0">
                  {ticket.labels.slice(0, 2).map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-accent/60 text-foreground/70 truncate max-w-[80px]"
                    >
                      {label}
                    </span>
                  ))}
                  {ticket.labels.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">+{ticket.labels.length - 2}</span>
                  )}
                </div>

                {/* Updated */}
                <span className="w-20 text-right text-[10px] text-muted-foreground shrink-0">
                  {formatRelTime(ticket.updated_at)}
                </span>
              </TicketStatusRow>
            </TicketContextMenu>
          )
        })}
      </div>

      {/* Load more */}
      {filteredAndSorted.length > displayLimit && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded hover:bg-accent/50"
          >
            Load more ({filteredAndSorted.length - displayLimit} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
