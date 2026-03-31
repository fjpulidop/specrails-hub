import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { RailControls, type RailMode, type RailStatus } from './RailControls'
import { SpecCard } from './SpecCard'
import type { LocalTicket } from '../types'

interface RailRowProps {
  id: string
  label: string
  tickets: LocalTicket[]
  mode: RailMode
  status: RailStatus
  onModeChange: (mode: RailMode) => void
  onToggle: () => void
  onTicketClick: (ticket: LocalTicket) => void
}

export function RailRow({ id, label, tickets, mode, status, onModeChange, onToggle, onTicketClick }: RailRowProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      className={`flex flex-col rounded-xl border transition-all duration-200 overflow-hidden ${
        isOver
          ? 'border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_12px_hsl(var(--primary)/0.08)]'
          : 'border-border/40 hover:border-border/60'
      }`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-gradient-to-r from-muted/30 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${
              status === 'running' ? 'bg-emerald-400 shadow-[0_0_4px_hsl(142_70%_56%/0.8)] animate-pulse' : 'bg-muted-foreground/25'
            }`}
          />
          <span className="text-xs font-medium text-foreground/80">{label}</span>
          {tickets.length > 0 && (
            <span className="text-[9px] text-muted-foreground bg-muted/30 rounded-full px-1.5 py-0.5 leading-none">
              {tickets.length}
            </span>
          )}
        </div>
        <RailControls mode={mode} status={status} ticketCount={tickets.length} onModeChange={onModeChange} onToggle={onToggle} />
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={`min-h-[56px] px-3 py-2 space-y-1.5 transition-colors duration-150 ${
          isOver ? 'bg-primary/[0.04]' : 'bg-card/20'
        }`}
      >
        {tickets.length === 0 ? (
          <div
            className={`h-10 flex items-center justify-center rounded-lg border border-dashed transition-all duration-150 ${
              isOver
                ? 'border-primary/40 text-primary/50 bg-primary/[0.04]'
                : 'border-border/25 text-muted-foreground/30'
            }`}
          >
            <span className="text-[10px] select-none">{isOver ? 'Drop here' : 'Drag specs here'}</span>
          </div>
        ) : (
          <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tickets.map((ticket) => (
              <SpecCard key={ticket.id} ticket={ticket} onClick={onTicketClick} dragDisabled={status === 'running'} />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
}
