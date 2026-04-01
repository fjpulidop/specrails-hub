import { useState, useRef, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Trash2 } from 'lucide-react'
import { RailControls, type RailMode, type RailStatus } from './RailControls'
import { SpecCard } from './SpecCard'
import type { LocalTicket } from '../types'

const LONG_PRESS_MS = 600
const SWIPE_THRESHOLD = 80

interface RailRowProps {
  id: string
  label: string
  tickets: LocalTicket[]
  mode: RailMode
  status: RailStatus
  jiggleMode: boolean
  onModeChange: (mode: RailMode) => void
  onToggle: () => void
  onTicketClick: (ticket: LocalTicket) => void
  onDelete: () => void
  onLongPress: () => void
}

export function RailRow({
  id, label, tickets, mode, status, jiggleMode,
  onModeChange, onToggle, onTicketClick, onDelete, onLongPress,
}: RailRowProps) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const [swipeX, setSwipeX] = useState(0)
  const [showSwipeDelete, setShowSwipeDelete] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isRunning = status === 'running'
  const canDelete = !isRunning

  // ── Long press detection ──────────────────────────────────────────────────
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    setShowSwipeDelete(false)

    if (canDelete) {
      longPressTimerRef.current = setTimeout(() => {
        onLongPress()
        longPressTimerRef.current = null
      }, LONG_PRESS_MS)
    }
  }, [canDelete, onLongPress])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y

    // Cancel long press if finger moves too much
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress()

    // Only track horizontal swipe (left)
    if (canDelete && dx < 0 && Math.abs(dx) > Math.abs(dy)) {
      setSwipeX(Math.max(dx, -120))
    }
  }, [canDelete, clearLongPress])

  const handleTouchEnd = useCallback(() => {
    clearLongPress()
    if (swipeX < -SWIPE_THRESHOLD && canDelete) {
      setShowSwipeDelete(true)
      setSwipeX(-SWIPE_THRESHOLD)
    } else {
      setSwipeX(0)
      setShowSwipeDelete(false)
    }
    touchStartRef.current = null
  }, [swipeX, canDelete, clearLongPress])

  // ── Mouse long press (for desktop) ────────────────────────────────────────
  const handleMouseDown = useCallback(() => {
    if (!canDelete) return
    longPressTimerRef.current = setTimeout(() => {
      onLongPress()
      longPressTimerRef.current = null
    }, LONG_PRESS_MS)
  }, [canDelete, onLongPress])

  const handleMouseUp = useCallback(() => { clearLongPress() }, [clearLongPress])

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowSwipeDelete(false)
    setSwipeX(0)
    onDelete()
  }, [onDelete])

  // Dismiss swipe on click elsewhere on the rail
  const handleRailClick = useCallback(() => {
    if (showSwipeDelete) {
      setShowSwipeDelete(false)
      setSwipeX(0)
    }
  }, [showSwipeDelete])

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onClick={handleRailClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Swipe-revealed delete button (behind the rail) */}
      {canDelete && (showSwipeDelete || swipeX < 0) && (
        <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-red-500/90 rounded-r-xl z-0">
          <button
            type="button"
            onClick={handleDeleteClick}
            className="flex flex-col items-center gap-1 text-white"
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[9px] font-medium">Delete</span>
          </button>
        </div>
      )}

      {/* Main rail content (slides left on swipe) */}
      <div
        className={`relative z-10 flex flex-col rounded-xl border transition-all duration-200 overflow-hidden ${
          jiggleMode && canDelete ? 'animate-jiggle' : ''
        } ${
          isOver
            ? 'border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_12px_hsl(var(--primary)/0.08)]'
            : 'border-border/40 hover:border-border/60'
        }`}
        style={{
          transform: swipeX < 0 ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX === 0 ? 'transform 0.2s ease' : 'none',
          backdropFilter: 'blur(8px)',
        }}
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
          <div className="flex items-center gap-1.5">
            <RailControls mode={mode} status={status} ticketCount={tickets.length} onModeChange={onModeChange} onToggle={onToggle} />
            {/* Jiggle-mode delete button */}
            {jiggleMode && canDelete && (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
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
    </div>
  )
}
