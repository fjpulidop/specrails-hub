import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { HubProvider, useHub } from '../useHub'
import { SharedWebSocketProvider } from '../useSharedWebSocket'

// ─── Mock lib/api ──────────────────────────────────────────────────────────────

const mockSetApiContext = vi.fn()

vi.mock('../../lib/api', () => ({
  setApiContext: (...args: unknown[]) => mockSetApiContext(...args),
  getApiBase: () => '/api',
}))

// ─── Mock WebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    // Auto-connect
    setTimeout(() => this.onopen?.(), 0)
  }

  send(_data: string) {}
  close() { this.onclose?.() }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      SharedWebSocketProvider,
      { url: 'ws://localhost:4200' },
      React.createElement(HubProvider, null, children)
    )
  }
}

function makeProject(overrides: Partial<{ id: string; name: string; slug: string; path: string }> = {}) {
  return {
    id: overrides.id ?? 'proj-1',
    slug: overrides.slug ?? 'proj-1',
    name: overrides.name ?? 'Project One',
    path: overrides.path ?? '/path/to/proj',
    db_path: '/path/to/proj/.specrails/jobs.sqlite',
    added_at: '2024-01-01T00:00:00Z',
    last_seen_at: '2024-01-01T00:00:00Z',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.instances = []
    ;(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    })
  })

  it('loads projects from /api/hub/projects on mount', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [makeProject()] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].name).toBe('Project One')
  })

  it('does not auto-select project on REST load (welcome screen behavior)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [makeProject({ id: 'first', name: 'First' })] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.activeProjectId).toBeNull()
  })

  it('addProject: POSTs and returns project', async () => {
    const newProject = makeProject({ id: 'new-proj', name: 'New Project' })
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ project: newProject }) })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let returned: unknown
    await act(async () => {
      returned = await result.current.addProject('/path/to/new')
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/hub/projects',
      expect.objectContaining({ method: 'POST' })
    )
    expect(returned).toEqual(newProject)
  })

  it('removeProject: DELETEs project', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects: [makeProject()] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.removeProject('proj-1')
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/hub/projects/proj-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('WS hub.projects: bulk update', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Wait for WS to connect
    await waitFor(() => MockWebSocket.instances.length > 0)
    const ws = MockWebSocket.instances[0]
    await act(async () => { ws.onopen?.() })

    act(() => {
      ws.simulateMessage({
        type: 'hub.projects',
        projects: [makeProject({ id: 'ws-proj', name: 'WS Project' })],
      })
    })

    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].id).toBe('ws-proj')
  })

  it('WS hub.project_added: adds to list, activates', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await waitFor(() => MockWebSocket.instances.length > 0)
    const ws = MockWebSocket.instances[0]
    await act(async () => { ws.onopen?.() })

    act(() => {
      ws.simulateMessage({
        type: 'hub.project_added',
        project: makeProject({ id: 'added-proj', name: 'Added Project' }),
      })
    })

    expect(result.current.projects).toHaveLength(1)
    expect(result.current.activeProjectId).toBe('added-proj')
  })

  it('WS hub.project_removed: removes, deactivates if active', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [makeProject({ id: 'to-remove' })] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Manually activate the project (REST no longer auto-selects)
    act(() => { result.current.setActiveProjectId('to-remove') })
    expect(result.current.activeProjectId).toBe('to-remove')

    await waitFor(() => MockWebSocket.instances.length > 0)
    const ws = MockWebSocket.instances[0]
    await act(async () => { ws.onopen?.() })

    act(() => {
      ws.simulateMessage({ type: 'hub.project_removed', projectId: 'to-remove' })
    })

    expect(result.current.projects).toHaveLength(0)
    expect(result.current.activeProjectId).toBeNull()
  })

  it('setActiveProjectId: calls setApiContext', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [makeProject(), makeProject({ id: 'proj-2', name: 'Project Two' })] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => { result.current.setActiveProjectId('proj-2') })

    expect(mockSetApiContext).toHaveBeenCalledWith(true, 'proj-2')
    expect(result.current.activeProjectId).toBe('proj-2')
  })

  it('startSetupWizard/completeSetupWizard: manages setupProjectIds set', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    })

    const { result } = renderHook(() => useHub(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => { result.current.startSetupWizard('proj-setup') })
    expect(result.current.setupProjectIds.has('proj-setup')).toBe(true)

    act(() => { result.current.completeSetupWizard('proj-setup') })
    expect(result.current.setupProjectIds.has('proj-setup')).toBe(false)
  })

  it('legacy fallback: useHub() returns LEGACY_FALLBACK when no provider', () => {
    // Render without HubProvider or SharedWebSocketProvider
    const { result } = renderHook(() => useHub())

    expect(result.current.projects).toEqual([])
    expect(result.current.activeProjectId).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.setupProjectIds.size).toBe(0)
  })
})
