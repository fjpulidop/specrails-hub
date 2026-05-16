import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { FileText, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from './ui/button'
import { SpecCard } from './SpecCard'
import { TicketPostitCard } from './TicketPostitCard'
import type { RailState } from './RailsBoard'
import { SpecLabelFilterStrip } from './SpecLabelFilterStrip'
import { SpecSortControl } from './SpecSortControl'
import type { SpecSortMode, SpecSortDir } from '../types/spec-sort'
import { ProposeSpecModal, type ExploreLaunchPayload } from './ProposeSpecModal'
import { ExploreSpecShell } from './explore-spec/ExploreSpecShell'
import { useMinimizedChats, usePendingRestore } from '../context/MinimizedChatsContext'
import { useHub } from '../hooks/useHub'
import { deleteAllAttachments } from '../lib/attachments'
import {
  loadActiveExploreSpec,
  saveActiveExploreSpec,
  clearActiveExploreSpec,
} from '../lib/active-explore-spec'
import type { LocalTicket } from '../types'

interface SpecsBoardProps {
  /** Pre-ordered, pre-filtered active tickets (ordering + filtering owned by parent). */
  tickets: LocalTicket[]
  /** Full unfiltered ticket list (for new-ticket detection in ProposeSpec modal). */
  allTickets?: LocalTicket[]
  /** Tickets that have been implemented (status=done). */
  doneTickets?: LocalTicket[]
  isLoading: boolean
  onTicketClick: (ticket: LocalTicket) => void
  onTicketCreated?: (ticket: LocalTicket) => void
  /** Delete handler — when provided, long-press on cards enters jiggle mode
   *  and reveals a per-card delete button. */
  onTicketDelete?: (ticketId: number) => void
  contractRefiningIds?: Set<number>
  sortMode?: SpecSortMode
  sortDir?: SpecSortDir
  onSortChange?: (mode: SpecSortMode, dir: SpecSortDir) => void
  /**
   * Current visual tier derived from the dashboard splitter. When `'postit'`,
   * the active spec list uses square `TicketPostitCard`s in an auto-fill
   * grid; `'card'` is the same component with denser CSS; `'row'` is the
   * default compact list.
   */
  tier?: 'row' | 'card' | 'postit'
  /** Rails available in the project — required for the postit Move-to-Rail popover. */
  rails?: RailState[]
  /** Handler invoked when the user picks a rail from the Move-to-Rail popover. */
  onMoveToRail?: (ticketId: number, railId: string) => void
}

interface DraftOverrides {
  title?: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  labels?: string[]
  acceptanceCriteria?: string[]
}

interface ExploreState {
  idea: string
  pendingSpecId: string
  initialAttachmentIds: string[]
  /** Model picked at Add Spec — only carried for fresh sessions. Restored
   *  sessions read the model off the persisted conversation row. */
  initialModel?: string
  resumeConversationId?: string
  /** Last-known draft title, surfaced as the shell's initial header label
   *  on restore so the title doesn't blank out across minimize/maximize
   *  cycles before WS catches up with a fresh `spec_draft.update`. */
  seedDraftTitle?: string
  /** Composer text the user was mid-typing before minimize. */
  seedComposerText?: string
  /** Manual draft field overrides (title/description/labels/etc) the user
   *  applied before minimize — replayed on remount so edits survive. */
  seedDraftOverrides?: DraftOverrides
  /** Edit-existing-ticket payload. When present the shell runs in edit mode
   *  (PATCH commit, ticket as Review baseline, edit-mode header). */
  editTicket?: {
    id: number
    title: string
    description: string
    labels: string[]
    priority: 'low' | 'medium' | 'high' | 'critical' | null
    acceptanceCriteria: string[]
  }
  contextScope?: import('../types/context-scope').ContextScope
}

/** Returns true when at least one draft field carries a meaningful value. */
function hasOverrides(o: DraftOverrides): boolean {
  if (o.title?.trim()) return true
  if (o.description?.trim()) return true
  if (o.priority && o.priority !== 'medium') return true
  if (o.labels && o.labels.length > 0) return true
  if (o.acceptanceCriteria && o.acceptanceCriteria.some((c) => c.trim())) return true
  return false
}

/** Compose a stable, human-readable label for the chip from the most
 *  meaningful source available. The `Untitled spec` fallback is reserved
 *  for true empty cases (no idea, no draft yet). */
function deriveExploreLabel(
  draftTitle: string | undefined | null,
  seedDraftTitle: string | undefined | null,
  ideaText: string,
): string {
  const live = draftTitle?.trim()
  if (live) return live
  const seed = seedDraftTitle?.trim()
  if (seed) return seed
  const idea = ideaText.trim()
  if (idea) return idea.length > 60 ? idea.slice(0, 57) + '…' : idea
  return 'Untitled spec'
}

export function SpecsBoard({
  tickets,
  allTickets,
  doneTickets = [],
  isLoading,
  onTicketClick,
  onTicketCreated,
  onTicketDelete,
  contractRefiningIds = new Set(),
  sortMode = 'default',
  sortDir = 'desc',
  onSortChange = () => {},
  tier = 'row',
  rails = [],
  onMoveToRail,
}: SpecsBoardProps) {
  const [jiggleMode, setJiggleMode] = useState(false)
  // Exit jiggle mode when clicking outside any card or pressing Escape.
  useEffect(() => {
    if (!jiggleMode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setJiggleMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jiggleMode])
  const handleBackgroundClick = useCallback(() => {
    if (jiggleMode) setJiggleMode(false)
  }, [jiggleMode])
  const enterJiggle = useCallback(() => setJiggleMode(true), [])
  const handleCardDelete = useCallback(
    (t: LocalTicket) => {
      if (onTicketDelete) onTicketDelete(t.id)
    },
    [onTicketDelete],
  )
  const [proposeOpen, setProposeOpen] = useState(false)
  const [explore, setExplore] = useState<ExploreState | null>(null)
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set())
  const { activeProjectId } = useHub()
  const { minimize } = useMinimizedChats()
  // SMASH: build lookup maps so each SpecCard renders the épica badge / child
  // pill without re-scanning the full ticket list per render.
  const epicChildCounts = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of allTickets ?? []) {
      if (t.parent_epic_id != null) m.set(t.parent_epic_id, (m.get(t.parent_epic_id) ?? 0) + 1)
    }
    return m
  }, [allTickets])
  const epicTitles = useMemo(() => {
    const m = new Map<number, string>()
    for (const t of allTickets ?? []) if (t.is_epic) m.set(t.id, t.title)
    return m
  }, [allTickets])
  const ticketsById = useMemo(() => {
    const m = new Map<number, LocalTicket>()
    for (const t of allTickets ?? []) m.set(t.id, t)
    return m
  }, [allTickets])
  const handleOpenParentEpic = useCallback((parentEpicId: number) => {
    const parent = ticketsById.get(parentEpicId)
    if (parent) onTicketClick(parent)
  }, [ticketsById, onTicketClick])

  useEffect(() => {
    setActiveLabels(new Set())
  }, [activeProjectId])

  const toggleLabel = useCallback((label: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const clearLabels = useCallback(() => {
    setActiveLabels(new Set())
  }, [])

  const filteredTickets = useMemo(() => {
    if (activeLabels.size === 0) return tickets
    return tickets.filter((t) => (t.labels ?? []).some((l) => activeLabels.has(l)))
  }, [tickets, activeLabels])

  const filteredDoneTickets = useMemo(() => {
    if (activeLabels.size === 0) return doneTickets
    return doneTickets.filter((t) => (t.labels ?? []).some((l) => activeLabels.has(l)))
  }, [doneTickets, activeLabels])

  // Snapshot of the live shell so we can auto-minimize the current session
  // before restoring another (mutual-exclusion: only one shell visible at
  // a time per project). ExploreSpecShell calls onStateChange to keep this
  // up to date with its conversationId, draft title, in-progress composer
  // text, and manual draft overrides. We mirror it as state too (not just
  // a ref) so the persistence effect can re-fire when these change.
  interface LiveShellSnapshot {
    conversationId: string | null
    draftTitle: string
    composerText: string
    draftOverrides: DraftOverrides
  }
  const [liveShell, setLiveShell] = useState<LiveShellSnapshot>({
    conversationId: null,
    draftTitle: '',
    composerText: '',
    draftOverrides: {},
  })
  const liveShellRef = useRef(liveShell)
  liveShellRef.current = liveShell
  const exploreRef = useRef(explore)
  exploreRef.current = explore

  const parkCurrentExplore = useCallback(() => {
    const cur = exploreRef.current
    if (!cur || !activeProjectId) return
    minimize({
      kind: 'explore-spec',
      projectId: activeProjectId,
      label: deriveExploreLabel(
        liveShellRef.current.draftTitle,
        cur.seedDraftTitle,
        cur.idea,
      ),
      restoreRoute: '/',
      params: {
        initialIdea: cur.idea,
        pendingSpecId: cur.pendingSpecId,
        initialAttachmentIds: cur.initialAttachmentIds,
        resumeConversationId:
          liveShellRef.current.conversationId ?? cur.resumeConversationId,
        composerText: liveShellRef.current.composerText || undefined,
        draftOverrides: hasOverrides(liveShellRef.current.draftOverrides)
          ? liveShellRef.current.draftOverrides
          : undefined,
        editTicket: cur.editTicket,
      },
    })
    // The chip's persistence takes over from here.
    clearActiveExploreSpec()
  }, [activeProjectId, minimize])

  // Restore live session on mount if one was open at refresh time. Scoped
  // to the active project so refreshing while on a different project
  // doesn't bring back the wrong session.
  useEffect(() => {
    if (!activeProjectId) return
    const persisted = loadActiveExploreSpec()
    if (!persisted || persisted.projectId !== activeProjectId) return
    setLiveShell({
      conversationId: persisted.resumeConversationId ?? null,
      draftTitle: persisted.seedDraftTitle ?? '',
      composerText: persisted.composerText ?? '',
      draftOverrides: persisted.draftOverrides ?? {},
    })
    setExplore({
      idea: persisted.idea,
      pendingSpecId: persisted.pendingSpecId,
      initialAttachmentIds: persisted.initialAttachmentIds,
      resumeConversationId: persisted.resumeConversationId,
      seedDraftTitle: persisted.seedDraftTitle,
      seedComposerText: persisted.composerText,
      seedDraftOverrides: persisted.draftOverrides,
    })
    // Eslint: only run on activeProjectId change. We deliberately don't
    // depend on `explore` — this is a one-shot restore on (re)mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  // Mirror the live session to localStorage so a refresh-while-open lands
  // the user back in the same conversation, with composer + draft edits.
  useEffect(() => {
    if (!explore || !activeProjectId) return
    saveActiveExploreSpec({
      projectId: activeProjectId,
      idea: explore.idea,
      pendingSpecId: explore.pendingSpecId,
      initialAttachmentIds: explore.initialAttachmentIds,
      resumeConversationId:
        liveShell.conversationId ?? explore.resumeConversationId,
      seedDraftTitle:
        liveShell.draftTitle || explore.seedDraftTitle,
      composerText: liveShell.composerText || undefined,
      draftOverrides: hasOverrides(liveShell.draftOverrides)
        ? liveShell.draftOverrides
        : undefined,
    })
  }, [explore, activeProjectId, liveShell])

  const handleExploreLaunch = useCallback((payload: ExploreLaunchPayload) => {
    // Mutual exclusion — opening a new explore session parks any current one.
    parkCurrentExplore()
    setLiveShell({ conversationId: null, draftTitle: '', composerText: '', draftOverrides: {} })
    setExplore({
      idea: payload.idea,
      pendingSpecId: payload.pendingSpecId,
      initialAttachmentIds: payload.initialAttachmentIds,
      initialModel: payload.model,
      contextScope: payload.contextScope,
    })
  }, [parkCurrentExplore])

  // Restore from a chip click → re-open the shell with the resumed
  // conversation. Carry forward the chip's label as `seedDraftTitle` so the
  // shell renders a meaningful header immediately, even before the
  // `spec_draft.update` WS event refreshes the draft. If a different
  // session is currently visible, park it as a chip first.
  usePendingRestore('explore-spec', activeProjectId, (chat) => {
    if (chat.kind !== 'explore-spec') return
    parkCurrentExplore()
    setLiveShell({
      conversationId: chat.params.resumeConversationId ?? null,
      draftTitle: chat.label,
      composerText: chat.params.composerText ?? '',
      draftOverrides: chat.params.draftOverrides ?? {},
    })
    setExplore({
      idea: chat.params.initialIdea,
      pendingSpecId: chat.params.pendingSpecId,
      initialAttachmentIds: chat.params.initialAttachmentIds,
      resumeConversationId: chat.params.resumeConversationId,
      seedDraftTitle: chat.label,
      seedComposerText: chat.params.composerText,
      seedDraftOverrides: chat.params.draftOverrides,
      editTicket: chat.params.editTicket,
    })
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      setProposeOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const { isOver, setNodeRef } = useDroppable({ id: 'specs' })
  const { isOver: isDoneOver, setNodeRef: setDoneNodeRef } = useDroppable({ id: 'done-specs' })

  // ── Resizable split divider ──────────────────────────────────────────────────
  const [splitRatio, setSplitRatio] = useState(0.65) // top panel gets 65%
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    setSplitRatio(Math.max(0.2, Math.min(0.85, ratio)))
  }, [])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  return (
    <div className="flex flex-col h-full" onClick={handleBackgroundClick}>
      {/* Header */}
      <div className="flex items-center px-4 h-12 border-b border-border/40 shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-accent-primary">Spec</h2>
          {tickets.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted/30 rounded-full px-1.5 py-0.5">
              {activeLabels.size > 0 ? `${filteredTickets.length}/${tickets.length}` : tickets.length}
            </span>
          )}
        </div>
        <SpecLabelFilterStrip
          tickets={tickets}
          active={activeLabels}
          onToggle={toggleLabel}
          onClear={clearLabels}
        />
        <SpecSortControl
          mode={sortMode}
          dir={sortDir}
          onChange={onSortChange}
          className="ml-auto"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 shrink-0"
          onClick={() => setProposeOpen(true)}
          data-tour="add-spec-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* Content area — always split between active and done */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Active specs — droppable zone */}
        <div
          ref={setNodeRef}
          data-tour="specs-list"
          style={{ flex: `0 0 ${splitRatio * 100}%` }}
          className={`overflow-y-auto px-4 py-3 space-y-1.5 transition-colors duration-150 ${isOver ? 'bg-primary/[0.04]' : ''}`}
        >
          {isLoading ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center py-16 text-center transition-colors ${
                isOver ? 'text-primary/50' : 'text-muted-foreground'
              }`}
            >
              <FileText className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm">
                {isOver
                  ? 'Drop here'
                  : tickets.length === 0
                    ? 'No specs yet'
                    : 'No specs match the active labels'}
              </p>
              {!isOver && tickets.length === 0 && (
                <p className="text-xs mt-1 opacity-60">Click "+ Add" to get started</p>
              )}
            </div>
          ) : tier === 'postit' && onMoveToRail ? (
            <SortableContext items={filteredTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div
                data-testid="specs-board-postit-grid"
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
              >
                {filteredTickets.map((ticket) => (
                  <TicketPostitCard
                    key={ticket.id}
                    ticket={ticket}
                    rails={rails}
                    onClick={onTicketClick}
                    onMoveToRail={onMoveToRail}
                    contractRefining={contractRefiningIds.has(ticket.id)}
                    epicChildrenCount={ticket.is_epic ? epicChildCounts.get(ticket.id) ?? 0 : undefined}
                    parentEpicTitle={ticket.parent_epic_id != null ? (epicTitles.get(ticket.parent_epic_id) ?? null) : null}
                    jiggleMode={jiggleMode}
                    onDelete={onTicketDelete ? handleCardDelete : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <SortableContext items={filteredTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div
                data-testid="specs-board-list"
                data-tier={tier}
                className={tier === 'card' ? 'grid gap-2' : 'space-y-1.5'}
                style={tier === 'card' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } : undefined}
              >
                {filteredTickets.map((ticket) => (
                  <SpecCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={onTicketClick}
                    contractRefining={contractRefiningIds.has(ticket.id)}
                    epicChildrenCount={ticket.is_epic ? epicChildCounts.get(ticket.id) ?? 0 : undefined}
                    parentEpicTitle={ticket.parent_epic_id != null ? (epicTitles.get(ticket.parent_epic_id) ?? null) : null}
                    onOpenParentEpic={handleOpenParentEpic}
                    jiggleMode={jiggleMode}
                    onLongPress={onTicketDelete ? enterJiggle : undefined}
                    onDelete={onTicketDelete ? handleCardDelete : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>

        {/* Resizable divider */}
        <div
          className="shrink-0 h-1.5 flex items-center justify-center cursor-row-resize group hover:bg-primary/[0.06] transition-colors select-none touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="w-8 h-0.5 rounded-full bg-border/60 group-hover:bg-primary/30 transition-colors" />
        </div>

        {/* Done specs section — droppable zone */}
        <div ref={setDoneNodeRef} className={`flex-1 min-h-0 flex flex-col overflow-hidden transition-colors duration-150 ${isDoneOver ? 'bg-emerald-500/[0.04]' : ''}`}>
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/30 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />
            <span className="text-[11px] font-medium text-muted-foreground">Done</span>
            <span className="text-[10px] text-muted-foreground/60 bg-muted/20 rounded-full px-1.5 py-0.5">
              {activeLabels.size > 0 ? `${filteredDoneTickets.length}/${doneTickets.length}` : doneTickets.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
            {filteredDoneTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <CheckCircle2 className="w-6 h-6 mb-2 opacity-15" />
                <p className="text-xs opacity-60">{isDoneOver ? 'Drop to mark as done' : 'No completed specs yet'}</p>
              </div>
            ) : (
              <SortableContext items={filteredDoneTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {filteredDoneTickets.map((ticket) => (
                  <SpecCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={onTicketClick}
                    contractRefining={contractRefiningIds.has(ticket.id)}
                    epicChildrenCount={ticket.is_epic ? epicChildCounts.get(ticket.id) ?? 0 : undefined}
                    parentEpicTitle={ticket.parent_epic_id != null ? (epicTitles.get(ticket.parent_epic_id) ?? null) : null}
                    onOpenParentEpic={handleOpenParentEpic}
                    jiggleMode={jiggleMode}
                    onLongPress={onTicketDelete ? enterJiggle : undefined}
                    onDelete={onTicketDelete ? handleCardDelete : undefined}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </div>
      </div>

      <ProposeSpecModal
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        tickets={allTickets ?? tickets}
        onExploreLaunch={handleExploreLaunch}
      />

      {explore && activeProjectId && (
        <ExploreSpecShell
          // Bind component identity to the session so restoring a different
          // chip remounts the shell from scratch — without this, internal
          // state (conversationId, useSpecDraftStream subscription, composer
          // refs) leaks across sessions.
          key={`${explore.pendingSpecId}:${explore.resumeConversationId ?? 'fresh'}`}
          initialIdea={explore.idea}
          pendingSpecId={explore.pendingSpecId}
          initialAttachmentIds={explore.initialAttachmentIds}
          initialModel={explore.initialModel}
          resumeConversationId={explore.resumeConversationId}
          seedDraftTitle={explore.seedDraftTitle}
          seedComposerText={explore.seedComposerText}
          seedDraftOverrides={explore.seedDraftOverrides}
          editTicket={explore.editTicket}
          contextScope={explore.contextScope}
          onStateChange={(s) => setLiveShell(s)}
          onClose={() => {
            // Discarding the overlay → wipe any attachments uploaded during
            // the session (matches Quick path's close-without-submit behaviour).
            deleteAllAttachments(explore.pendingSpecId).catch(() => {})
            setExplore(null)
            clearActiveExploreSpec()
          }}
          onMinimize={(conversationId, draftTitle) => {
            const live = liveShellRef.current
            minimize({
              kind: 'explore-spec',
              projectId: activeProjectId,
              label: deriveExploreLabel(draftTitle, explore.seedDraftTitle, explore.idea),
              restoreRoute: '/',
              params: {
                initialIdea: explore.idea,
                pendingSpecId: explore.pendingSpecId,
                initialAttachmentIds: explore.initialAttachmentIds,
                resumeConversationId: conversationId ?? undefined,
                composerText: live.composerText || undefined,
                draftOverrides: hasOverrides(live.draftOverrides) ? live.draftOverrides : undefined,
              },
            })
            setExplore(null)
            // Chip persistence takes over from here.
            clearActiveExploreSpec()
          }}
          onTicketCreated={(ticket) => {
            setExplore(null)
            clearActiveExploreSpec()
            onTicketCreated?.(ticket)
          }}
        />
      )}
    </div>
  )
}
