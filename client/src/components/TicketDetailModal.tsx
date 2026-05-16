import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatDistanceToNow } from 'date-fns'
import { X, Pencil, Trash2, Save, Plus, XCircle, MessageSquare, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog'
import { AttachmentsSection } from './AttachmentsSection'
import { TicketSpendingLine } from './TicketSpendingLine'
import { useMinimizedChats } from '../context/MinimizedChatsContext'
import { parseAcceptanceCriteria } from './explore-spec/acceptance-criteria'
import { useHub } from '../hooks/useHub'
import { SmashActions } from './specs-smash/SmashActions'
import { EpicBreadcrumb } from './specs-smash/EpicChildrenSection'
import { EpicFamilySidebar } from './specs-smash/EpicFamilySidebar'
import { MoveToRailPopover } from './MoveToRailPopover'
import type { RailState } from './RailsBoard'
import type { Attachment, LocalTicket, TicketPriority } from '../types'

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; className: string }[] = [
  { value: 'critical', label: 'Critical', className: 'text-red-400' },
  { value: 'high', label: 'High', className: 'text-orange-400' },
  { value: 'medium', label: 'Medium', className: 'text-yellow-400' },
  { value: 'low', label: 'Low', className: 'text-slate-400' },
]

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Created manually',
  'product-backlog': 'From product backlog',
  'propose-spec': 'From spec proposal',
  'get-backlog-specs': 'From backlog specs',
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface TicketDetailModalProps {
  ticket: LocalTicket
  allLabels: string[]
  /** All tickets in current project — used to resolve épica children / parent. */
  allTickets?: LocalTicket[]
  onClose: () => void
  /** Navigation hook: open a different ticket inside the same modal stack. */
  onOpenTicket?: (ticketId: number) => void
  onSave: (ticketId: number, fields: Partial<Pick<LocalTicket, 'title' | 'description' | 'status' | 'priority' | 'labels'>>) => Promise<boolean>
  onDelete: (ticketId: number) => void
  /** Rails available in the project — drives the Move-to-Rail popover. */
  rails?: RailState[]
  /** Move-to-Rail handler — same path as the dashboard postit card. */
  onMoveToRail?: (ticketId: number, railId: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TicketDetailModal({
  ticket,
  allLabels,
  allTickets,
  onClose,
  onOpenTicket,
  onSave,
  onDelete,
  rails,
  onMoveToRail,
}: TicketDetailModalProps) {
  const { activeProjectId } = useHub()
  // Feature flag for SMASH. Server gates with `SPECRAILS_SMASH=0` returning
  // 409 from endpoints; the UI optimistically shows the affordance and lets
  // the server reject if disabled. A future pass can hydrate from GET /state.
  const smashFlagOn = true
  const childrenList = useMemo(
    () => (allTickets ?? []).filter((t) => t.parent_epic_id === ticket.id),
    [allTickets, ticket.id],
  )
  const epicParent = useMemo(() => {
    if (ticket.parent_epic_id == null) return null
    return (allTickets ?? []).find((t) => t.id === ticket.parent_epic_id) ?? null
  }, [allTickets, ticket.parent_epic_id])
  const totalEpicSiblings = useMemo(() => {
    if (!epicParent) return 0
    return (allTickets ?? []).filter((t) => t.parent_epic_id === epicParent.id).length
  }, [allTickets, epicParent])
  // Editable state
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority ?? 'medium')
  const [labels, setLabels] = useState<string[]>([...(ticket.labels ?? [])])

  // Edit mode toggles
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [showLabelInput, setShowLabelInput] = useState(false)

  // Confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Attachments (synced from ticket prop)
  const [attachments, setAttachments] = useState<Attachment[]>(ticket.attachments ?? [])
  useEffect(() => { setAttachments(ticket.attachments ?? []) }, [ticket.attachments, ticket.id])

  const titleInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  // Track if anything changed
  const isDirty = useMemo(() => {
    return (
      title !== ticket.title ||
      description !== ticket.description ||
      priority !== ticket.priority ||
      JSON.stringify(labels) !== JSON.stringify(ticket.labels)
    )
  }, [title, description, priority, labels, ticket])

  // Focus on edit start
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (editingDescription) {
      const el = descTextareaRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.value.length
      }
    }
  }, [editingDescription])

  useEffect(() => {
    if (showLabelInput) labelInputRef.current?.focus()
  }, [showLabelInput])

  // Close on Escape (unless editing or AI overlay is open — overlay owns Esc).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !editingTitle && !editingDescription && !showDeleteConfirm) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, editingTitle, editingDescription, showDeleteConfirm])

  // Label autocomplete suggestions
  const labelSuggestions = useMemo(() => {
    if (!labelInput.trim()) return []
    const q = labelInput.toLowerCase()
    return allLabels.filter(
      (l) => l.toLowerCase().includes(q) && !labels.includes(l)
    ).slice(0, 5)
  }, [labelInput, allLabels, labels])

  const addLabel = useCallback((label: string) => {
    const trimmed = label.trim()
    if (trimmed && !labels.includes(trimmed)) {
      setLabels((prev) => [...prev, trimmed])
    }
    setLabelInput('')
  }, [labels])

  const removeLabel = useCallback((label: string) => {
    setLabels((prev) => prev.filter((l) => l !== label))
  }, [])

  const handleSave = useCallback(async () => {
    const changes: Partial<Pick<LocalTicket, 'title' | 'description' | 'priority' | 'labels'>> = {}
    if (title !== ticket.title) changes.title = title
    if (description !== ticket.description) changes.description = description
    if (priority !== ticket.priority) changes.priority = priority
    if (JSON.stringify(labels) !== JSON.stringify(ticket.labels)) changes.labels = labels

    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }

    setSaving(true)
    const ok = await onSave(ticket.id, changes)
    setSaving(false)

    if (ok) {
      toast.success('Ticket updated')
      onClose()
    } else {
      toast.error('Failed to update ticket')
    }
  }, [title, description, priority, labels, ticket, onSave, onClose])

  const handleDelete = useCallback(() => {
    onDelete(ticket.id)
    setShowDeleteConfirm(false)
    onClose()
  }, [ticket.id, onDelete, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-5xl m-4 rounded-xl glass-card border border-border/30 flex flex-col animate-in fade-in zoom-in-95 duration-200 h-[90vh]">
        {/* Épica breadcrumb (children only) */}
        {epicParent && (
          <div className="px-5 pt-3">
            <EpicBreadcrumb
              epic={epicParent}
              childExecutionOrder={ticket.execution_order ?? null}
              totalChildren={totalEpicSiblings}
              onOpenEpic={() => onOpenTicket?.(epicParent.id)}
            />
          </div>
        )}
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/30">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTitle(false)
                  if (e.key === 'Escape') { setTitle(ticket.title); setEditingTitle(false) }
                }}
                className="w-full bg-transparent border-b border-accent-primary/50 text-sm font-semibold text-foreground outline-none pb-0.5"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="group flex items-center gap-1.5 text-left w-full"
              >
                <h2 className="text-sm font-semibold text-foreground truncate">{title || 'Untitled'}</h2>
                <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-foreground font-mono">#{ticket.id}</span>
            </div>
            <TicketSpendingLine ticketId={ticket.id} />
          </div>

          {activeProjectId && (
            <div className="shrink-0">
              <SmashActions
                ticket={ticket}
                projectId={activeProjectId}
                featureFlagOn={smashFlagOn}
                childrenCount={childrenList.length}
              />
            </div>
          )}

          <ContinueEditingButton ticket={ticket} title={title} description={description} priority={priority} labels={labels} onClose={onClose} />

          {rails && onMoveToRail && (
            <MoveToRailButton ticket={ticket} rails={rails} onMoveToRail={onMoveToRail} />
          )}

          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col sm:flex-row h-full">
            {/* Main content */}
            <div className="flex-1 min-w-0 px-5 py-4 space-y-4 flex flex-col">
              {/* AI Edit overlay renders fullscreen above this modal — see end of component. */}

              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    Description
                  </span>
                  {!editingDescription && (
                    <button
                      type="button"
                      onClick={() => setEditingDescription(true)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      Edit
                    </button>
                  )}
                </div>

                {editingDescription ? (
                  <div className="space-y-1.5 flex-1 flex flex-col">
                    <textarea
                      ref={descTextareaRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full flex-1 rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none min-h-[300px]"
                      placeholder="Markdown description..."
                    />
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => setEditingDescription(false)}
                      >
                        Done editing
                      </Button>
                      <span className="text-[9px] text-muted-foreground">Supports markdown</span>
                    </div>
                  </div>
                ) : description ? (
                  <DescriptionRender
                    description={description}
                    onEdit={() => setEditingDescription(true)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDescription(true)}
                    className="w-full rounded-lg border border-dashed border-border/40 bg-muted/10 px-3 py-4 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors text-center"
                  >
                    Add a description...
                  </button>
                )}
              </div>

              {/* Attachments / Resources */}
              <AttachmentsSection
                ticketKey={ticket.id}
                attachments={attachments}
                onChange={setAttachments}
              />

              {/* Prerequisites */}
              {ticket.prerequisites && ticket.prerequisites.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Prerequisites
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ticket.prerequisites.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-accent/60 text-foreground/70"
                      >
                        #{id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="sm:w-48 sm:border-l border-t sm:border-t-0 border-border/30 px-4 py-4 space-y-4 bg-muted/5">
              {/* Priority selector */}
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Priority
                </span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full h-7 rounded border border-border bg-input px-2 text-xs text-foreground"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Labels */}
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Labels
                </span>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/60 text-foreground/70 group"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => removeLabel(label)}
                        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XCircle className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                {showLabelInput ? (
                  <div className="relative">
                    <input
                      ref={labelInputRef}
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && labelInput.trim()) {
                          e.preventDefault()
                          addLabel(labelInput)
                        }
                        if (e.key === 'Escape') {
                          setShowLabelInput(false)
                          setLabelInput('')
                        }
                      }}
                      onBlur={() => {
                        if (labelInput.trim()) addLabel(labelInput)
                        setShowLabelInput(false)
                        setLabelInput('')
                      }}
                      placeholder="Add label..."
                      className="w-full h-6 rounded border border-border bg-input px-2 text-[10px] text-foreground placeholder:text-muted-foreground"
                    />
                    {labelSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-0.5 rounded border border-border/50 bg-popover shadow-lg z-10 py-0.5">
                        {labelSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              addLabel(suggestion)
                            }}
                            className="w-full text-left px-2 py-1 text-[10px] hover:bg-accent/50 text-foreground/80"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLabelInput(true)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Add label
                  </button>
                )}
              </div>

              {/* SMASH family — list of Sub-Specs (Epic view) or parent + siblings (child view) */}
              <EpicFamilySidebar
                ticket={ticket}
                allTickets={allTickets ?? []}
                onOpenTicket={(id) => onOpenTicket?.(id)}
              />

              {/* Continue Editing lives in the modal header — see top of component. */}

              {/* Metadata */}
              {ticket.metadata?.effort_level && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Effort
                  </span>
                  <span className="text-xs text-foreground/70">{ticket.metadata.effort_level}</span>
                </div>
              )}

              {ticket.assignee && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Assignee
                  </span>
                  <span className="text-xs text-foreground/70">{ticket.assignee}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/30">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>Created {formatRelTime(ticket.created_at)}</span>
            <span>Updated {formatRelTime(ticket.updated_at)}</span>
            {ticket.source && (
              <span className="bg-muted/30 rounded px-1.5 py-0.5">
                {SOURCE_LABELS[ticket.source] ?? ticket.source}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
            {isDirty && (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSave}
                disabled={saving || !title.trim()}
              >
                <Save className="w-3 h-3 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete ticket</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">#{ticket.id} {ticket.title}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatRelTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}


// ─── ContinueEditingButton ─────────────────────────────────────────────────

interface ContinueEditingButtonProps {
  ticket: LocalTicket
  /** Current modal-edited values, in case the user has unsaved tweaks. */
  title: string
  description: string
  priority: TicketPriority
  labels: string[]
  onClose: () => void
}

const EDITABLE_STATUSES = new Set(['draft', 'todo', 'backlog'])

/**
 * Single entry point for "open this ticket in Explore Spec to refine it".
 *
 * - draft + `origin_conversation_id`: resume the existing Explore conversation
 *   (preserves prior chat history). Same behaviour as the legacy `Continue
 *   Explore` button this component replaces.
 * - draft (no conv) / todo / backlog: launch a fresh Explore session in
 *   edit-existing-ticket mode (commits via PATCH; Review baseline = ticket).
 *
 * Hidden for `in_progress`, `done`, `cancelled`.
 * See openspec/changes/replace-ai-edit-with-continue-editing/design.md D1+D8.
 */
function ContinueEditingButton({ ticket, title, description, priority, labels, onClose }: ContinueEditingButtonProps) {
  const { triggerResume } = useMinimizedChats()
  const { activeProjectId } = useHub()
  if (!EDITABLE_STATUSES.has(ticket.status)) return null
  const handleClick = () => {
    if (!activeProjectId) return
    // Unified Continue Editing: ALL editable tickets get the editTicket
    // payload (draft pane pre-seeded + Review with real diff + PATCH commit).
    // If the ticket carries origin_conversation_id, also resume that
    // conversation so prior chat history is visible. The shell does NOT
    // auto-send a turn — the user types the first refinement.
    const { body, criteria } = parseAcceptanceCriteria(description)
    triggerResume({
      kind: 'explore-spec',
      projectId: activeProjectId,
      label: title || ticket.title || `Ticket #${ticket.id}`,
      restoreRoute: '/',
      params: {
        initialIdea: '',
        pendingSpecId: '',
        initialAttachmentIds: [],
        resumeConversationId: ticket.origin_conversation_id ?? undefined,
        editTicket: {
          id: ticket.id,
          title,
          description: body,
          labels,
          priority,
          acceptanceCriteria: criteria,
        },
      },
    })
    onClose()
  }
  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleClick}
      className="shrink-0 mr-2"
      data-testid="continue-editing"
    >
      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
      Continue Editing
    </Button>
  )
}

// ─── MoveToRailButton ───────────────────────────────────────────────────────

interface MoveToRailButtonProps {
  ticket: LocalTicket
  rails: RailState[]
  onMoveToRail: (ticketId: number, railId: string) => void
}

/**
 * Header button next to "Continue Editing" that opens the shared
 * `MoveToRailPopover`. Selecting a rail dispatches the same
 * `onMoveToRail(ticketId, railId)` handler used by the dashboard postit
 * card — so drag-and-drop, postit popover, and modal all converge on one
 * code path.
 */
function MoveToRailButton({ ticket, rails, onMoveToRail }: MoveToRailButtonProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        className="shrink-0 mr-2 gap-1.5 border-accent-info/30 text-accent-info hover:bg-accent-info/10 hover:text-accent-info"
        data-testid="modal-move-to-rail"
        onClick={() => {
          if (!buttonRef.current) return
          setAnchor(buttonRef.current.getBoundingClientRect())
        }}
      >
        Move to Rail
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </Button>
      {anchor && (
        <MoveToRailPopover
          rails={rails}
          anchorRect={anchor}
          onMoveToRail={(railId) => onMoveToRail(ticket.id, railId)}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}

// ─── Contract Layer disclosure ──────────────────────────────────────────────

const CONTRACT_LAYER_SEPARATOR = '\n\n---\n\n## Contract Layer\n\n'

function splitDescriptionAtContractLayer(description: string): { user: string; contract: string | null } {
  const idx = description.indexOf(CONTRACT_LAYER_SEPARATOR)
  if (idx < 0) return { user: description, contract: null }
  return {
    user: description.slice(0, idx),
    contract: description.slice(idx + CONTRACT_LAYER_SEPARATOR.length),
  }
}

function countContractSubsections(contract: string): number {
  const subs = ['### Naming Contract', '### Data Shapes', '### State Machine', '### Invariants', '### File Touch List']
  let count = 0
  for (const sub of subs) {
    const start = contract.indexOf(sub)
    if (start < 0) continue
    const tail = contract.slice(start + sub.length)
    const naIdx = tail.indexOf('N/A — model did not produce items')
    const nextHeading = tail.indexOf('### ')
    if (naIdx >= 0 && (nextHeading < 0 || naIdx < nextHeading)) continue
    count++
  }
  return count
}

interface DescriptionRenderProps {
  description: string
  onEdit: () => void
}

function DescriptionRender({ description, onEdit }: DescriptionRenderProps) {
  const { user, contract } = splitDescriptionAtContractLayer(description)
  const userPart = user || description
  return (
    <div
      className="flex-1 rounded-lg bg-muted/20 px-3 py-2 overflow-y-auto transition-colors"
      onClick={(e) => {
        // Don't enter edit mode when interacting with the disclosure
        if ((e.target as HTMLElement).closest('details, summary')) return
        onEdit()
      }}
      role="button"
      style={{ cursor: 'pointer' }}
    >
      <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:text-cyan-300 prose-code:text-[10px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded text-foreground/80 text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{userPart}</ReactMarkdown>
      </div>
      {contract && (
        <details
          data-testid="contract-layer-disclosure"
          className="mt-3 rounded-md border border-border/40 bg-muted/10 px-2 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <summary className="cursor-pointer text-[10px] font-medium text-foreground/80 select-none flex items-center gap-2">
            Contract Layer
            <span className="rounded-full bg-muted/40 px-1.5 text-[9px] text-foreground/60">
              {countContractSubsections(contract)}/5 populated
            </span>
          </summary>
          <div className="mt-2 prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:text-cyan-300 prose-code:text-[10px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded text-foreground/80 text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{contract}</ReactMarkdown>
          </div>
        </details>
      )}
    </div>
  )
}

