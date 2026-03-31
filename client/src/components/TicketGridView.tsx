import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ticket, GripVertical, AlertTriangle, Plus } from 'lucide-react'
import { cn } from '../lib/utils'
import { TicketContextMenu } from './TicketContextMenu'
import { TicketStatusDot } from './TicketStatusIndicator'
import type { LocalTicket, TicketStatus, TicketPriority } from '../types'

// ─── Column configuration ───────────────────────────────────────────────────

interface ColumnConfig {
  status: TicketStatus
  title: string
  headerClass: string
  emptyText: string
  columnBg: string
}

const COLUMNS: ColumnConfig[] = [
  {
    status: 'todo',
    title: 'Todo',
    headerClass: 'text-slate-400 border-b-slate-500/40',
    emptyText: 'No tickets to do',
    columnBg: 'bg-slate-800/20',
  },
  {
    status: 'in_progress',
    title: 'In Progress',
    headerClass: 'text-blue-400 border-b-blue-500/40',
    emptyText: 'Nothing in progress',
    columnBg: 'bg-blue-900/10',
  },
  {
    status: 'done',
    title: 'Done',
    headerClass: 'text-emerald-400 border-b-emerald-500/40',
    emptyText: 'No completed tickets',
    columnBg: 'bg-emerald-900/10',
  },
]

// ─── Priority badge ─────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<TicketPriority, { className: string; label: string }> = {
  critical: { className: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'critical' },
  high: { className: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'high' },
  medium: { className: '', label: '' },
  low: { className: 'bg-gray-500/15 text-gray-400 border-gray-500/30', label: 'low' },
}

// ─── Sortable kanban card ───────────────────────────────────────────────────

interface KanbanCardProps {
  ticket: LocalTicket
  onClick: () => void
  isDragOverlay?: boolean
}

function SortableKanbanCard({
  ticket,
  onClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
}: {
  ticket: LocalTicket
  onClick: () => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `ticket-${ticket.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <TicketContextMenu
      ticket={ticket}
      onDelete={onDelete}
      onStatusChange={onStatusChange}
      onPriorityChange={onPriorityChange}
    >
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          isDragging && 'opacity-30',
        )}
      >
        <KanbanCard
          ticket={ticket}
          onClick={onClick}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
    </TicketContextMenu>
  )
}

function KanbanCard({
  ticket,
  onClick,
  isDragOverlay,
  dragHandleProps,
}: KanbanCardProps & { dragHandleProps?: Record<string, unknown> }) {
  const priorityInfo = PRIORITY_STYLES[ticket.priority]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md p-2.5 group',
        'border border-border/30 bg-card/80 backdrop-blur-sm',
        'transition-all duration-150',
        'hover:border-border/50 hover:bg-card',
        'hover:shadow-[0_2px_12px_rgba(0,0,0,0.15)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-dracula-purple/50',
        isDragOverlay && 'shadow-xl border-dracula-purple/40 rotate-[2deg] scale-105',
        ticket.status === 'cancelled' && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <p
            className={cn(
              'text-xs font-medium leading-snug line-clamp-2',
              ticket.status === 'done'
                ? 'text-foreground/50 line-through decoration-emerald-500/40'
                : ticket.status === 'cancelled'
                  ? 'text-foreground/40 line-through decoration-muted-foreground/40'
                  : 'text-foreground/80',
            )}
          >
            {ticket.title}
          </p>

          {/* Bottom row: ID, priority, labels */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground/60">
              #{ticket.id}
            </span>

            {ticket.priority !== 'medium' && priorityInfo.label && (
              <span
                className={cn(
                  'inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium border',
                  priorityInfo.className,
                )}
              >
                {priorityInfo.label}
              </span>
            )}

            {ticket.labels.slice(0, 2).map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-accent/60 text-foreground/70 truncate max-w-[70px]"
              >
                {label}
              </span>
            ))}
            {ticket.labels.length > 2 && (
              <span className="text-[9px] text-muted-foreground">
                +{ticket.labels.length - 2}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Droppable column ───────────────────────────────────────────────────────

interface KanbanColumnProps {
  config: ColumnConfig
  tickets: LocalTicket[]
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
}

function KanbanColumn({
  config,
  tickets,
  onTicketClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
}: KanbanColumnProps) {
  const sortableIds = tickets.map((t) => `ticket-${t.id}`)

  return (
    <div className={cn('flex flex-col rounded-lg min-h-[120px]', config.columnBg)}>
      {/* Column header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b-2',
          config.headerClass,
        )}
      >
        <div className="flex items-center gap-1.5">
          <TicketStatusDot status={config.status} />
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            {config.title}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-1.5 min-h-[80px]">
          {tickets.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[60px]">
              <p className="text-[10px] text-muted-foreground/40 italic">
                {config.emptyText}
              </p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <SortableKanbanCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick(ticket)}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface TicketGridViewProps {
  tickets: LocalTicket[]
  isLoading: boolean
  error?: string | null
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
  onCreateClick?: () => void
}

export function TicketGridView({
  tickets,
  isLoading,
  error,
  onTicketClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
  onCreateClick,
}: TicketGridViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Group tickets by status column (exclude cancelled from kanban columns)
  const columnTickets = useMemo(() => {
    const grouped: Record<TicketStatus, LocalTicket[]> = {
      todo: [],
      in_progress: [],
      done: [],
      cancelled: [],
    }
    for (const ticket of tickets) {
      grouped[ticket.status].push(ticket)
    }
    // Sort within columns by priority
    const priorityOrder: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    for (const status of Object.keys(grouped) as TicketStatus[]) {
      grouped[status].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    }
    return grouped
  }, [tickets])

  const activeTicket = useMemo(() => {
    if (!activeId) return null
    const ticketId = Number(activeId.replace('ticket-', ''))
    return tickets.find((t) => t.id === ticketId) ?? null
  }, [activeId, tickets])

  // Find which column a sortable ID belongs to
  const findColumnForId = useCallback(
    (id: string): TicketStatus | null => {
      const ticketId = Number(String(id).replace('ticket-', ''))
      const ticket = tickets.find((t) => t.id === ticketId)
      return ticket?.status ?? null
    },
    [tickets],
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeTicketId = Number(String(active.id).replace('ticket-', ''))
    const overStr = String(over.id)

    // Determine target column: check if dropped over another ticket card
    let targetStatus: TicketStatus | null = null
    if (overStr.startsWith('ticket-')) {
      targetStatus = findColumnForId(overStr)
    }

    if (!targetStatus) return

    const sourceStatus = findColumnForId(String(active.id))
    if (sourceStatus && sourceStatus !== targetStatus) {
      onStatusChange(activeTicketId, targetStatus)
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Status change is handled in handleDragEnd for simplicity.
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-card/30 min-h-[150px] p-3 space-y-2">
            <div className="h-6 bg-muted/30 rounded-md animate-pulse" />
            <div className="h-16 bg-muted/20 rounded-md animate-pulse" />
            <div className="h-16 bg-muted/20 rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center space-y-1.5">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
        <p className="text-sm font-medium text-red-400">Failed to load tickets</p>
        <p className="text-xs text-red-400/70">{error}</p>
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 bg-card/50 p-8 text-center space-y-3">
        <Ticket className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">No tickets yet</p>
          <p className="text-xs text-muted-foreground/60">
            Create your first ticket or run a product backlog command to populate tickets
          </p>
        </div>
        {onCreateClick && (
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent/60 text-foreground hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first ticket
          </button>
        )}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-3 gap-3">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            config={col}
            tickets={columnTickets[col.status]}
            onTicketClick={onTicketClick}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
          />
        ))}
      </div>

      {/* Cancelled tickets row (if any) */}
      {columnTickets.cancelled.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-950/10 p-2">
          <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-1 mb-1.5">
            Cancelled ({columnTickets.cancelled.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {columnTickets.cancelled.map((ticket) => (
              <TicketContextMenu
                key={ticket.id}
                ticket={ticket}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
              >
                <button
                  type="button"
                  onClick={() => onTicketClick(ticket)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/20 bg-card/30 text-[10px] text-foreground/40 line-through hover:bg-card/50 transition-colors"
                >
                  <TicketStatusDot status="cancelled" />
                  #{ticket.id} {ticket.title}
                </button>
              </TicketContextMenu>
            ))}
          </div>
        </div>
      )}

      {/* Drag overlay */}
      <DragOverlay>
        {activeTicket ? (
          <KanbanCard
            ticket={activeTicket}
            onClick={() => {}}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
