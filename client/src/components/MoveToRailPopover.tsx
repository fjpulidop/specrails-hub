import { useEffect, useRef } from 'react'
import { ArrowRightCircle, Circle, Play } from 'lucide-react'
import type { RailState } from './RailsBoard'

interface MoveToRailPopoverProps {
  rails: RailState[]
  onMoveToRail: (railId: string) => void
  /** Triggered when the popover is dismissed by an outside click / Esc / selection. */
  onClose: () => void
  /** Absolute screen position to anchor the popover near (e.g. button bounding-rect). */
  anchorRect: DOMRect
}

/**
 * Compact popover listing the project's rails. Click selects, fires
 * `onMoveToRail(railId)`, then closes. The status dot mirrors the rail's
 * current state (idle / running) so the user can avoid pushing work into
 * a rail that's already busy.
 */
export function MoveToRailPopover({ rails, onMoveToRail, onClose, anchorRect }: MoveToRailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!popoverRef.current) return
      if (popoverRef.current.contains(e.target as Node)) return
      onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Position the popover below the anchor. Default placement: align the
  // popover's RIGHT edge with the anchor's right edge so it opens leftward
  // (keeps it inside whatever container the anchor lives in — modal header,
  // postit card, etc.). Clamp to the viewport with an 8 px gutter on both
  // sides so it never goes off-screen.
  const POPOVER_WIDTH = 224 // w-56 in tailwind
  const GUTTER = 8
  const top = anchorRect.bottom + 6
  const idealLeft = anchorRect.right - POPOVER_WIDTH
  const maxLeft = window.innerWidth - POPOVER_WIDTH - GUTTER
  const left = Math.max(GUTTER, Math.min(maxLeft, idealLeft))

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Move to rail"
      data-testid="move-to-rail-popover"
      className="fixed z-50 w-56 rounded-xl border border-border/60 bg-card/95 backdrop-blur shadow-xl shadow-black/30 p-1"
      style={{ top, left }}
    >
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Move to rail</div>
      {rails.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">No rails available.</div>
      ) : (
        <ul className="flex flex-col">
          {rails.map((rail) => {
            const running = rail.status === 'running'
            return (
              <li key={rail.id}>
                <button
                  type="button"
                  onClick={() => { onMoveToRail(rail.id); onClose() }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-accent-info/10 transition-colors"
                >
                  {running ? (
                    <Play className="w-3 h-3 text-accent-success animate-pulse" aria-hidden />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground/60" aria-hidden />
                  )}
                  <span className="flex-1 truncate">{rail.label}</span>
                  <ArrowRightCircle className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
