import { useState, useMemo, useCallback, useEffect } from 'react'
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
import type { LocalTicket } from '../types'
import type { RailMode } from '../components/RailControls'

const CONTAINER_IDS = new Set<string>(['specs', 'rail-1', 'rail-2', 'rail-3'])

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

export default function DashboardPage() {
  const { activeProjectId } = useHub()
  const { tickets, isLoading, updateTicket, deleteTicket, createTicket } = useTickets()
  const [detailTicket, setDetailTicket] = useState<LocalTicket | null>(null)
  const [createTicketOpen, setCreateTicketOpen] = useState(false)

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<number | null>(null)
  const [specOrderIds, setSpecOrderIds] = useState<number[] | null>(() => loadSpecOrder(activeProjectId))
  const [rails, setRails] = useState<RailState[]>(INITIAL_RAILS)

  // Reset spec order when active project changes
  useEffect(() => {
    setSpecOrderIds(loadSpecOrder(activeProjectId))
  }, [activeProjectId])

  // Persist-aware spec order updater
  const updateSpecOrder = useCallback((updater: (prev: number[] | null) => number[] | null) => {
    setSpecOrderIds((prev) => {
      const next = updater(prev)
      saveSpecOrder(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

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

  // Spec tickets: source-filtered + not currently in any rail, in user drag-order
  const specTickets = useMemo(() => {
    const filtered = tickets.filter(
      (t) => (t.source === 'propose-spec' || t.source === 'product-backlog' || t.source === 'get-backlog-specs') && !railTicketIds.has(t.id),
    )
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
  }, [tickets, railTicketIds, specOrderIds])

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
      typeof overId === 'string' && CONTAINER_IDS.has(overId)
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
        setRails((prev) =>
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
        setRails((prev) =>
          prev.map((r) => {
            if (r.id !== destContainer) return r
            return { ...r, ticketIds: insertAt(r.ticketIds, draggedId, overId) }
          }),
        )
      } else if (destContainer === 'specs') {
        // Rail → Specs
        setRails((prev) =>
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
        setRails((prev) =>
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
    setRails((prev) => prev.map((r) => (r.id === railId ? { ...r, mode } : r)))
  }

  async function handleToggle(railId: string) {
    const rail = rails.find((r) => r.id === railId)
    if (!rail) return

    if (rail.status === 'running') {
      // Stop: just reset UI state (job cancellation is done from the Jobs page)
      setRails((prev) => prev.map((r) => (r.id === railId ? { ...r, status: 'idle' } : r)))
      return
    }

    if (rail.ticketIds.length === 0) return

    // Build the command: /specrails:implement or /specrails:batch-implement with ticket IDs
    const ticketArgs = rail.ticketIds.map((id) => `#${id}`).join(' ')
    const command = rail.mode === 'batch-implement'
      ? `/specrails:batch-implement ${ticketArgs}`
      : `/specrails:implement ${ticketArgs}`

    try {
      const res = await fetch(`${getApiBase()}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to launch' }))
        toast.error(data.error || 'Failed to launch rail')
        return
      }
      setRails((prev) => prev.map((r) => (r.id === railId ? { ...r, status: 'running' } : r)))
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
          <SpecsBoard tickets={specTickets} isLoading={isLoading} onTicketClick={setDetailTicket} />
        </div>

        {/* Right panel: Rails board */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <RailsBoard
            rails={rails}
            ticketMap={ticketMap}
            onModeChange={handleModeChange}
            onToggle={handleToggle}
            onTicketClick={setDetailTicket}
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
