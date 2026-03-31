import { Layers } from 'lucide-react'
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
}

export function RailsBoard({ rails, ticketMap, onModeChange, onToggle, onTicketClick }: RailsBoardProps) {
  const activeRails = rails.filter((r) => r.status === 'running').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0">
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
            onModeChange={(mode) => onModeChange(rail.id, mode)}
            onToggle={() => onToggle(rail.id)}
            onTicketClick={onTicketClick}
          />
        ))}
      </div>
    </div>
  )
}
