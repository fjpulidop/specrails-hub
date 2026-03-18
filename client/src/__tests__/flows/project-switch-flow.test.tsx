import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { useProjectCache } from '../../hooks/useProjectCache'

// We need to clear the global cache between tests to avoid cross-test bleed
// The globalCache is module-level in useProjectCache.ts — we clear by using
// unique namespaces per test or by re-importing.

describe('project-switch-flow (useProjectCache)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initialValue on first load when cache is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: [] }),
    })

    const fetcher = vi.fn().mockResolvedValue(['cmd-a', 'cmd-b'])
    const { result } = renderHook(() =>
      useProjectCache({
        namespace: `switch-test-${Date.now()}`,
        projectId: 'proj-a',
        initialValue: [] as string[],
        fetcher,
      })
    )

    // Initially shows initialValue
    expect(result.current.data).toEqual([])
    expect(result.current.isFirstLoad).toBe(true)

    // After fetch completes, shows fresh data
    await waitFor(() => {
      expect(result.current.data).toEqual(['cmd-a', 'cmd-b'])
    })
    expect(result.current.isFirstLoad).toBe(false)
  })

  it('switches to new project and resets to initialValue (no cache for new project)', async () => {
    const ns = `switch-test-reset-${Date.now()}`
    const fetcherA = vi.fn().mockResolvedValue(['data-for-a'])
    const fetcherB = vi.fn().mockResolvedValue(['data-for-b'])

    // Start with project-a
    let projectId = 'proj-a-switch'
    let fetcher = fetcherA

    const { result, rerender } = renderHook(
      () =>
        useProjectCache({
          namespace: ns,
          projectId,
          initialValue: [] as string[],
          fetcher,
        }),
    )

    // Wait for project-a data
    await waitFor(() => {
      expect(result.current.data).toEqual(['data-for-a'])
    })

    // Switch to project-b
    projectId = 'proj-b-switch'
    fetcher = fetcherB
    rerender()

    // project-b has no cache — resets to initialValue, then fetches
    await waitFor(() => {
      expect(result.current.data).toEqual(['data-for-b'])
    })
    expect(fetcherB).toHaveBeenCalled()
  })

  it('restores cached data instantly when switching back to project A', async () => {
    const ns = `switch-test-restore-${Date.now()}`

    const fetcherA = vi.fn().mockResolvedValue(['a1', 'a2'])
    const fetcherB = vi.fn().mockResolvedValue(['b1', 'b2'])

    let projectId = 'proj-a-restore'
    let fetcher = fetcherA

    const { result, rerender } = renderHook(
      () =>
        useProjectCache({
          namespace: ns,
          projectId,
          initialValue: [] as string[],
          fetcher,
        }),
    )

    // Load project A
    await waitFor(() => {
      expect(result.current.data).toEqual(['a1', 'a2'])
    })

    // Switch to project B
    projectId = 'proj-b-restore'
    fetcher = fetcherB
    rerender()

    await waitFor(() => {
      expect(result.current.data).toEqual(['b1', 'b2'])
    })

    // Switch back to project A — should restore from cache instantly
    projectId = 'proj-a-restore'
    fetcher = fetcherA
    rerender()

    // Data should be restored from cache (isFirstLoad=false, data=[a1, a2])
    await waitFor(() => {
      expect(result.current.data).toEqual(['a1', 'a2'])
    })
    expect(result.current.isFirstLoad).toBe(false)
  })

  it('refresh function re-fetches and updates data', async () => {
    const ns = `switch-test-refresh-${Date.now()}`
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([`call-${callCount}`])
    })

    const { result } = renderHook(() =>
      useProjectCache({
        namespace: ns,
        projectId: 'proj-refresh',
        initialValue: [] as string[],
        fetcher,
      })
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(['call-1'])
    })

    act(() => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(['call-2'])
    })
  })

  it('returns initialValue when projectId is null', () => {
    const fetcher = vi.fn().mockResolvedValue(['data'])
    const { result } = renderHook(() =>
      useProjectCache({
        namespace: 'switch-test-null',
        projectId: null,
        initialValue: ['default'] as string[],
        fetcher,
      })
    )

    expect(result.current.data).toEqual(['default'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('polls at given interval', async () => {
    vi.useFakeTimers()
    const ns = `switch-test-poll-${Date.now()}`
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([`poll-${callCount}`])
    })

    const { result } = renderHook(() =>
      useProjectCache({
        namespace: ns,
        projectId: 'proj-poll',
        initialValue: [] as string[],
        fetcher,
        pollInterval: 5000,
      })
    )

    // First fetch on mount
    await act(async () => {
      await Promise.resolve() // flush microtasks
    })
    expect(callCount).toBe(1)

    // Advance timer to trigger poll
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(callCount).toBe(2)

    vi.useRealTimers()
  })
})
