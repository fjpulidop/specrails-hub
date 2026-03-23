import { useMemo } from 'react'
import { Ticket, AlertTriangle, ArrowUp, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { TicketContextMenu } from './TicketContextMenu'
import { TicketStatusDot } from './TicketStatusIndicator'
import type { LocalTicket, TicketStatus, TicketPriority } from '../types'

// ─── Post-it color palettes per status ──────────────────────────────────────

interface PostItPalette {
  bg: string
  border: string
  shadow: string
  hoverShadow: string
  titleText: string
  metaText: string
  /** Subtle fold/corner accent */
  cornerBg: string
}

const STATUS_PALETTE: Record<TicketStatus, PostItPalette> = {
  todo: {
    bg: 'bg-slate-700/40',
    border: 'border-slate-600/40',
    shadow: 'shadow-[0_2px_8px_rgba(100,116,139,0.15)]',
    hoverShadow: 'hover:shadow-[0_4px_20px_rgba(100,116,139,0.25)]',
    titleText: 'text-slate-200',
    metaText: 'text-slate-400',
    cornerBg: 'bg-slate-600/30',
  },
  in_progress: {
    bg: 'bg-blue-900/35',
    border: 'border-blue-500/35',
    shadow: 'shadow-[0_2px_8px_rgba(59,130,246,0.12)]',
    hoverShadow: 'hover:shadow-[0_4px_20px_rgba(59,130,246,0.25)]',
    titleText: 'text-blue-100',
    metaText: 'text-blue-300/70',
    cornerBg: 'bg-blue-500/20',
  },
  done: {
    bg: 'bg-emerald-900/30',
    border: 'border-emerald-500/30',
    shadow: 'shadow-[0_2px_8px_rgba(16,185,129,0.1)]',
    hoverShadow: 'hover:shadow-[0_4px_20px_rgba(16,185,129,0.2)]',
    titleText: 'text-emerald-200/80',
    metaText: 'text-emerald-400/60',
    cornerBg: 'bg-emerald-500/15',
  },
  cancelled: {
    bg: 'bg-red-950/25',
    border: 'border-red-800/25',
    shadow: 'shadow-[0_2px_8px_rgba(239,68,68,0.06)]',
    hoverShadow: 'hover:shadow-[0_4px_20px_rgba(239,68,68,0.12)]',
    titleText: 'text-red-300/50',
    metaText: 'text-red-400/40',
    cornerBg: 'bg-red-800/15',
  },
}

// ─── Priority indicator ─────────────────────────────────────────────────────

const PRIORITY_INDICATOR: Record<TicketPriority, { icon: typeof AlertTriangle | null; className: string; label: string }> = {
  critical: { icon: AlertTriangle, className: 'text-red-400', label: 'Critical' },
  high: { icon: ArrowUp, className: 'text-orange-400', label: 'High' },
  medium: { icon: null, className: '', label: '' },
  low: { icon: ChevronUp, className: 'text-gray-500 rotate-180', label: 'Low' },
}

// ─── Slight random rotations for paper feel ─────────────────────────────────

function getRotation(id: number): string {
  const rotations = ['-1.2deg', '0.8deg', '-0.5deg', '1.1deg', '-0.9deg', '0.3deg', '1.5deg', '-0.7deg']
  return rotations[id % rotations.length]
}

// ─── Component ──────────────────────────────────────────────────────────────

interface TicketPostItViewProps {
  tickets: LocalTicket[]
  isLoading: boolean
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
}

export function TicketPostItView({
  tickets,
  isLoading,
  onTicketClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
}: TicketPostItViewProps) {
  const sorted = useMemo(() => {
    const order: Record<TicketStatus, number> = { in_progress: 0, todo: 1, done: 2, cancelled: 3 }
    return [...tickets].sort((a, b) => order[a.status] - order[b.status])
  }, [tickets])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-28 rounded-lg border border-border/30 bg-card/30 animate-pulse"
          />
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {sorted.map((ticket) => (
        <TicketContextMenu
          key={ticket.id}
          ticket={ticket}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
        >
          <PostItCard
            ticket={ticket}
            onClick={() => onTicketClick(ticket)}
          />
        </TicketContextMenu>
      ))}
    </div>
  )
}

// ─── PostItCard ─────────────────────────────────────────────────────────────

interface PostItCardProps {
  ticket: LocalTicket
  onClick: () => void
}

function PostItCard({ ticket, onClick }: PostItCardProps) {
  const palette = STATUS_PALETTE[ticket.status]
  const priority = PRIORITY_INDICATOR[ticket.priority]
  const rotation = getRotation(ticket.id)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full text-left rounded-lg p-3 min-h-[100px]',
        'border backdrop-blur-sm',
        palette.bg,
        palette.border,
        palette.shadow,
        palette.hoverShadow,
        'transition-all duration-200 ease-out',
        'hover:scale-[1.03] hover:-translate-y-0.5',
        'active:scale-[0.98]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-dracula-purple/50',
        ticket.status === 'cancelled' && 'opacity-60',
      )}
      style={{ transform: `rotate(${rotation})` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'rotate(0deg) scale(1.03) translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `rotate(${rotation})`
      }}
    >
      {/* Corner fold effect */}
      <div
        className={cn('absolute top-0 right-0 w-5 h-5 rounded-bl-lg', palette.cornerBg)}
        aria-hidden
      />

      {/* Priority indicator */}
      {priority.icon && (
        <div className="absolute top-1.5 left-2">
          <priority.icon className={cn('w-3 h-3', priority.className)} />
        </div>
      )}

      {/* Title */}
      <p
        className={cn(
          'text-xs font-medium leading-snug line-clamp-3 mt-1',
          palette.titleText,
          ticket.status === 'done' && 'line-through decoration-emerald-500/40',
        )}
      >
        {ticket.title}
      </p>

      {/* Bottom row: ticket ID + status dot */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
        <span className={cn('text-[9px] font-mono', palette.metaText)}>
          #{ticket.id}
        </span>
        <TicketStatusDot status={ticket.status} />
      </div>
    </button>
  )
}
