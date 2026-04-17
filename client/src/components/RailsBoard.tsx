import { useState, useEffect, useCallback } from 'react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Layers, Plus } from 'lucide-react'
import { RailRow } from './RailRow'
import type { RailMode, RailStatus } from './RailControls'
import type { LocalTicket } from '../types'

export const RAIL_SORT_PREFIX = '__rail:'
export function railSortId(railId: string) { return `${RAIL_SORT_PREFIX}${railId}` }
export function isRailSortId(id: string | number): id is string {
  return typeof id === 'string' && id.startsWith(RAIL_SORT_PREFIX)
}
export function extractRailId(sortId: string) { return sortId.slice(RAIL_SORT_PREFIX.length) }

export interface RailState {
  id: string
  label: string
  ticketIds: number[]
  mode: RailMode
  status: RailStatus
  activeJobId?: string
}

interface RailsBoardProps {
  rails: RailState[]
  ticketMap: Map<number, LocalTicket>
  onModeChange: (railId: string, mode: RailMode) => void
  onToggle: (railId: string) => void
  onTicketClick: (ticket: LocalTicket) => void
  onAddRail: () => void
  onDeleteRail: (railId: string) => void
  onRenameRail: (railId: string, newLabel: string) => void
}

function SortableRailWrapper({ railId, children }: { railId: string; children: (props: { listeners: Record<string, Function>; attributes: Record<string, any>; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: railSortId(railId) })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners: listeners ?? {}, attributes, isDragging })}
    </div>
  )
}

export function RailsBoard({ rails, ticketMap, onModeChange, onToggle, onTicketClick, onAddRail, onDeleteRail, onRenameRail }: RailsBoardProps) {
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

  const sortableIds = rails.map((r) => railSortId(r.id))

  return (
    <div className="flex flex-col h-full" onClick={handleBackgroundClick}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-dracula-pink">Rails</h2>
          {activeRails > 0 && (
            <span className="text-[10px] text-emerald-400 bg-emerald-400/10 rounded-full px-1.5 py-0.5 font-medium">
              {activeRails} running
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddRail() }}
          className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Rail rows */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {rails.map((rail, idx) => (
            <SortableRailWrapper key={rail.id} railId={rail.id}>
              {({ listeners, attributes }) => (
                <div data-tour={idx === 0 ? 'rail-1' : undefined}>
                  <RailRow
                    id={rail.id}
                    label={rail.label}
                    tickets={rail.ticketIds.map((id) => ticketMap.get(id)).filter((t): t is LocalTicket => t !== undefined)}
                    mode={rail.mode}
                    status={rail.status}
                    activeJobId={rail.activeJobId}
                    jiggleMode={jiggleMode}
                    dragHandleListeners={listeners}
                    dragHandleAttributes={attributes}
                    onModeChange={(mode) => onModeChange(rail.id, mode)}
                    onToggle={() => onToggle(rail.id)}
                    onTicketClick={onTicketClick}
                    onDelete={() => onDeleteRail(rail.id)}
                    onLongPress={() => setJiggleMode(true)}
                    onRename={(newLabel) => onRenameRail(rail.id, newLabel)}
                  />
                </div>
              )}
            </SortableRailWrapper>
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
