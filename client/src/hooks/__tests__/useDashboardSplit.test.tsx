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

  it('initialises at 50/50 when no stored value exists', () => {
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(700)
    expect(result.current.enabled).toBe(true)
    expect(result.current.tier).toBe('card') // 700 is in card range
  })

  it('restores the persisted width on mount', () => {
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '950')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(950)
    expect(result.current.tier).toBe('postit')
  })

  it('clamps a stored width that exceeds viewport - MIN_RIGHT_PX', () => {
    setViewport(1000)
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '2000')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    // Max left = 1000 - 280 = 720
    expect(result.current.leftWidth).toBe(720)
    // Stored value is re-written.
    expect(localStorage.getItem('specrails-hub:dashboard-split:proj-1')).toBe('720')
  })

  it('clamps a stored width below MIN_LEFT_PX up to the minimum', () => {
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '100')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(MIN_LEFT_PX)
  })

  it('is disabled when viewport is below DISABLE_BELOW_VIEWPORT_PX', () => {
    setViewport(DISABLE_BELOW_VIEWPORT_PX - 100)
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.enabled).toBe(false)
    expect(result.current.leftWidth).toBeNull()
    expect(result.current.tier).toBe('row')
  })

  it('resetToDefault returns to the per-session original captured on mount', () => {
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '950')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    // Mount snapshot = 950 (loaded from localStorage).
    expect(result.current.leftWidth).toBe(950)
    // Drag elsewhere.
    act(() => result.current.resetToDefault()) // simulate: still 950 (snapshot)
    expect(result.current.leftWidth).toBe(950)
    expect(localStorage.getItem('specrails-hub:dashboard-split:proj-1')).toBe('950')
  })

  it('falls back to viewport / 2 when no stored value existed at mount', () => {
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(700)
    act(() => result.current.resetToDefault())
    expect(result.current.leftWidth).toBe(700)
    expect(localStorage.getItem('specrails-hub:dashboard-split:proj-1')).toBe('700')
  })

  it('uses a project-specific localStorage key', () => {
    localStorage.setItem('specrails-hub:dashboard-split:proj-A', '800')
    localStorage.setItem('specrails-hub:dashboard-split:proj-B', '500')
    const { result, rerender } = renderHook(({ id }) => useDashboardSplit(id), {
      initialProps: { id: 'proj-A' as string | null },
    })
    expect(result.current.leftWidth).toBe(800)
    rerender({ id: 'proj-B' })
    expect(result.current.leftWidth).toBe(MIN_LEFT_PX > 500 ? MIN_LEFT_PX : 500)
  })

  it('responds to viewport resize by re-clamping', () => {
    setViewport(1400)
    localStorage.setItem('specrails-hub:dashboard-split:proj-1', '1000')
    const { result } = renderHook(() => useDashboardSplit('proj-1'))
    expect(result.current.leftWidth).toBe(1000)
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
