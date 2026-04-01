import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { useTickets } from '../hooks/useTickets'
import { SpecsBoard } from '../components/SpecsBoard'
import { RailsBoard, type RailState } from '../components/RailsBoard'
import { TicketDetailModal } from '../components/TicketDetailModal'
import { CreateTicketModal } from '../components/CreateTicketModal'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import type { LocalTicket } from '../types'
import type { RailMode, RailStatus } from '../components/RailControls'

const INITIAL_RAILS: RailState[] = [
  { id: 'rail-1', label: 'Rail 1', ticketIds: [], mode: 'implement', status: 'idle' },
  { id: 'rail-2', label: 'Rail 2', ticketIds: [], mode: 'implement', status: 'idle' },
  { id: 'rail-3', label: 'Rail 3', ticketIds: [], mode: 'implement', status: 'idle' },
]

function loadSpecOrder(projectId: string | null): number[] | null {
  if (!projectId) return null
  try {
    const raw = localStorage.getItem(`specrails-hub:spec-order:${projectId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

function saveSpecOrder(projectId: string | null, ids: number[] | null) {
  if (!projectId) return
  if (ids) {
    localStorage.setItem(`specrails-hub:spec-order:${projectId}`, JSON.stringify(ids))
  } else {
    localStorage.removeItem(`specrails-hub:spec-order:${projectId}`)
  }
}

interface PersistedRail {
  id: string
  label: string
  ticketIds: number[]
  mode: RailMode
  status: RailStatus
}

function loadRails(projectId: string | null): RailState[] | null {
  if (!projectId) return null
  try {
    const raw = localStorage.getItem(`specrails-hub:rails:${projectId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedRail[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
  } catch { return null }
}

function saveRails(projectId: string | null, rails: RailState[]) {
  if (!projectId) return
  localStorage.setItem(`specrails-hub:rails:${projectId}`, JSON.stringify(rails))
}

export default function DashboardPage() {
  const { activeProjectId } = useHub()
  const { tickets, isLoading, updateTicket, deleteTicket, createTicket } = useTickets()
  const { registerHandler, unregisterHandler, connectionStatus } = useSharedWebSocket()
  const [detailTicket, setDetailTicket] = useState<LocalTicket | null>(null)
  const [createTicketOpen, setCreateTicketOpen] = useState(false)

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<number | null>(null)
  const [specOrderIds, setSpecOrderIds] = useState<number[] | null>(() => loadSpecOrder(activeProjectId))
  const [rails, setRails] = useState<RailState[]>(() => loadRails(activeProjectId) ?? INITIAL_RAILS)

  // Reset spec order and rails when active project changes
  useEffect(() => {
    setSpecOrderIds(loadSpecOrder(activeProjectId))
    setRails(loadRails(activeProjectId) ?? INITIAL_RAILS)
  }, [activeProjectId])

  // ── Reconcile stale 'running' rails on mount / project switch / WS reconnect ─
  // If the user navigates away while a rail is running, the WS handler is
  // unregistered and the rail.job_completed event is missed. Also, after a
  // server restart the WS reconnects but stale 'running' state persists in
  // localStorage. On re-mount or reconnect, check the server for active rail
  // jobs and reset any stale 'running' rails.
  useEffect(() => {
    if (connectionStatus !== 'connected') return
    const currentRails = loadRails(activeProjectId) ?? INITIAL_RAILS
    const hasRunning = currentRails.some((r) => r.status === 'running')
    if (!hasRunning || !activeProjectId) return

    let cancelled = false
    fetch(`${getApiBase()}/rails`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { activeJobs?: Record<string, { jobId: string }> } | null) => {
        if (cancelled || !data) return
        const activeIndices = new Set(
          Object.keys(data.activeJobs ?? {}).map(Number)
        )
        setRails((prev) => {
          const next = prev.map((r) => {
            if (r.status !== 'running') return r
            const railIndex = parseInt(r.id.replace('rail-', ''), 10) - 1
            if (activeIndices.has(railIndex)) return r // still running on server
            // Rail was running but server has no active job → job finished while
            // we were away. Clear tickets so they reappear in Specs/Done based
            // on their current server-side status (useTickets re-fetches on mount).
            return { ...r, status: 'idle' as const, ticketIds: [] }
          })
          saveRails(activeProjectId, next)
          return next
        })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [activeProjectId, connectionStatus])

  // ── Auto-remove done tickets from rails ──────────────────────────────────────
  // When ticket status changes to 'done' (via WS ticket_updated, re-fetch, etc.),
  // strip those tickets from rails so they appear in Done Specs instead.
  useEffect(() => {
    const doneIds = new Set(tickets.filter((t) => t.status === 'done').map((t) => t.id))
    if (doneIds.size === 0) return
    setRails((prev) => {
      const next = prev.map((r) => {
        const filtered = r.ticketIds.filter((id) => !doneIds.has(id))
        if (filtered.length === r.ticketIds.length) return r
        return { ...r, ticketIds: filtered }
      })
      if (next.every((r, i) => r === prev[i])) return prev // no change
      saveRails(activeProjectId, next)
      return next
    })
  }, [tickets, activeProjectId])

  // Persist-aware spec order updater
  const updateSpecOrder = useCallback((updater: (prev: number[] | null) => number[] | null) => {
    setSpecOrderIds((prev) => {
      const next = updater(prev)
      saveSpecOrder(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

  // Persist-aware rails updater
  const updateRails = useCallback((updater: (prev: RailState[]) => RailState[]) => {
    setRails((prev) => {
      const next = updater(prev)
      saveRails(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

  // Dynamic container IDs for DnD (specs + all current rail IDs)
  const containerIds = useMemo(() => {
    const ids = new Set<string>(['specs'])
    for (const r of rails) ids.add(r.id)
    return ids
  }, [rails])

  // ── Add / Delete rails ──────────────────────────────────────────────────────
  const handleAddRail = useCallback(() => {
    // Find next available rail number
    const existingNums = rails.map((r) => parseInt(r.id.replace('rail-', ''), 10))
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    const newRail: RailState = {
      id: `rail-${nextNum}`,
      label: `Rail ${nextNum}`,
      ticketIds: [],
      mode: 'implement',
      status: 'idle',
    }
    updateRails((prev) => [...prev, newRail])
    toast.success(`Rail ${nextNum} added`)
  }, [rails, updateRails])

  const handleDeleteRail = useCallback((railId: string) => {
    const rail = rails.find((r) => r.id === railId)
    if (!rail || rail.status === 'running') return
    // Return tickets to specs
    if (rail.ticketIds.length > 0) {
      updateSpecOrder((prev) => {
        const current = prev ?? []
        return [...current, ...rail.ticketIds]
      })
    }
    updateRails((prev) => prev.filter((r) => r.id !== railId))
    toast.info(`${rail.label} removed`)
  }, [rails, updateRails, updateSpecOrder])

  const handleRenameRail = useCallback((railId: string, newLabel: string) => {
    updateRails((prev) => prev.map((r) => (r.id === railId ? { ...r, label: `Rail ${newLabel}` } : r)))
  }, [updateRails])

  // ── WebSocket: listen for rail.job_completed to reset rail status ────────────
  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  const handleRailWsMessage = useCallback((msg: unknown) => {
    const m = msg as { type?: string; projectId?: string; railIndex?: number; status?: string; ticketIds?: number[] }
    if (m.projectId !== activeProjectIdRef.current) return
    if (m.type === 'rail.job_completed') {
      const railId = `rail-${(m.railIndex ?? 0) + 1}`
      const completedTicketIds = new Set(m.ticketIds ?? [])

      if (m.status === 'completed' && completedTicketIds.size > 0) {
        // Clear completed tickets from the rail — they'll appear in Done Specs
        // via ticket_updated WS events that update the ticket list
        updateRails((prev) => prev.map((r) => {
          if (r.id !== railId) return r
          return { ...r, status: 'idle', ticketIds: r.ticketIds.filter((id) => !completedTicketIds.has(id)) }
        }))
      } else {
        updateRails((prev) => prev.map((r) => (r.id === railId ? { ...r, status: 'idle' } : r)))
      }

      const statusLabel = m.status === 'completed' ? 'completed' : m.status === 'failed' ? 'failed' : m.status ?? 'finished'
      toast.info(`Rail ${(m.railIndex ?? 0) + 1} ${statusLabel}`)
    }
  }, [updateRails])

  useEffect(() => {
    registerHandler('dashboard-rails', handleRailWsMessage)
    return () => unregisterHandler('dashboard-rails')
  }, [handleRailWsMessage, registerHandler, unregisterHandler])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // ── Derived maps ─────────────────────────────────────────────────────────────
  const ticketMap = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets])

  const allTicketLabels = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) for (const l of t.labels) set.add(l)
    return Array.from(set).sort()
  }, [tickets])

  const railTicketIds = useMemo(() => {
    const ids = new Set<number>()
    for (const r of rails) for (const id of r.ticketIds) ids.add(id)
    return ids
  }, [rails])

  // All spec-source tickets not in rails
  const allSpecTickets = useMemo(() => {
    return tickets.filter(
      (t) => (t.source === 'propose-spec' || t.source === 'product-backlog' || t.source === 'get-backlog-specs') && !railTicketIds.has(t.id),
    )
  }, [tickets, railTicketIds])

  // Active specs (not done) in user drag-order
  const specTickets = useMemo(() => {
    const filtered = allSpecTickets.filter((t) => t.status !== 'done')
    if (!specOrderIds) return filtered
    const map = new Map(filtered.map((t) => [t.id, t]))
    const result: LocalTicket[] = []
    for (const id of specOrderIds) {
      const t = map.get(id)
      if (t) result.push(t)
    }
    for (const t of filtered) {
      if (!specOrderIds.includes(t.id)) result.push(t)
    }
    return result
  }, [allSpecTickets, specOrderIds])

  // Done specs
  const doneSpecTickets = useMemo(() => {
    return allSpecTickets.filter((t) => t.status === 'done')
  }, [allSpecTickets])

  // ── DnD helpers ──────────────────────────────────────────────────────────────
  const findContainer = useCallback(
    (ticketId: number): string | null => {
      if (specTickets.some((t) => t.id === ticketId)) return 'specs'
      for (const rail of rails) {
        if (rail.ticketIds.includes(ticketId)) return rail.id
      }
      return null
    },
    [specTickets, rails],
  )

  /** Insert itemId before beforeId in arr; if beforeId not found, append. */
  function insertAt(arr: number[], itemId: number, beforeId: UniqueIdentifier): number[] {
    if (typeof beforeId === 'number' && arr.includes(beforeId)) {
      const idx = arr.indexOf(beforeId)
      const next = [...arr]
      next.splice(idx, 0, itemId)
      return next
    }
    return [...arr, itemId]
  }

  // ── DnD handlers ─────────────────────────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as number)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    const draggedId = active.id as number
    const overId = over.id

    const sourceContainer = findContainer(draggedId)
    if (!sourceContainer) return

    // Destination: if over a known container id, use it; else find the container of the hovered item
    const destContainer =
      typeof overId === 'string' && containerIds.has(overId)
        ? overId
        : (findContainer(overId as number) ?? sourceContainer)

    if (sourceContainer === destContainer) {
      // ── Reorder within same container ─────────────────────────────────────
      if (destContainer === 'specs') {
        const ids = specTickets.map((t) => t.id)
        const oldIdx = ids.indexOf(draggedId)
        const newIdx = ids.indexOf(overId as number)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          updateSpecOrder(() => arrayMove(ids, oldIdx, newIdx))
        }
      } else {
        updateRails((prev) =>
          prev.map((r) => {
            if (r.id !== destContainer) return r
            const oldIdx = r.ticketIds.indexOf(draggedId)
            const newIdx = r.ticketIds.indexOf(overId as number)
            if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
              return { ...r, ticketIds: arrayMove(r.ticketIds, oldIdx, newIdx) }
            }
            return r
          }),
        )
      }
    } else {
      // ── Move between containers ───────────────────────────────────────────
      if (sourceContainer === 'specs') {
        // Specs → Rail
        updateSpecOrder((prev) => (prev ?? specTickets.map((t) => t.id)).filter((id) => id !== draggedId))
        updateRails((prev) =>
          prev.map((r) => {
            if (r.id !== destContainer) return r
            return { ...r, ticketIds: insertAt(r.ticketIds, draggedId, overId) }
          }),
        )
      } else if (destContainer === 'specs') {
        // Rail → Specs
        updateRails((prev) =>
          prev.map((r) => {
            if (r.id !== sourceContainer) return r
            return { ...r, ticketIds: r.ticketIds.filter((id) => id !== draggedId) }
          }),
        )
        updateSpecOrder((prev) => {
          const current = prev ?? specTickets.map((t) => t.id)
          return insertAt(current, draggedId, overId)
        })
      } else {
        // Rail → Rail
        updateRails((prev) =>
          prev.map((r) => {
            if (r.id === sourceContainer) {
              return { ...r, ticketIds: r.ticketIds.filter((id) => id !== draggedId) }
            }
            if (r.id === destContainer) {
              return { ...r, ticketIds: insertAt(r.ticketIds, draggedId, overId) }
            }
            return r
          }),
        )
      }
    }
  }

  // ── Rail controls ─────────────────────────────────────────────────────────────
  function handleModeChange(railId: string, mode: RailMode) {
    updateRails((prev) => prev.map((r) => (r.id === railId ? { ...r, mode } : r)))
  }

  async function handleToggle(railId: string) {
    const rail = rails.find((r) => r.id === railId)
    if (!rail) return

    // Rail index: 'rail-1' → 0, 'rail-2' → 1, 'rail-3' → 2
    const railIndex = parseInt(railId.replace('rail-', ''), 10) - 1

    if (rail.status === 'running') {
      // Stop via rails API
      try {
        await fetch(`${getApiBase()}/rails/${railIndex}/stop`, { method: 'POST' })
        updateRails((prev) => prev.map((r) => (r.id === railId ? { ...r, status: 'idle' } : r)))
        toast.info(`${rail.label} stopped`)
      } catch {
        toast.error('Failed to stop rail')
      }
      return
    }

    if (rail.ticketIds.length === 0) return

    // Sync ticket assignments to server before launching
    try {
      await fetch(`${getApiBase()}/rails/${railIndex}/tickets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketIds: rail.ticketIds }),
      })
    } catch {
      toast.error('Failed to sync rail tickets')
      return
    }

    // Launch via rails API — server handles job tracking + rail.job_completed events
    try {
      const res = await fetch(`${getApiBase()}/rails/${railIndex}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: rail.mode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to launch' }))
        toast.error(data.error || 'Failed to launch rail')
        return
      }
      updateRails((prev) => prev.map((r) => (r.id === railId ? { ...r, status: 'running' } : r)))
      toast.success(`${rail.label} launched`, {
        description: `${rail.mode} with ${rail.ticketIds.length} spec${rail.ticketIds.length > 1 ? 's' : ''}`,
      })
    } catch {
      toast.error('Network error launching rail')
    }
  }

  const activeTicket = activeId !== null ? ticketMap.get(activeId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full overflow-hidden">
        {/* Left panel: Specs board */}
        <div className="flex-1 min-w-0 border-r border-border/40 flex flex-col overflow-hidden">
          <SpecsBoard tickets={specTickets} doneTickets={doneSpecTickets} isLoading={isLoading} onTicketClick={setDetailTicket} />
        </div>

        {/* Right panel: Rails board */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <RailsBoard
            rails={rails}
            ticketMap={ticketMap}
            onModeChange={handleModeChange}
            onToggle={handleToggle}
            onTicketClick={setDetailTicket}
            onAddRail={handleAddRail}
            onDeleteRail={handleDeleteRail}
            onRenameRail={handleRenameRail}
          />
        </div>
      </div>

      {/* Drag overlay — renders a floating ghost while dragging */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activeTicket ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-primary/40 bg-card/95 shadow-xl shadow-black/20 backdrop-blur-sm rotate-1 scale-[1.03] pointer-events-none">
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">#{activeTicket.id}</span>
            <span className="flex-1 text-sm truncate max-w-[240px]">{activeTicket.title}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Modals */}
      {detailTicket && (
        <TicketDetailModal
          ticket={detailTicket}
          allLabels={allTicketLabels}
          onClose={() => setDetailTicket(null)}
          onSave={updateTicket}
          onDelete={(id) => {
            deleteTicket(id)
            setDetailTicket(null)
          }}
        />
      )}
      <CreateTicketModal
        open={createTicketOpen}
        allLabels={allTicketLabels}
        onClose={() => setCreateTicketOpen(false)}
        onCreate={createTicket}
      />
    </DndContext>
  )
}
