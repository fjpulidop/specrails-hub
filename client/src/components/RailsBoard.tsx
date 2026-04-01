import { useState, useEffect, useCallback } from 'react'
import { Layers, Plus } from 'lucide-react'
import { RailRow } from './RailRow'
import type { RailMode, RailStatus } from './RailControls'
import type { LocalTicket } from '../types'

export interface RailState {
  id: string
  label: string
  ticketIds: number[]
  mode: RailMode
  status: RailStatus
}

interface RailsBoardProps {
  rails: RailState[]
  ticketMap: Map<number, LocalTicket>
  onModeChange: (railId: string, mode: RailMode) => void
  onToggle: (railId: string) => void
  onTicketClick: (ticket: LocalTicket) => void
  onAddRail: () => void
  onDeleteRail: (railId: string) => void
}

export function RailsBoard({ rails, ticketMap, onModeChange, onToggle, onTicketClick, onAddRail, onDeleteRail }: RailsBoardProps) {
  const activeRails = rails.filter((r) => r.status === 'running').length
  const [jiggleMode, setJiggleMode] = useState(false)

  // Exit jiggle mode on click outside (on the board background)
  const handleBackgroundClick = useCallback(() => {
    if (jiggleMode) setJiggleMode(false)
  }, [jiggleMode])

  // Exit jiggle mode on Escape key
  useEffect(() => {
    if (!jiggleMode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setJiggleMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jiggleMode])

  return (
    <div className="flex flex-col h-full" onClick={handleBackgroundClick}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border/40 shrink-0">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Rails</h2>
        {activeRails > 0 && (
          <span className="text-[10px] text-emerald-400 bg-emerald-400/10 rounded-full px-1.5 py-0.5 font-medium">
            {activeRails} running
          </span>
        )}
      </div>

      {/* Rail rows */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {rails.map((rail) => (
          <RailRow
            key={rail.id}
            id={rail.id}
            label={rail.label}
            tickets={rail.ticketIds.map((id) => ticketMap.get(id)).filter((t): t is LocalTicket => t !== undefined)}
            mode={rail.mode}
            status={rail.status}
            jiggleMode={jiggleMode}
            onModeChange={(mode) => onModeChange(rail.id, mode)}
            onToggle={() => onToggle(rail.id)}
            onTicketClick={onTicketClick}
            onDelete={() => onDeleteRail(rail.id)}
            onLongPress={() => setJiggleMode(true)}
          />
        ))}

        {/* Add Rail button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddRail() }}
          className="group flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border/30 hover:border-primary/40 text-muted-foreground/40 hover:text-primary/60 transition-all duration-200 hover:bg-primary/[0.03] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
          <span className="text-xs font-medium">Add Rail</span>
        </button>
      </div>
    </div>
  )
}
