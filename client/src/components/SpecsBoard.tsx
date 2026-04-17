import { useState, useRef, useCallback, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { FileText, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from './ui/button'
import { SpecCard } from './SpecCard'
import { ProposeSpecModal } from './ProposeSpecModal'
import type { LocalTicket } from '../types'

interface SpecsBoardProps {
  /** Pre-ordered, pre-filtered active tickets (ordering + filtering owned by parent). */
  tickets: LocalTicket[]
  /** Full unfiltered ticket list (for new-ticket detection in ProposeSpec modal). */
  allTickets?: LocalTicket[]
  /** Tickets that have been implemented (status=done). */
  doneTickets?: LocalTicket[]
  isLoading: boolean
  onTicketClick: (ticket: LocalTicket) => void
  onTicketCreated?: (ticket: LocalTicket) => void
}

export function SpecsBoard({ tickets, allTickets, doneTickets = [], isLoading, onTicketClick, onTicketCreated }: SpecsBoardProps) {
  const [proposeOpen, setProposeOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      setProposeOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const { isOver, setNodeRef } = useDroppable({ id: 'specs' })
  const { isOver: isDoneOver, setNodeRef: setDoneNodeRef } = useDroppable({ id: 'done-specs' })

  // ── Resizable split divider ──────────────────────────────────────────────────
  const [splitRatio, setSplitRatio] = useState(0.65) // top panel gets 65%
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    setSplitRatio(Math.max(0.2, Math.min(0.85, ratio)))
  }, [])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-dracula-purple">Spec</h2>
          {tickets.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted/30 rounded-full px-1.5 py-0.5">
              {tickets.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => setProposeOpen(true)}
          data-tour="add-spec-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* Content area — always split between active and done */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Active specs — droppable zone */}
        <div
          ref={setNodeRef}
          style={{ flex: `0 0 ${splitRatio * 100}%` }}
          className={`overflow-y-auto px-4 py-3 space-y-1.5 transition-colors duration-150 ${isOver ? 'bg-primary/[0.04]' : ''}`}
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
              {!isOver && <p className="text-xs mt-1 opacity-60">Click "+ Add" to get started</p>}
            </div>
          ) : (
            <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tickets.map((ticket) => (
                <SpecCard key={ticket.id} ticket={ticket} onClick={onTicketClick} />
              ))}
            </SortableContext>
          )}
        </div>

        {/* Resizable divider */}
        <div
          className="shrink-0 h-1.5 flex items-center justify-center cursor-row-resize group hover:bg-primary/[0.06] transition-colors select-none touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="w-8 h-0.5 rounded-full bg-border/60 group-hover:bg-primary/30 transition-colors" />
        </div>

        {/* Done specs section — droppable zone */}
        <div ref={setDoneNodeRef} className={`flex-1 min-h-0 flex flex-col overflow-hidden transition-colors duration-150 ${isDoneOver ? 'bg-emerald-500/[0.04]' : ''}`}>
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/30 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />
            <span className="text-[11px] font-medium text-muted-foreground">Done</span>
            <span className="text-[10px] text-muted-foreground/60 bg-muted/20 rounded-full px-1.5 py-0.5">
              {doneTickets.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
            {doneTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <CheckCircle2 className="w-6 h-6 mb-2 opacity-15" />
                <p className="text-xs opacity-60">{isDoneOver ? 'Drop to mark as done' : 'No completed specs yet'}</p>
              </div>
            ) : (
              <SortableContext items={doneTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {doneTickets.map((ticket) => (
                  <SpecCard key={ticket.id} ticket={ticket} onClick={onTicketClick} />
                ))}
              </SortableContext>
            )}
          </div>
        </div>
      </div>

      <ProposeSpecModal open={proposeOpen} onClose={() => setProposeOpen(false)} tickets={allTickets ?? tickets} onTicketCreated={onTicketCreated} />
    </div>
  )
}
