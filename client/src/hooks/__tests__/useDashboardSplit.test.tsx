import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDashboardSplit, tierForWidth, MIN_LEFT_PX, MIN_RIGHT_PX, DISABLE_BELOW_VIEWPORT_PX } from '../useDashboardSplit'

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

describe('tierForWidth', () => {
  it('returns row for narrow widths', () => {
    expect(tierForWidth(400)).toBe('row')
    expect(tierForWidth(600)).toBe('row')
  })

  it('returns card for intermediate widths', () => {
    expect(tierForWidth(700)).toBe('card')
    expect(tierForWidth(900)).toBe('card')
  })

  it('returns postit for wide widths', () => {
    expect(tierForWidth(901)).toBe('postit')
    expect(tierForWidth(1500)).toBe('postit')
  })
})

describe('useDashboardSplit', () => {
  beforeEach(() => {
    localStorage.clear()
    setViewport(1400)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initialises in the postit + compact-rails preset when no stored value exists', () => {
    // viewport 1400 → default = max(901, 1400 - 300) = 1100
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(1100)
    expect(result.current.enabled).toBe(true)
    expect(result.current.tier).toBe('postit')
  })

  it('ignores any persisted width at mount and uses the canonical default', () => {
    // Persistence is in-session only — first paint always matches dblclick.
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '950')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(1100) // 1400 viewport → canonical 1100
    expect(result.current.tier).toBe('postit')
  })

  it('canonical default clamps to viewport - MIN_RIGHT_PX on small viewports', () => {
    setViewport(1000)
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    // computeDefaultLeftWidth(1000) = max(901, 1000-300=700) = 901; clamped to
    // min(901, 1000-280=720) = 720.
    expect(result.current.leftWidth).toBe(720)
  })

  it('is disabled when viewport is below DISABLE_BELOW_VIEWPORT_PX', () => {
    setViewport(DISABLE_BELOW_VIEWPORT_PX - 100)
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.enabled).toBe(false)
    expect(result.current.leftWidth).toBeNull()
    expect(result.current.tier).toBe('row')
  })

  it('resetToDefault restores the canonical default and persists', () => {
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(1100)
    act(() => result.current.resetToDefault())
    expect(result.current.leftWidth).toBe(1100)
    expect(localStorage.getItem('specrails-hub:dashboard-split:proj-1')).toBe('1100')
  })

  it('falls back to the postit + compact-rails preset when no stored value existed at mount', () => {
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    // viewport 1400 → default = 1100
    expect(result.current.leftWidth).toBe(1100)
    act(() => result.current.resetToDefault())
    expect(result.current.leftWidth).toBe(1100)
    expect(localStorage.getItem('specrails-hub:dashboard-split:proj-1')).toBe('1100')
  })

  it('switching projects resets to the canonical default', () => {
    // Pre-existing stored values are ignored — the splitter always opens at
    // the canonical default for whichever project becomes active.
    localStorage.setItem('specrails-hub:dashboard-split:proj-A', '800')
    localStorage.setItem('specrails-hub:dashboard-split:proj-B', '500')
    const { result, rerender } = renderHook(({ id }) => useDashboardSplit(id), {
      initialProps: { id: 'proj-A' as string | null },
    })
    expect(result.current.leftWidth).toBe(1100)
    rerender({ id: 'proj-B' })
    expect(result.current.leftWidth).toBe(1100)
  })

  it('responds to viewport resize by toggling the disabled state', () => {
    setViewport(1400)
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(1100)
    act(() => setViewport(800))
    // 800 < DISABLE_BELOW_VIEWPORT_PX (900) → disabled, leftWidth=null
    expect(result.current.enabled).toBe(false)
    expect(result.current.leftWidth).toBeNull()
  })

  it('exposes MIN constants as documented bounds', () => {
    expect(MIN_LEFT_PX).toBe(320)
    expect(MIN_RIGHT_PX).toBe(280)
    expect(DISABLE_BELOW_VIEWPORT_PX).toBe(900)
  })
})
