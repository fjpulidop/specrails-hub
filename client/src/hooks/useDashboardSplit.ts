import { useCallback, useEffect, useRef, useState } from 'react'

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

/**
 * Default splitter position the first time a project is opened (no stored
 * value). Targets the "postit + compact rails" experience: postit tier on
 * the left (≥ 901 px) and the rails panel narrow enough to render the
 * compact mini-cards (right < `RAILS_COMPACT_THRESHOLD_PX` = 320). On
 * viewports too narrow to fit both, the postit tier wins and the rails
 * panel falls back to its normal layout.
 */
export function computeDefaultLeftWidth(viewport: number): number {
  // Aim for `viewport - 300` so the rails panel gets 300 px (< 320 ⇒ compact).
  // Floor at 901 so we never default below the postit tier when there's room.
  const preferred = Math.max(901, viewport - 300)
  return clampToViewport(preferred, viewport)
}

function snapToBreakpoint(width: number): number {
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

export function useDashboardSplit(projectId: string | null): UseDashboardSplitResult {
  const [viewport, setViewport] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  const [leftWidth, setLeftWidth] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const initialViewport = window.innerWidth
    if (initialViewport < DISABLE_BELOW_VIEWPORT_PX) return null
    const stored = loadStored(projectId)
    if (stored !== null) return clampToViewport(stored, initialViewport)
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
  // Snapshot of the splitter's position when the app loaded this session for
  // the active project. `resetToDefault` (double-click) returns the user to
  // this snapshot instead of the geometric centre — so dragging away and
  // double-clicking always restores the "natural" position they were on.
  const originalLeftWidthRef = useRef<number | null>(null)

  // Re-resolve when the active project changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = window.innerWidth
    setViewport(v)
    if (v < DISABLE_BELOW_VIEWPORT_PX) {
      setLeftWidth(null)
      originalLeftWidthRef.current = null
      return
    }
    const stored = loadStored(projectId)
    const next = stored !== null ? clampToViewport(stored, v) : computeDefaultLeftWidth(v)
    setLeftWidth(next)
    // Capture the per-project session "original" position used by the
    // double-click reset target.
    originalLeftWidthRef.current = next
    // Re-write if we clamped a stale value.
    if (stored !== null && stored !== next) saveStored(projectId, next)
  }, [projectId])

  // Window resize: re-clamp and toggle enabled-ness.
  useEffect(() => {
    function onResize() {
      const v = window.innerWidth
      setViewport(v)
      if (v < DISABLE_BELOW_VIEWPORT_PX) {
        setLeftWidth(null)
        return
      }
      setLeftWidth((prev) => {
        const base = prev ?? loadStored(projectId) ?? computeDefaultLeftWidth(v)
        const clamped = clampToViewport(base, v)
        if (clamped !== base) saveStored(projectId, clamped)
        return clamped
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [projectId])

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
      const snapped = snapToBreakpoint(prev)
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
    // Prefer the per-session "original" captured on mount / project-switch.
    // Fall back to viewport/2 only when no original was captured (e.g. the
    // very first render before the project-switch effect runs).
    const target = originalLeftWidthRef.current ?? computeDefaultLeftWidth(v)
    const next = clampToViewport(target, v)
    setLeftWidth(next)
    saveStored(projectId, next)
  }, [projectId])

  const enabled = leftWidth !== null && viewport >= DISABLE_BELOW_VIEWPORT_PX
  const tier: SpecsBoardTier = leftWidth === null ? 'row' : tierForWidth(leftWidth)

  return { leftWidth, tier, enabled, beginDrag, resetToDefault }
}
