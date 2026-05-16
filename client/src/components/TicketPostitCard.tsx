import { useCallback, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link2, ArrowRight, Crown, Trash2 } from 'lucide-react'
import { Badge } from './ui/badge'
import { MoveToRailPopover } from './MoveToRailPopover'
import type { LocalTicket, TicketPriority } from '../types'
import type { RailState } from './RailsBoard'

const PRIORITY_VARIANT: Record<TicketPriority, 'destructive' | 'default' | 'warning' | 'outline'> = {
  critical: 'destructive',
  high: 'default',
  medium: 'warning',
  low: 'outline',
}

interface TicketPostitCardProps {
  ticket: LocalTicket
  rails: RailState[]
  onClick: (ticket: LocalTicket) => void
  onMoveToRail: (ticketId: number, railId: string) => void
  /** Number of children when this ticket is an épica (drives the crown badge). */
  epicChildrenCount?: number
  /** Resolved épica title when this ticket is a child of an épica. */
  parentEpicTitle?: string | null
  /** Click handler for the parent-epic chip (opens the parent spec modal). */
  onOpenParentEpic?: (parentEpicId: number) => void
  contractRefining?: boolean
  jiggleMode?: boolean
  onDelete?: (ticket: LocalTicket) => void
}

/**
 * Square-ish postit card variant of `SpecCard`. Renders the ticket's id,
 * title (up to 2 lines), priority pill, dependency indicator, and the
 * `short_summary` field when present. A `Move to Rail` button at the
 * bottom opens a popover listing the project's rails.
 *
 * Used by `SpecsBoard` in the `postit` tier (wide left panel).
 */
export function TicketPostitCard({
  ticket,
  rails,
  onClick,
  onMoveToRail,
  epicChildrenCount,
  parentEpicTitle,
  onOpenParentEpic,
  contractRefining = false,
  jiggleMode = false,
  onDelete,
}: TicketPostitCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: jiggleMode,
  })

  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null)
  const moveButtonRef = useRef<HTMLButtonElement>(null)

  const handleCardClick = useCallback(() => {
    if (jiggleMode) return
    onClick(ticket)
  }, [jiggleMode, onClick, ticket])

  const handleMoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!moveButtonRef.current) return
    setPopoverAnchor(moveButtonRef.current.getBoundingClientRect())
  }, [])

  const isDraft = ticket.status === 'draft'
  const isEpic = ticket.is_epic === true
  const isChildOfEpic = ticket.parent_epic_id != null
  const hasDependencies = (ticket.prerequisites?.length ?? 0) > 0
  const summary = ticket.short_summary && ticket.short_summary.trim().length > 0 ? ticket.short_summary : null

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const tone = isDraft
    ? 'bg-accent-secondary/10 border-accent-secondary/40'
    : isEpic
      ? 'bg-card/80 border-accent-highlight/40'
      : 'bg-card/80 border-border/40'

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={style}
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCardClick()
          }
        }}
        data-ticket-id={ticket.id}
        data-tier="postit"
        className={`group relative flex flex-col gap-2 rounded-xl border ${tone} backdrop-blur p-3 cursor-pointer transition-all hover:border-accent-info/40 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info/60 min-h-[180px] ${jiggleMode ? 'animate-pulse' : ''} ${contractRefining ? 'ring-1 ring-accent-info/30' : ''}`}
      >
        {/* Header: id + priority */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/60">#{ticket.id}</span>
          <div className="flex items-center gap-1.5">
            {isEpic && (
              <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[9px] border-accent-highlight/40 text-accent-highlight">
                <Crown className="w-2.5 h-2.5" aria-hidden />
                Epic{epicChildrenCount ? ` · ${epicChildrenCount}` : ''}
              </Badge>
            )}
            {ticket.priority && !isDraft && (
              <Badge variant={PRIORITY_VARIANT[ticket.priority]} className="h-4 px-1.5 text-[9px] uppercase">
                {ticket.priority}
              </Badge>
            )}
            {isDraft && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase border-accent-secondary/50 text-accent-secondary">
                Draft
              </Badge>
            )}
          </div>
        </div>

        {/* Title — up to 2 lines */}
        <h3 className="text-sm font-medium leading-snug line-clamp-2 text-foreground">
          {ticket.title}
        </h3>

        {/* Summary (if present) */}
        {summary && (
          <p
            data-testid="postit-short-summary"
            className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-3 italic"
          >
            {summary}
          </p>
        )}

        {/* Dependency indicator + parent epic chip */}
        {(hasDependencies || isChildOfEpic) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/70">
            {hasDependencies && (
              <span className="inline-flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" aria-hidden />
                Depends on {ticket.prerequisites!.length}
              </span>
            )}
            {isChildOfEpic && parentEpicTitle && ticket.parent_epic_id != null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenParentEpic?.(ticket.parent_epic_id as number)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    e.preventDefault()
                    onOpenParentEpic?.(ticket.parent_epic_id as number)
                  }
                }}
                disabled={!onOpenParentEpic}
                title={`Open parent Epic #${ticket.parent_epic_id} · ${parentEpicTitle}`}
                data-testid={`postit-epic-child-pill-${ticket.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-accent-secondary/40 text-accent-secondary bg-accent-secondary/5 hover:bg-accent-secondary/15 hover:border-accent-secondary/60 disabled:hover:bg-accent-secondary/5 disabled:hover:border-accent-secondary/40 disabled:cursor-default px-1.5 py-0.5 text-[10px] font-medium max-w-[180px] truncate transition-colors"
              >
                <Crown className="w-2.5 h-2.5 shrink-0" aria-hidden />
                <span className="truncate">↑ #{ticket.parent_epic_id} {parentEpicTitle}</span>
              </button>
            )}
          </div>
        )}

        {/* Spacer pushes the Move-to-Rail button to the bottom */}
        <div className="flex-1" />

        {/* Move to Rail button */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
          <button
            ref={moveButtonRef}
            type="button"
            onClick={handleMoveClick}
            data-testid="move-to-rail-button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent-info/90 hover:bg-accent-info/10 hover:text-accent-info transition-colors"
          >
            Move to Rail
            <ArrowRight className="w-2.5 h-2.5" aria-hidden />
          </button>
          {jiggleMode && onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(ticket) }}
              className="p-1 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label={`Delete ticket #${ticket.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {popoverAnchor && (
        <MoveToRailPopover
          rails={rails}
          anchorRect={popoverAnchor}
          onMoveToRail={(railId) => onMoveToRail(ticket.id, railId)}
          onClose={() => setPopoverAnchor(null)}
        />
      )}
    </>
  )
}
