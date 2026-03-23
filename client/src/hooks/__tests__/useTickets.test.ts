import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTickets, type LocalTicket } from '../useTickets'

// ─── Mock useSharedWebSocket ───────────────────────────────────────────────────

let wsHandler: ((msg: unknown) => void) | null = null

vi.mock('../useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: vi.fn((_id: string, fn: (msg: unknown) => void) => {
      wsHandler = fn
    }),
    unregisterHandler: vi.fn(),
    connectionStatus: 'connected' as const,
  }),
}))

// ─── Mock useHub ───────────────────────────────────────────────────────────────

let mockActiveProjectId: string | null = 'proj-1'

vi.mock('../useHub', () => ({
  useHub: () => ({
    get activeProjectId() { return mockActiveProjectId },
  }),
}))

// ─── Mock lib/api ──────────────────────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api/projects/proj-1',
}))

// ─── Mock sonner toast ─────────────────────────────────────────────────────────

const mockToastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<LocalTicket> = {}): LocalTicket {
  return {
    id: 1,
    title: 'Test ticket',
    description: 'A test ticket',
    status: 'todo',
    priority: 'medium',
    labels: [],
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: 'user',
    source: 'manual',
    ...overrides,
  }
}

describe('useTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wsHandler = null
    mockActiveProjectId = 'proj-1'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tickets: [] }),
    })
  })

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('returns empty tickets when no projectId', () => {
      mockActiveProjectId = null
      const { result } = renderHook(() => useTickets())
      expect(result.current.tickets).toEqual([])
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('fetches tickets when projectId is set', async () => {
      const tickets = [makeTicket({ id: 1 }), makeTicket({ id: 2, title: 'Another' })]
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets }),
      })

      const { result } = renderHook(() => useTickets())

      await waitFor(() => {
        expect(result.current.tickets).toHaveLength(2)
      })
      expect(result.current.loading).toBe(false)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/tickets',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    it('handles API error gracefully', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      const { result } = renderHook(() => useTickets())

      await waitFor(() => {
        expect(result.current.error).toContain('500')
      })
      expect(result.current.tickets).toEqual([])
    })

    it('handles array response format', async () => {
      const tickets = [makeTicket({ id: 1 })]
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => tickets,
      })

      const { result } = renderHook(() => useTickets())

      await waitFor(() => {
        expect(result.current.tickets).toHaveLength(1)
      })
    })
  })

  // ── WebSocket: ticket_created ──────────────────────────────────────────────

  describe('ticket_created', () => {
    it('adds a new ticket from WS event', async () => {
      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.loading).toBe(false))

      const newTicket = makeTicket({ id: 5, title: 'New from CLI' })
      act(() => {
        wsHandler?.({
          type: 'ticket_created',
          projectId: 'proj-1',
          ticket: newTicket,
          timestamp: new Date().toISOString(),
        })
      })

      expect(result.current.tickets).toHaveLength(1)
      expect(result.current.tickets[0].id).toBe(5)
    })

    it('shows toast and sets glow for new ticket', async () => {
      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.loading).toBe(false))

      const newTicket = makeTicket({ id: 5, title: 'New from CLI' })
      act(() => {
        wsHandler?.({
          type: 'ticket_created',
          projectId: 'proj-1',
          ticket: newTicket,
        })
      })

      expect(mockToastSuccess).toHaveBeenCalledWith('New ticket: New from CLI')
      expect(result.current.newTicketIds.has(5)).toBe(true)
    })

    it('deduplicates already-known ticket IDs', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 1 })] }),
      })

      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.tickets).toHaveLength(1))

      act(() => {
        wsHandler?.({
          type: 'ticket_created',
          projectId: 'proj-1',
          ticket: makeTicket({ id: 1 }),
        })
      })

      expect(result.current.tickets).toHaveLength(1)
    })

    it('ignores events from other projects', async () => {
      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.loading).toBe(false))

      act(() => {
        wsHandler?.({
          type: 'ticket_created',
          projectId: 'proj-other',
          ticket: makeTicket({ id: 99 }),
        })
      })

      expect(result.current.tickets).toHaveLength(0)
    })
  })

  // ── WebSocket: ticket_updated ──────────────────────────────────────────────

  describe('ticket_updated', () => {
    it('updates existing ticket in-place', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 1, title: 'Original' })] }),
      })

      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.tickets).toHaveLength(1))

      act(() => {
        wsHandler?.({
          type: 'ticket_updated',
          projectId: 'proj-1',
          ticket: makeTicket({ id: 1, title: 'Updated title', status: 'in_progress' }),
        })
      })

      expect(result.current.tickets[0].title).toBe('Updated title')
      expect(result.current.tickets[0].status).toBe('in_progress')
    })

    it('triggers full refetch on id:0 (file watcher signal)', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [] }),
      })

      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.loading).toBe(false))

      // Reset fetch mock to return new data
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 10, title: 'From CLI' })] }),
      })

      act(() => {
        wsHandler?.({
          type: 'ticket_updated',
          projectId: 'proj-1',
          ticket: { id: 0 },
        })
      })

      await waitFor(() => {
        expect(result.current.tickets).toHaveLength(1)
      })
      expect(result.current.tickets[0].title).toBe('From CLI')
    })
  })

  // ── WebSocket: ticket_deleted ──────────────────────────────────────────────

  describe('ticket_deleted', () => {
    it('removes ticket from list', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 1 }), makeTicket({ id: 2, title: 'Two' })] }),
      })

      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.tickets).toHaveLength(2))

      act(() => {
        wsHandler?.({
          type: 'ticket_deleted',
          projectId: 'proj-1',
          ticketId: 1,
        })
      })

      expect(result.current.tickets).toHaveLength(1)
      expect(result.current.tickets[0].id).toBe(2)
    })
  })

  // ── Project switch ─────────────────────────────────────────────────────────

  describe('project switch', () => {
    it('resets tickets on project change', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 1 })] }),
      })

      const { result, rerender } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.tickets).toHaveLength(1))

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [] }),
      })

      // Simulate project switch by changing the mock activeProjectId
      mockActiveProjectId = 'proj-2'
      rerender()

      await waitFor(() => {
        expect(result.current.tickets).toEqual([])
      })
    })
  })

  // ── Refetch with toast ─────────────────────────────────────────────────────

  describe('refetch with new tickets', () => {
    it('shows toast and glow when refetch finds new tickets', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ tickets: [makeTicket({ id: 1 })] }),
      })

      const { result } = renderHook(() => useTickets())
      await waitFor(() => expect(result.current.tickets).toHaveLength(1))

      // Refetch returns existing + 2 new
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          tickets: [
            makeTicket({ id: 1 }),
            makeTicket({ id: 2, title: 'New A' }),
            makeTicket({ id: 3, title: 'New B' }),
          ],
        }),
      })

      act(() => { result.current.refetch() })

      await waitFor(() => {
        expect(result.current.tickets).toHaveLength(3)
      })

      expect(mockToastSuccess).toHaveBeenCalledWith('2 new tickets added from product discovery')
      expect(result.current.newTicketIds.has(2)).toBe(true)
      expect(result.current.newTicketIds.has(3)).toBe(true)
    })
  })
})
