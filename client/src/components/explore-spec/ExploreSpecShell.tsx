import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Send, Loader2, Minus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { useChatContext, type ChatConversation } from '../../hooks/useChat'
import { useSpecDraftStream } from '../../hooks/useSpecDraftStream'
import { useHub } from '../../hooks/useHub'
import { getApiBase } from '../../lib/api'
import { API_ORIGIN } from '../../lib/origin'
import { markSpecGenInFlight, unmarkSpecGenInFlight } from '../../lib/spec-gen-suppression'
import { RichAttachmentEditor, type RichAttachmentEditorHandle } from '../RichAttachmentEditor'
import { SpecDraftPanel } from './SpecDraftPanel'
import type { LocalTicket, Attachment } from '../../types'

function isMacTauriOverlay(): boolean {
  if (typeof window === 'undefined') return false
  if (!('__TAURI_INTERNALS__' in window)) return false
  return /mac/i.test(navigator.platform)
}

export interface ExploreSpecShellProps {
  /** The user's initial idea typed in the Add Spec modal. */
  initialIdea: string
  /** Pending spec id used as the attachments storage key. Stable for the
   *  lifetime of the overlay; on Create Spec the server migrates the
   *  directory to the real ticket id. */
  pendingSpecId: string
  /** Attachment ids that were already uploaded in the Add Spec modal. */
  initialAttachmentIds: string[]
  /** Model picked at Add Spec. Used to seed the conversation's `model`
   *  column on first turn. Locked for the conversation lifetime — no UI
   *  in this shell mutates it. Ignored when `resumeConversationId` is
   *  set (the persisted conversation already carries its own model). */
  initialModel?: string
  /** When set, skip the `/specrails:explore-spec` bootstrap turn and resume
   *  from an existing conversation id. Used by the minimize-to-dock restore
   *  path so the user picks up where they left off. */
  resumeConversationId?: string
  /** Last-known draft title from the chip — surfaced in the header before
   *  the WS-driven `useSpecDraftStream` catches up on remount, so the
   *  shell never visibly forgets the title across minimize cycles. */
  seedDraftTitle?: string
  /** Last-known composer text — repopulates the textarea on remount so a
   *  half-typed reply isn't lost across minimize/restore cycles. */
  seedComposerText?: string
  /** Manual draft field overrides accumulated before minimize (title,
   *  description, labels, priority, acceptanceCriteria). Replayed via
   *  setField on remount so user edits survive across cycles. */
  seedDraftOverrides?: Partial<{
    title: string
    description: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    labels: string[]
    acceptanceCriteria: string[]
  }>
  onClose: () => void
  /** Optional minimize affordance — when present a `—` button in the header
   *  fires this callback. Receives the current conversation id so the caller
   *  can park it in the dock and resume later. */
  onMinimize?: (conversationId: string | null, draftTitle: string) => void
  /** Push live shell state up to the parent so it can drive programmatic
   *  auto-minimize (e.g. when another minimized spec is restored and this
   *  one needs to be parked instead of unmounted). Fires on changes only. */
  onStateChange?: (state: {
    conversationId: string | null
    draftTitle: string
    composerText: string
    draftOverrides: Partial<{
      title: string
      description: string
      priority: 'low' | 'medium' | 'high' | 'critical'
      labels: string[]
      acceptanceCriteria: string[]
    }>
  }) => void
  onTicketCreated?: (ticket: LocalTicket) => void
}

export function ExploreSpecShell({
  initialIdea,
  pendingSpecId,
  initialAttachmentIds,
  initialModel,
  resumeConversationId,
  seedDraftTitle,
  seedComposerText,
  seedDraftOverrides,
  onClose,
  onMinimize,
  onStateChange,
  onTicketCreated,
}: ExploreSpecShellProps) {
  const chat = useChatContext()
  const { activeProjectId } = useHub()
  const [conversationId, setConversationId] = useState<string | null>(
    resumeConversationId ?? null,
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [hasComposerText, setHasComposerText] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [accumulatedAttachments, setAccumulatedAttachments] = useState<Attachment[]>([])
  const previousFocusRef = useRef<Element | null>(null)
  const startedRef = useRef(false)
  const composerRef = useRef<RichAttachmentEditorHandle | null>(null)

  // Refresh the list of attachments accumulated in pendingSpecId/. Files
  // added in the Add Spec modal AND in any prior conversation turn live in
  // the same dir; the server returns the union.
  const refreshAttachments = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const res = await fetch(`${API_ORIGIN}/api/projects/${activeProjectId}/tickets/${pendingSpecId}/attachments`)
      if (!res.ok) return
      const data = await res.json() as { attachments: Attachment[] }
      setAccumulatedAttachments(data.attachments)
    } catch { /* ignore */ }
  }, [activeProjectId, pendingSpecId])

  useEffect(() => {
    void refreshAttachments()
  }, [refreshAttachments])

  // Re-fetch when the conversation becomes ready: by then the modal handoff
  // has flushed and any files uploaded in the Add Spec step are guaranteed
  // to be on disk under pendingSpecId/. Cheap belt-and-braces against any
  // mount-time race with the upload's fs sync.
  useEffect(() => {
    if (!conversationId) return
    void refreshAttachments()
  }, [conversationId, refreshAttachments])

  // Bootstrap: start the conversation with the slash-command prefix + idea +
  // initial attachments (folded into Claude's first turn as <user-attachment>
  // text blocks by the server). Skipped when resuming a previously-minimized
  // session — the conversationId is already set from props.
  useEffect(() => {
    if (startedRef.current) return
    if (resumeConversationId) {
      startedRef.current = true
      return
    }
    if (!chat) return
    startedRef.current = true
    const prompt = `/specrails:explore-spec\n\n${initialIdea.trim()}`
    const attachments = initialAttachmentIds.length > 0
      ? { ticketKey: pendingSpecId, ids: initialAttachmentIds }
      : undefined
    void chat.startWithMessage(prompt, { lightweight: true, maxTurns: 20, attachments }, initialModel).then((id) => {
      if (id) setConversationId(id)
    })
  }, [chat, initialIdea, pendingSpecId, initialAttachmentIds, resumeConversationId, initialModel])

  // Focus restoration on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement
    return () => {
      const el = previousFocusRef.current
      if (el && el instanceof HTMLElement) el.focus()
    }
  }, [])

  // Rehydrate composer text from a parked session, once on mount.
  const composerSeededRef = useRef(false)
  useEffect(() => {
    if (composerSeededRef.current) return
    if (!seedComposerText) return
    // Defer one tick so RichAttachmentEditor's contenteditable is ready.
    const t = setTimeout(() => {
      composerRef.current?.setPlainText(seedComposerText)
      setHasComposerText(seedComposerText.trim().length > 0)
      composerSeededRef.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [seedComposerText])

  // Active conversation snapshot (live messages + streaming state)
  const conversation: ChatConversation | undefined = useMemo(() => {
    if (!chat || !conversationId) return undefined
    return chat.conversations.find((c) => c.id === conversationId)
  }, [chat, conversationId])

  const turnCount = conversation?.messages.length ?? 0

  const {
    draft,
    ready,
    chips,
    lastChangedFields,
    setField,
    clearManualOverrides,
  } = useSpecDraftStream(conversationId)

  // Replay parked draft overrides into the stream so user manual edits
  // survive minimize/restore. CRITICAL: only replay fields with meaningful
  // (non-default) values — `setField` marks each replayed field as a
  // manual override, which blocks Claude's WS pushes and the hydration
  // fetch from filling them. Replaying empty defaults would cause
  // description / labels / acceptanceCriteria to permanently appear blank
  // even when the server has the real values from Claude. One-shot per
  // shell instance.
  const draftSeededRef = useRef(false)
  useEffect(() => {
    if (draftSeededRef.current) return
    if (!seedDraftOverrides) return
    draftSeededRef.current = true
    const o = seedDraftOverrides
    if (o.title && o.title.trim()) setField('title', o.title)
    if (o.description && o.description.trim()) setField('description', o.description)
    if (o.priority && o.priority !== 'medium') setField('priority', o.priority)
    if (o.labels && o.labels.length > 0) setField('labels', o.labels)
    const criteria = o.acceptanceCriteria?.filter((c) => c.trim().length > 0) ?? []
    if (criteria.length > 0) setField('acceptanceCriteria', criteria)
  }, [seedDraftOverrides, setField])

  const requestClose = useCallback(() => {
    // Only confirm when the conversation has progressed beyond the initial user idea
    const beyondIntro = turnCount > 1
    if (beyondIntro) {
      setConfirmDiscard(true)
    } else {
      onClose()
    }
  }, [turnCount, onClose])

  const sendComposer = useCallback(async (text: string) => {
    const v = text.trim()
    if (!v || !conversation || conversation.isStreaming || !chat) return
    // Pull current attachments off the editor (rich editor lets the user
    // drop / paste files mid-conversation; each turn carries its own list).
    const attIds = composerRef.current?.getAttachmentIds() ?? []
    composerRef.current?.clear()
    setHasComposerText(false)
    setComposerText('')
    clearManualOverrides()
    if (attIds.length > 0) {
      // New uploads went into pendingSpecId/, so refresh the accumulated list
      // so the user sees them in the Draft panel right away.
      void refreshAttachments()
    }
    await chat.sendMessage(conversation.id, v, {
      lightweight: true,
      maxTurns: 20,
      attachments: attIds.length > 0 ? { ticketKey: pendingSpecId, ids: attIds } : undefined,
    })
  }, [conversation, chat, clearManualOverrides, pendingSpecId, refreshAttachments])

  const submitComposer = useCallback(() => {
    const text = composerRef.current?.getPlainText().trim() ?? ''
    if (text) void sendComposer(text)
  }, [sendComposer])

  const handleCreate = useCallback(async () => {
    if (isCreating) return
    if (!draft.title.trim() || !activeProjectId) return
    setIsCreating(true)
    // Suppress useTickets' generic "New ticket: ..." toast so only this
    // shell's richer "Spec created — #N TITLE" toast surfaces. Mirrors the
    // Quick-mode flow's behaviour (handled by useSpecGenTracker).
    markSpecGenInFlight(activeProjectId)
    try {
      const res = await fetch(`${getApiBase()}/tickets/from-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description,
          labels: draft.labels,
          priority: draft.priority,
          acceptanceCriteria: draft.acceptanceCriteria.filter((c) => c.trim().length > 0),
          // Server migrates pendingSpecId/<id>/* → ticket/<realId>/* so the
          // attachments uploaded during the conversation end up bound to the
          // freshly-created ticket.
          pendingSpecId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error || 'Failed to create spec')
        return
      }
      const data = await res.json() as { ticket: LocalTicket }
      toast.success(`Spec created — #${data.ticket.id} ${data.ticket.title}`)
      onTicketCreated?.(data.ticket)
      onClose()
    } catch (err) {
      toast.error('Network error creating spec')
    } finally {
      setIsCreating(false)
      unmarkSpecGenInFlight(activeProjectId)
    }
  }, [isCreating, draft, activeProjectId, onTicketCreated, onClose, pendingSpecId])

  // Esc -> request close. (⌘⏎ is handled inside RichAttachmentEditor.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // Push live state up so the parent can auto-minimize this shell when
  // another minimized session is restored (mutual-exclusion rule), and so
  // composer text + draft overrides survive minimize/restore cycles.
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  const [composerText, setComposerText] = useState(seedComposerText ?? '')
  useEffect(() => {
    onStateChangeRef.current?.({
      conversationId,
      draftTitle: draft.title,
      composerText,
      draftOverrides: {
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        labels: draft.labels,
        acceptanceCriteria: draft.acceptanceCriteria,
      },
    })
  }, [conversationId, draft.title, draft.description, draft.priority, draft.labels, draft.acceptanceCriteria, composerText])

  const macPadLeft = isMacTauriOverlay() ? 'pl-[88px]' : 'pl-4'

  return (
    <div
      className="fixed inset-0 z-50 flex p-3 pt-10 sm:p-6 sm:pt-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      data-testid="explore-spec-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Explore Spec · interactive"
        className="m-auto w-full h-full max-w-[1600px] flex flex-col bg-background rounded-xl border border-border/40 shadow-2xl overflow-hidden"
      >
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center justify-between ${macPadLeft} pr-4 h-14 border-b border-border bg-card/60 backdrop-blur-sm`}>
        <button
          type="button"
          onClick={requestClose}
          className="flex items-center gap-2 group p-1 -ml-1 rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          aria-label="Back (Esc)"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          <div className="text-left min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 leading-none">
              EXPLORE SPEC · interactive
            </div>
            <span className="text-sm font-medium text-foreground truncate block">
              {draft.title || seedDraftTitle || 'New spec…'}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!draft.title.trim() || isCreating}
            className="gap-1.5"
            aria-label="Create spec from current draft"
            data-testid="explore-spec-create"
            title={!draft.title.trim() ? 'A title is needed to create' : undefined}
          >
            {isCreating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : ready ? (
              <Sparkles className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Create Spec
          </Button>
          {onMinimize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMinimize(conversationId, draft.title || seedDraftTitle || '')}
              aria-label="Minimize"
              data-testid="explore-spec-minimize"
            >
              <Minus className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={requestClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body: conversation left, draft right */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_360px] divide-x divide-border/40">
        {/* Conversation column */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-24 space-y-3" data-testid="explore-conversation">
            {!conversation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting conversation…
              </div>
            )}
            {conversation?.messages.map((m, i) => (
              <TurnBubble key={i} role={m.role} content={m.content} />
            ))}
            {conversation?.isStreaming && (
              conversation.streamingText
                ? <TurnBubble role="assistant" content={conversation.streamingText} streaming />
                : <ThinkingBubble />
            )}
          </div>

          {/* Chips */}
          {chips.length > 0 && conversation && !conversation.isStreaming && (
            <div role="group" aria-label="Suggested replies" className="flex-shrink-0 flex gap-1.5 px-5 pb-2 flex-wrap">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => sendComposer(chip)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-card/40 hover:bg-card/80 hover:border-primary/40 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Composer with attachments (drag-drop, paste, click). The pending
              spec id is the same one used in the Add Spec modal so attachments
              uploaded there are visible here, and any new ones drop into the
              same dir. The server migrates everything to the real ticket id
              when the user clicks Create Spec. */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-border/40 bg-card/30">
            <RichAttachmentEditor
              ref={composerRef}
              ticketKey={pendingSpecId}
              placeholder={conversation?.isStreaming ? 'Claude is thinking…' : 'Type your reply… drag files to attach'}
              minHeight={72}
              ariaLabel="Spec idea"
              onChange={() => {
                const text = composerRef.current?.getPlainText() ?? ''
                setHasComposerText(text.length > 0)
                setComposerText(text)
              }}
              onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
              onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
              onAttachmentRemoved={(a) => {
                fetch(`${API_ORIGIN}/api/projects/${activeProjectId}/tickets/${pendingSpecId}/attachments/${a.id}`, { method: 'DELETE' }).catch(() => {})
                // Drop from the accumulated list immediately so the panel
                // does not show a stale entry.
                setAccumulatedAttachments((prev) => prev.filter((x) => x.id !== a.id))
              }}
              onAttachmentAdded={() => {
                // New file uploaded into pendingSpecId/; reflect it in the
                // Draft panel without waiting for a turn submit.
                void refreshAttachments()
              }}
              onSubmit={submitComposer}
            />
            <div className="flex items-center justify-between mt-2 gap-3">
              {conversation?.isStreaming ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
                  <Loader2 className="w-3 h-3 animate-spin text-primary/70" />
                  <span>Claude is thinking…</span>
                </div>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={submitComposer}
                disabled={!hasComposerText || !conversation || conversation.isStreaming}
                className="gap-1.5"
              >
                {conversation?.isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {conversation?.isStreaming ? 'Streaming…' : 'Send'}
                {!conversation?.isStreaming && <span className="text-[10px] opacity-70 ml-1">⌘⏎</span>}
              </Button>
            </div>
          </div>
        </div>

        {/* Draft column — breathes subtly while assistant is thinking so the
            user knows the panel will update once the turn settles. */}
        <div className={`relative min-h-0 transition-opacity duration-500 ${conversation?.isStreaming ? 'opacity-90' : 'opacity-100'}`}>
          {conversation?.isStreaming && (
            <div className="absolute top-0 inset-x-0 h-0.5 overflow-hidden pointer-events-none z-10">
              <div className="h-full bg-primary/40 animate-pulse" />
            </div>
          )}
          <SpecDraftPanel
            draft={draft}
            ready={ready}
            flashFields={lastChangedFields}
            onFieldChange={setField}
            attachments={accumulatedAttachments}
            onRemoveAttachment={async (id) => {
              try {
                await fetch(`${API_ORIGIN}/api/projects/${activeProjectId}/tickets/${pendingSpecId}/attachments/${id}`, { method: 'DELETE' })
              } catch { /* ignore */ }
              setAccumulatedAttachments((prev) => prev.filter((a) => a.id !== id))
            }}
          />
        </div>
      </div>

      {/* Confirm discard */}
      <Dialog open={confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard conversation?</DialogTitle>
            <DialogDescription>
              The current draft and conversation will be lost. You can also click Create Spec to commit a rough draft and refine the ticket later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={onClose}>
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

/** Hide the leading `/specrails:explore-spec` command from the visible content
 * so the user sees only their idea. The prefix is sent for Claude's benefit
 * (slash-command resolution); displaying it in the chat is noise. */
function stripSlashPrefix(content: string): string {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('/specrails:explore-spec')) return content
  // Drop the first line and any immediately-following blank lines
  const idx = trimmed.indexOf('\n')
  if (idx === -1) return ''
  return trimmed.slice(idx + 1).replace(/^\s+/, '')
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start" role="status" aria-live="polite" aria-label="Claude is thinking">
      <div className="rounded-lg px-3 py-2 text-sm bg-card/60 border border-border/40 max-w-[85%]">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 font-semibold">
          Claude
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:300ms]" />
          </span>
          <span className="text-xs italic">thinking…</span>
        </div>
      </div>
    </div>
  )
}

function TurnBubble({ role, content, streaming }: { role: 'user' | 'assistant' | 'system'; content: string; streaming?: boolean }) {
  if (role === 'system') return null
  const isUser = role === 'user'
  const visible = isUser ? stripSlashPrefix(content) : content
  if (!visible.trim() && !streaming) return null
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? 'bg-primary/10 text-foreground' : 'bg-card/60 border border-border/40'}`}>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 font-semibold">
          {isUser ? 'You' : 'Claude'}
        </div>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            {visible}
            {streaming && <span className="inline-block w-1 h-3 bg-primary/60 ml-0.5 animate-pulse align-baseline" />}
          </div>
        ) : (
          <div className={[
            'prose prose-invert prose-sm max-w-none break-words',
            '[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5',
            '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
            '[&_strong]:text-foreground [&_strong]:font-semibold',
            '[&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-primary/90 [&_code]:text-[12px]',
            '[&_pre]:rounded [&_pre]:bg-background/60 [&_pre]:p-2 [&_pre]:my-2',
            '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
            '[&_a]:text-primary [&_a]:underline',
            '[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold',
          ].join(' ')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{visible}</ReactMarkdown>
            {streaming && <span className="inline-block w-1 h-3 bg-primary/60 ml-0.5 animate-pulse align-baseline" />}
          </div>
        )}
      </div>
    </div>
  )
}
