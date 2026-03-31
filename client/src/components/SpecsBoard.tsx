import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { FileText, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { SpecCard } from './SpecCard'
import { ProposeSpecModal } from './ProposeSpecModal'
import type { LocalTicket } from '../types'

interface SpecsBoardProps {
  /** Pre-ordered, pre-filtered tickets to display (ordering + filtering owned by parent). */
  tickets: LocalTicket[]
  isLoading: boolean
  onTicketClick: (ticket: LocalTicket) => void
}

export function SpecsBoard({ tickets, isLoading, onTicketClick }: SpecsBoardProps) {
  const [proposeOpen, setProposeOpen] = useState(false)
  const { isOver, setNodeRef } = useDroppable({ id: 'specs' })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Specs</h2>
          {tickets.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted/30 rounded-full px-1.5 py-0.5">
              {tickets.length}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setProposeOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Propose Spec
        </Button>
      </div>

      {/* List — droppable zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto px-4 py-3 space-y-1.5 transition-colors duration-150 ${
          isOver ? 'bg-primary/[0.04]' : ''
        }`}
      >
        {isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center py-16 text-center transition-colors ${
              isOver ? 'text-primary/50' : 'text-muted-foreground'
            }`}
          >
            <FileText className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-sm">{isOver ? 'Drop here' : 'No specs yet'}</p>
            {!isOver && <p className="text-xs mt-1 opacity-60">Click "Propose Spec" to get started</p>}
          </div>
        ) : (
          <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tickets.map((ticket) => (
              <SpecCard key={ticket.id} ticket={ticket} onClick={onTicketClick} />
            ))}
          </SortableContext>
        )}
      </div>

      <ProposeSpecModal open={proposeOpen} onClose={() => setProposeOpen(false)} />
    </div>
  )
}
