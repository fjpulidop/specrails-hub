import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from './ui/badge'
import type { LocalTicket, TicketPriority } from '../types'

const PRIORITY_VARIANT: Record<TicketPriority, 'destructive' | 'default' | 'warning' | 'outline'> = {
  critical: 'destructive',
  high: 'default',
  medium: 'warning',
  low: 'outline',
}

interface SpecCardProps {
  ticket: LocalTicket
  onClick: (ticket: LocalTicket) => void
  dragDisabled?: boolean
}

export function SpecCard({ ticket, onClick, dragDisabled }: SpecCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: dragDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isDraft = ticket.status === 'draft'
  const cardClass = isDraft
    ? 'flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-accent-secondary/50 bg-accent-secondary/10 hover:bg-accent-secondary/15 hover:border-accent-secondary/70 transition-colors cursor-grab active:cursor-grabbing group touch-none'
    : 'flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/40 bg-card/60 hover:bg-card/80 hover:border-border/60 transition-colors cursor-grab active:cursor-grabbing group touch-none'

  return (
    <div
      ref={setNodeRef}
      data-ticket-id={ticket.id}
      data-draft={isDraft || undefined}
      style={style}
      {...(!dragDisabled ? { ...attributes, ...listeners } : {})}
      className={cardClass}
      onClick={() => onClick(ticket)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(ticket)}
    >
      <span className="text-[10px] font-mono text-foreground shrink-0">#{ticket.id}</span>
      <span className="flex-1 text-sm truncate">{ticket.title}</span>
      {isDraft ? (
        <Badge variant="outline" className="text-[9px] shrink-0 border-accent-secondary/60 text-accent-secondary">
          Draft
        </Badge>
      ) : ticket.priority ? (
        <Badge variant={PRIORITY_VARIANT[ticket.priority]} className="text-[9px] shrink-0">
          {ticket.priority}
        </Badge>
      ) : null}
    </div>
  )
}
