import { useState, useCallback } from 'react'
import { List, LayoutGrid, StickyNote } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { TicketListView } from './TicketListView'
import { TicketGridView } from './TicketGridView'
import { TicketPostItView } from './TicketPostItView'
import type { LocalTicket, TicketStatus, TicketPriority } from '../types'

export type TicketViewMode = 'list' | 'grid' | 'postit'

interface TicketsSectionProps {
  tickets: LocalTicket[]
  isLoading: boolean
  error?: string | null
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: (ticketId: number) => void
  onStatusChange: (ticketId: number, status: TicketStatus) => void
  onPriorityChange: (ticketId: number, priority: TicketPriority) => void
  onCreateClick?: () => void
}

const VIEW_MODES: { mode: TicketViewMode; icon: typeof List; label: string }[] = [
  { mode: 'list', icon: List, label: 'List view' },
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view (Kanban)' },
  { mode: 'postit', icon: StickyNote, label: 'Post-it view' },
]

export function TicketsSection({
  tickets,
  isLoading,
  error,
  onTicketClick,
  onDelete,
  onStatusChange,
  onPriorityChange,
  onCreateClick,
}: TicketsSectionProps) {
  const [viewMode, setViewMode] = useState<TicketViewMode>('list')

  const handleTicketClick = useCallback(
    (ticket: LocalTicket) => {
      onTicketClick(ticket)
    },
    [onTicketClick]
  )

  return (
    <div className="space-y-2">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-0.5">
        {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setViewMode(mode)}
                className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
                  viewMode === mode
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Active view */}
      {viewMode === 'list' && (
        <TicketListView
          tickets={tickets}
          isLoading={isLoading}
          error={error}
          onTicketClick={handleTicketClick}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onCreateClick={onCreateClick}
        />
      )}

      {viewMode === 'grid' && (
        <TicketGridView
          tickets={tickets}
          isLoading={isLoading}
          error={error}
          onTicketClick={handleTicketClick}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onCreateClick={onCreateClick}
        />
      )}

      {viewMode === 'postit' && (
        <TicketPostItView
          tickets={tickets}
          isLoading={isLoading}
          error={error}
          onTicketClick={handleTicketClick}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onCreateClick={onCreateClick}
        />
      )}
    </div>
  )
}
