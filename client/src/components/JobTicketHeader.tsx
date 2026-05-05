import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

// Clicking a (non-deleted) ticket chip opens the existing TicketDetailModal
// via TicketDetailModalContext, mounted at the App root. No new route.

export interface TicketRef {
  id: number
  title: string | null
}

interface JobTicketHeaderProps {
  tickets: TicketRef[]
  onTicketClick: (id: number) => void
}

const COMPACT_THRESHOLD = 4

export function JobTicketHeader({ tickets, onTicketClick }: JobTicketHeaderProps) {
  const [expanded, setExpanded] = useState(false)

  if (tickets.length === 0) return null

  const isCompact = tickets.length >= COMPACT_THRESHOLD && !expanded
  const visible = isCompact ? tickets.slice(0, 1) : tickets
  const hiddenCount = tickets.length - visible.length

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tickets.map((t) => (
          <TicketChip
            key={t.id}
            ticket={t}
            onClick={t.title != null ? () => onTicketClick(t.id) : undefined}
          />
        ))}
      </div>

      {visible.map((t) =>
        t.title != null ? (
          <button
            key={t.id}
            type="button"
            onClick={() => onTicketClick(t.id)}
            className="block w-full text-left text-lg font-semibold text-foreground truncate hover:text-accent-primary transition-colors"
            title={t.title}
          >
            {t.title}
          </button>
        ) : null,
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + {hiddenCount} more
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {expanded && tickets.length >= COMPACT_THRESHOLD && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Show less
          <ChevronUp className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function TicketChip({ ticket, onClick }: { ticket: TicketRef; onClick?: () => void }) {
  const isDeleted = ticket.title == null
  const baseClass =
    'inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums'

  if (isDeleted) {
    return (
      <span
        className={cn(
          baseClass,
          'text-muted-foreground bg-muted/20 cursor-default select-none',
        )}
        title="Ticket no longer exists"
      >
        #{ticket.id} (deleted)
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        baseClass,
        'text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 transition-colors cursor-pointer',
      )}
    >
      #{ticket.id}
    </button>
  )
}
