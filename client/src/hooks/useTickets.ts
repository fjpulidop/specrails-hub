import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { toast } from 'sonner'
import { getApiBase } from '../lib/api'
import { useSharedWebSocket } from './useSharedWebSocket'
import { useHub } from './useHub'
import type { LocalTicket } from '../types'

// Re-export for backward compat
export type { LocalTicket }

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketWsMessage {
  type: 'ticket_created' | 'ticket_updated' | 'ticket_deleted'
  projectId?: string
  ticket?: LocalTicket
  ticketId?: number
  timestamp?: string
}

const GLOW_DURATION_MS = 3000

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTickets() {
  const { activeProjectId } = useHub()
  const [tickets, setTickets] = useState<LocalTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTicketIds, setNewTicketIds] = useState<Set<number>>(new Set())

  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  // Track known ticket IDs so we can detect net-new additions on full refresh
  const knownIdsRef = useRef<Set<number>>(new Set())

  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // ── Fetch tickets from API ────────────────────────────────────────────────

  const fetchTickets = useCallback(async (signal?: AbortSignal): Promise<LocalTicket[]> => {
    const base = getApiBase()
    const res = await fetch(`${base}/tickets`, { signal })
    if (!res.ok) throw new Error(`Failed to fetch tickets: ${res.status}`)
    const data = (await res.json()) as { tickets: LocalTicket[] } | LocalTicket[]
    return Array.isArray(data) ? data : data.tickets ?? []
  }, [])

  // ── Initial load + project switch ─────────────────────────────────────────

  const refetch = useCallback(() => {
    if (!activeProjectIdRef.current) return
    setLoading(true)
    setError(null)

    fetchTickets()
      .then((fetched) => {
        const oldIds = knownIdsRef.current
        const newIds = new Set<number>()

        for (const t of fetched) {
          if (oldIds.size > 0 && !oldIds.has(t.id)) {
            newIds.add(t.id)
          }
        }

        knownIdsRef.current = new Set(fetched.map((t) => t.id))
        setTickets(fetched)

        if (newIds.size > 0 && oldIds.size > 0) {
          setNewTicketIds(newIds)
          toast.success(`${newIds.size} new ticket${newIds.size > 1 ? 's' : ''} added from product discovery`)
          setTimeout(() => setNewTicketIds(new Set()), GLOW_DURATION_MS)
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError((err as Error).message)
      })
      .finally(() => setLoading(false))
  }, [fetchTickets])

  useEffect(() => {
    if (!activeProjectId) {
      setTickets([])
      setError(null)
      knownIdsRef.current = new Set()
      setNewTicketIds(new Set())
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setNewTicketIds(new Set())

    const controller = new AbortController()

    fetchTickets(controller.signal)
      .then((fetched) => {
        if (cancelled) return
        knownIdsRef.current = new Set(fetched.map((t) => t.id))
        setTickets(fetched)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeProjectId, fetchTickets])

  // ── WebSocket handler ─────────────────────────────────────────────────────

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as TicketWsMessage
    if (!msg || typeof msg.type !== 'string') return

    const currentProjectId = activeProjectIdRef.current
    if ((msg as { projectId?: string }).projectId && (msg as { projectId?: string }).projectId !== currentProjectId) return

    switch (msg.type) {
      case 'ticket_created': {
        if (!msg.ticket) break
        const ticket = msg.ticket
        setTickets((prev) => {
          if (prev.some((t) => t.id === ticket.id)) return prev
          return [...prev, ticket]
        })
        knownIdsRef.current.add(ticket.id)
        setNewTicketIds((prev) => new Set([...prev, ticket.id]))
        toast.success(`New ticket: ${ticket.title}`)
        setTimeout(() => {
          setNewTicketIds((prev) => {
            const next = new Set(prev)
            next.delete(ticket.id)
            return next
          })
        }, GLOW_DURATION_MS)
        break
      }

      case 'ticket_updated': {
        if (!msg.ticket) break
        if (msg.ticket.id === 0) {
          refetch()
          break
        }
        const updated = msg.ticket
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        )
        break
      }

      case 'ticket_deleted': {
        if (msg.ticketId == null) break
        const deletedId = msg.ticketId
        setTickets((prev) => prev.filter((t) => t.id !== deletedId))
        knownIdsRef.current.delete(deletedId)
        break
      }
    }
  }, [refetch])

  useLayoutEffect(() => {
    registerHandler('tickets', handleMessage)
    return () => unregisterHandler('tickets')
  }, [handleMessage, registerHandler, unregisterHandler])

  // ── CRUD mutations ────────────────────────────────────────────────────────

  const deleteTicket = useCallback(async (ticketId: number): Promise<boolean> => {
    const res = await fetch(`${getApiBase()}/tickets/${ticketId}`, { method: 'DELETE' })
    if (res.ok) refetch()
    return res.ok
  }, [refetch])

  const updateTicketStatus = useCallback(
    async (ticketId: number, status: LocalTicket['status']): Promise<boolean> => {
      const res = await fetch(`${getApiBase()}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) refetch()
      return res.ok
    },
    [refetch]
  )

  const updateTicketPriority = useCallback(
    async (ticketId: number, priority: LocalTicket['priority']): Promise<boolean> => {
      const res = await fetch(`${getApiBase()}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      })
      if (res.ok) refetch()
      return res.ok
    },
    [refetch]
  )

  const createTicket = useCallback(
    async (ticket: { title: string; description?: string; status?: LocalTicket['status']; priority?: LocalTicket['priority']; labels?: string[] }): Promise<boolean> => {
      const res = await fetch(`${getApiBase()}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket),
      })
      if (res.ok) refetch()
      return res.ok
    },
    [refetch]
  )

  const updateTicket = useCallback(
    async (ticketId: number, fields: Partial<Pick<LocalTicket, 'title' | 'description' | 'status' | 'priority' | 'labels' | 'prerequisites'>>): Promise<boolean> => {
      const res = await fetch(`${getApiBase()}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (res.ok) refetch()
      return res.ok
    },
    [refetch]
  )

  return {
    tickets,
    loading,
    isLoading: loading,
    error,
    newTicketIds,
    refetch,
    refresh: refetch,
    deleteTicket,
    updateTicketStatus,
    updateTicketPriority,
    createTicket,
    updateTicket,
  }
}
