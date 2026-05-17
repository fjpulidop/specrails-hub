import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Resizable vertical split between the left (`SpecsBoard`) and right
 * (`RailsBoard`) panels of the dashboard.
 *
 * - The left-panel width in pixels is persisted per-project in `localStorage`
 *   under `specrails-hub:dashboard-split:<projectId>`.
 * - The splitter is disabled on viewports below `DISABLE_BELOW_VIEWPORT_PX`
 *   wide; in that case the left panel takes 100% and `enabled` is `false`.
 * - The persisted value is clamped to `[MIN_LEFT_PX, viewport - MIN_RIGHT_PX]`
 *   on every mount and on viewport resize, and the clamped value is written
 *   back to disk so a stale stored value doesn't leave the panel off-screen.
 * - Snap zones: when a drag releases within `SNAP_TOLERANCE_PX` of any tier
 *   breakpoint, the value snaps exactly to that breakpoint.
 */

export const MIN_LEFT_PX = 320
export const MIN_RIGHT_PX = 280
export const DISABLE_BELOW_VIEWPORT_PX = 900
export const TIER_BREAKPOINTS_PX = [600, 900] as const
export const SNAP_TOLERANCE_PX = 30
/**
 * The canonical default ratio is the strongest magnet on the splitter — a wider
 * tolerance than `SNAP_TOLERANCE_PX` so the user feels the splitter "stick"
 * to its starting position when they drag close to it.
 */
export const DEFAULT_SNAP_TOLERANCE_PX = 48

export type SpecsBoardTier = 'row' | 'card' | 'postit'

export function tierForWidth(width: number): SpecsBoardTier {
  if (width <= 600) return 'row'
  if (width <= 900) return 'card'
  return 'postit'
}

function storageKey(projectId: string | null): string | null {
  return projectId ? `specrails-hub:dashboard-split:${projectId}` : null
}

function loadStored(projectId: string | null): number | null {
  const key = storageKey(projectId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function saveStored(projectId: string | null, width: number): void {
  const key = storageKey(projectId)
  if (!key) return
  try {
    localStorage.setItem(key, String(Math.round(width)))
  } catch {
    /* quota / private mode */
  }
}

function clampToViewport(width: number, viewport: number): number {
  const maxLeft = Math.max(MIN_LEFT_PX, viewport - MIN_RIGHT_PX)
  return Math.min(Math.max(width, MIN_LEFT_PX), maxLeft)
}

/** Default rails-panel width in pixels (right side of the dashboard split). */
export const DEFAULT_RIGHT_PX = 360

/**
 * Default splitter position the first time a project is opened (no stored
 * value). Reserves `DEFAULT_RIGHT_PX` for the rails panel — wide enough that
 * the header row ("Rails" + "N running" badge) stays on a single line and
 * the compact-density mini-cards remain in play (≥ `RAILS_COMPACT_THRESHOLD_PX`
 * = 320 ⇒ normal density; we sit just above the threshold by default).
 * Floors at 901 px on the left so we never default below the postit tier
 * when there's room.
 */
export function computeDefaultLeftWidth(viewport: number): number {
  const preferred = Math.max(901, viewport - DEFAULT_RIGHT_PX)
  return clampToViewport(preferred, viewport)
}

function snapToBreakpoint(width: number, viewport: number): number {
  // 1. Canonical default snaps first with the widest tolerance so the splitter
  //    "sticks" to the initial position the user sees on first paint.
  const defaultWidth = computeDefaultLeftWidth(viewport)
  if (Math.abs(width - defaultWidth) <= DEFAULT_SNAP_TOLERANCE_PX) return defaultWidth
  // 2. Tier breakpoints retain a smaller magnetic feel for users who want to
  //    align with the row / card / postit visual transitions.
  for (const bp of TIER_BREAKPOINTS_PX) {
    if (Math.abs(width - bp) <= SNAP_TOLERANCE_PX) return bp
  }
  return width
}

interface UseDashboardSplitResult {
  /** Current left-panel width in pixels. `null` while the splitter is disabled. */
  leftWidth: number | null
  /** Active tier derived from `leftWidth` (or `'row'` while disabled). */
  tier: SpecsBoardTier
  /** Whether the splitter is rendered for the current viewport. */
  enabled: boolean
  /** Begin tracking a pointer drag — call from the splitter handle's `onPointerDown`. */
  beginDrag: (e: React.PointerEvent | PointerEvent) => void
  /** Reset to the default 50/50 split. */
  resetToDefault: () => void
}

export function useDashboardSplit(
  projectId: string | null,
  containerRef?: RefObject<HTMLElement | null>,
): UseDashboardSplitResult {
  const [viewport, setViewport] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  const prevViewportRef = useRef<number>(viewport)
  const [leftWidth, setLeftWidth] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const initialViewport = window.innerWidth
    if (initialViewport < DISABLE_BELOW_VIEWPORT_PX) return null
    // Always open at the canonical "postit + compact rails" default so the
    // first paint matches what double-clicking the splitter restores to.
    // Persistence (`localStorage`) is only used for in-session drag state.
    return computeDefaultLeftWidth(initialViewport)
  })

  const dragRef = useRef<{
    pointerId: number
    element: HTMLElement
    startClientX: number
    startLeftWidth: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingWidthRef = useRef<number | null>(null)

  // Re-resolve when the active project changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = containerRef?.current
    const v = el?.clientWidth || window.innerWidth
    setViewport(v)
    prevViewportRef.current = v
    if (v < DISABLE_BELOW_VIEWPORT_PX) {
      setLeftWidth(null)
      return
    }
    // Project switch (or initial mount): reset to the canonical default so
    // it matches the double-click target. localStorage is intentionally
    // ignored here — it's an in-session drag memory, not a remembered
    // start position.
    setLeftWidth(computeDefaultLeftWidth(v))
  }, [projectId, containerRef])

  // Container/window resize: re-clamp, toggle enabled-ness, and shift
  // `leftWidth` by the container's width delta so the rails (right) panel
  // preserves its pixel width when outer sidebars open/close.
  useEffect(() => {
    function applyViewport(v: number) {
      setViewport(v)
      if (v < DISABLE_BELOW_VIEWPORT_PX) {
        prevViewportRef.current = v
        setLeftWidth(null)
        return
      }
      const prev = prevViewportRef.current
      const delta = v - prev
      prevViewportRef.current = v
      setLeftWidth((prevLeft) => {
        const base = prevLeft ?? loadStored(projectId) ?? computeDefaultLeftWidth(v)
        // Shift by delta so rails panel keeps its current pixel width.
        const shifted = prevLeft !== null && Number.isFinite(delta) ? base + delta : base
        const clamped = clampToViewport(shifted, v)
        if (clamped !== prevLeft) saveStored(projectId, clamped)
        return clamped
      })
    }
    const el = containerRef?.current
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width
        if (typeof w === 'number') applyViewport(w)
      })
      ro.observe(el)
      // Seed with current container width.
      applyViewport(el.clientWidth || window.innerWidth)
      return () => ro.disconnect()
    }
    function onResize() { applyViewport(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [projectId, containerRef])

  const applyPending = useCallback(() => {
    rafRef.current = null
    if (pendingWidthRef.current === null) return
    const clamped = clampToViewport(pendingWidthRef.current, viewport)
    pendingWidthRef.current = null
    setLeftWidth(clamped)
  }, [viewport])

  const handleMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    // Delta-from-start preserves the exact pixel relationship between the
    // cursor and the splitter handle: whatever offset existed at pointerdown
    // is reproduced for every subsequent pointermove.
    const delta = e.clientX - dragRef.current.startClientX
    pendingWidthRef.current = dragRef.current.startLeftWidth + delta
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(applyPending)
    }
  }, [applyPending])

  const handleUp = useCallback((_e: PointerEvent) => {
    if (!dragRef.current) return
    const { pointerId, element } = dragRef.current
    try { element.releasePointerCapture(pointerId) } catch { /* already released */ }
    dragRef.current = null
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    window.removeEventListener('pointercancel', handleUp)
    setLeftWidth((prev) => {
      if (prev === null) return prev
      const snapped = snapToBreakpoint(prev, viewport)
      const clamped = clampToViewport(snapped, viewport)
      saveStored(projectId, clamped)
      return clamped
    })
  }, [handleMove, projectId, viewport])

  const beginDrag = useCallback((e: React.PointerEvent | PointerEvent) => {
    const native = (e as React.PointerEvent).nativeEvent ?? (e as PointerEvent)
    const target = (e as React.PointerEvent).currentTarget as HTMLElement | undefined
    const element = target ?? (native.target as HTMLElement)
    try { element.setPointerCapture(native.pointerId) } catch { /* may fail in tests */ }
    // Anchor the drag on the current state — `handleMove` then applies the
    // raw `(clientX - startClientX)` delta to `startLeftWidth`, which keeps
    // the cursor pixel-locked to wherever the user grabbed the handle.
    dragRef.current = {
      pointerId: native.pointerId,
      element,
      startClientX: native.clientX,
      startLeftWidth: leftWidth ?? 0,
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }, [handleMove, handleUp, leftWidth])

  const resetToDefault = useCallback(() => {
    if (typeof window === 'undefined') return
    const v = window.innerWidth
    if (v < DISABLE_BELOW_VIEWPORT_PX) return
    // Always restore the canonical "postit + compact rails" default, even
    // when the user had a different value persisted from a prior session.
    const next = computeDefaultLeftWidth(v)
    setLeftWidth(next)
    saveStored(projectId, next)
  }, [projectId])

  const enabled = leftWidth !== null && viewport >= DISABLE_BELOW_VIEWPORT_PX
  const tier: SpecsBoardTier = leftWidth === null ? 'row' : tierForWidth(leftWidth)

  return { leftWidth, tier, enabled, beginDrag, resetToDefault }
}
