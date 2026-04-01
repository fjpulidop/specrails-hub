import { useState, useRef, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Trash2 } from 'lucide-react'
import { RailControls, type RailMode, type RailStatus } from './RailControls'
import { SpecCard } from './SpecCard'
import type { LocalTicket } from '../types'

const LONG_PRESS_MS = 800
const SWIPE_THRESHOLD = 60

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
  onRename: (newLabel: string) => void
}

export function RailRow({
  id, label, tickets, mode, status, jiggleMode,
  onModeChange, onToggle, onTicketClick, onDelete, onLongPress, onRename,
}: RailRowProps) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [showSwipeDelete, setShowSwipeDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const isRunning = status === 'running'
  const canDelete = !isRunning

  // ── Long press detection ──────────────────────────────────────────────────
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const startLongPress = useCallback(() => {
    if (!canDelete) return
    longPressFiredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      onLongPress()
      longPressTimerRef.current = null
    }, LONG_PRESS_MS)
  }, [canDelete, onLongPress])

  // ── Touch handlers (swipe + long press) ───────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setSwiping(false)
    setShowSwipeDelete(false)
    startLongPress()
  }, [startLongPress])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y

    // Cancel long press if finger moves
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress()

    // Horizontal swipe left
    if (canDelete && dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSwiping(true)
      // Apply rubber-band resistance past threshold
      const raw = Math.max(dx, -150)
      setSwipeX(raw)
    }
  }, [canDelete, clearLongPress])

  const handleTouchEnd = useCallback(() => {
    clearLongPress()
    if (swiping) {
      if (swipeX < -SWIPE_THRESHOLD && canDelete) {
        setShowSwipeDelete(true)
        setSwipeX(-80) // snap to reveal delete button
      } else {
        setSwipeX(0)
        setShowSwipeDelete(false)
      }
      setSwiping(false)
    }
    touchStartRef.current = null
  }, [swipeX, swiping, canDelete, clearLongPress])

  // ── Mouse handlers (long press only — no mouse swipe) ─────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start long press on the rail header area, not on buttons
    if ((e.target as HTMLElement).closest('button')) return
    startLongPress()
  }, [startLongPress])

  const handleMouseUp = useCallback(() => {
    // Only clear the timer — don't exit jiggle mode (it persists after release)
    clearLongPress()
  }, [clearLongPress])

  // Suppress the click event that follows a successful long press, so it
  // doesn't bubble up to RailsBoard's background click handler and
  // immediately exit jiggle mode.
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressFiredRef.current) {
      e.stopPropagation()
      longPressFiredRef.current = false
      return
    }
    if (showSwipeDelete) {
      setShowSwipeDelete(false)
      setSwipeX(0)
    }
  }, [showSwipeDelete])

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowSwipeDelete(false)
    setSwipeX(0)
    onDelete()
  }, [onDelete])

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onClick={handleClick}
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
        className={`relative z-10 flex flex-col rounded-xl border overflow-hidden ${
          jiggleMode && canDelete ? 'animate-jiggle' : ''
        } ${
          isOver
            ? 'border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_12px_hsl(var(--primary)/0.08)]'
            : 'border-border/40 hover:border-border/60'
        }`}
        style={{
          transform: swipeX < 0 ? `translateX(${swipeX}px)` : undefined,
          transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
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
            {editing ? (
              <form
                className="flex items-center gap-0.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  const trimmed = editValue.trim()
                  if (trimmed) onRename(trimmed)
                  setEditing(false)
                }}
              >
                <span className="text-xs font-medium text-foreground/50">Rail -</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    const trimmed = editValue.trim()
                    if (trimmed) onRename(trimmed)
                    setEditing(false)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false) } }}
                  className="w-24 text-xs font-medium bg-transparent border-b border-primary/50 outline-none text-foreground/80 px-0.5"
                  autoFocus
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  // Extract suffix after "Rail " prefix for editing
                  const suffix = label.startsWith('Rail ') ? label.slice(5) : label
                  setEditValue(suffix)
                  setEditing(true)
                  setTimeout(() => inputRef.current?.select(), 0)
                }}
                className="text-xs font-medium text-foreground/80 hover:text-foreground hover:underline decoration-dotted underline-offset-2 cursor-text transition-colors"
              >
                {label}
              </button>
            )}
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
