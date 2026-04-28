import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import {
  AiEditShell,
  type AiEditUiPhase,
  type AiEditHistoryTurn,
} from '../ai-edit/AiEditShell'
import { AiEditDiffView } from '../AiEditDiffView'
import {
  RichAttachmentEditor,
  type RichAttachmentEditorHandle,
} from '../RichAttachmentEditor'
import { useSharedWebSocket } from '../../hooks/useSharedWebSocket'
import { getApiBase } from '../../lib/api'
import type { Attachment, LocalTicket } from '../../types'

const SPEC_SUGGESTION_CHIPS = [
  'Tighten the language',
  'Add acceptance criteria',
  'Clarify the scope',
  'Add edge cases and failure modes',
  'Split into clearer sections',
]

interface Props {
  ticket: LocalTicket
  /** Current title (the "saved baseline"). */
  title: string
  /** Current description (the "saved baseline"). */
  description: string
  /** All known ticket attachments — used for the chip bar render. */
  attachments: Attachment[]
  /** Called when an attachment is added during the session, to keep parent in sync. */
  onAttachmentsChange: (attachments: Attachment[]) => void
  /** Called when the user clicks Apply — parent owns persistence. */
  onApply: (proposed: { title: string; description: string }) => void
  /** Called on close (Esc / X / back arrow / Discard with no draft). */
  onClose: () => void
}

/**
 * Parse the AI output. Expected format:
 *   TITLE: <title line>
 *
 *   <markdown body>
 *
 * Falls back gracefully when the model omits the marker — keeps the original
 * title and treats the whole text as the description.
 */
function parseRefinedOutput(
  text: string,
  fallbackTitle: string,
): { title: string; description: string } {
  const m = text.match(/^\s*TITLE:\s*(.+?)\r?\n\r?\n([\s\S]*)$/)
  if (m) {
    const title = m[1].trim()
    const description = m[2].replace(/^\r?\n+/, '')
    return { title: title || fallbackTitle, description }
  }
  // Fallback: maybe TITLE on first line without blank separator.
  const oneLine = text.match(/^\s*TITLE:\s*(.+?)\r?\n([\s\S]*)$/)
  if (oneLine) {
    return { title: oneLine[1].trim() || fallbackTitle, description: oneLine[2] }
  }
  return { title: fallbackTitle, description: text }
}

type LocalUi =
  | { kind: 'composing' }
  | { kind: 'streaming' }
  | { kind: 'reviewing' }
  | { kind: 'error'; message: string }

export function TicketAiEditOverlay({
  ticket,
  title: currentTitle,
  description,
  attachments: ticketAttachments,
  onAttachmentsChange,
  onApply,
  onClose,
}: Props) {
  const [ui, setUi] = useState<LocalUi>({ kind: 'composing' })
  const [streamBuffer, setStreamBuffer] = useState('')
  const [proposedDraft, setProposedDraft] = useState<string | null>(null)
  const [history, setHistory] = useState<AiEditHistoryTurn[]>([])
  const [priorInstructions, setPriorInstructions] = useState<string[]>([])
  const [sessionAttachmentIds, setSessionAttachmentIds] = useState<string[]>([])
  const [aiRequestId, setAiRequestId] = useState<string | null>(null)

  const editorRef = useRef<RichAttachmentEditorHandle | null>(null)
  const aiRequestIdRef = useRef<string | null>(null)
  useEffect(() => {
    aiRequestIdRef.current = aiRequestId
  }, [aiRequestId])
  const streamBufferRef = useRef<string>('')
  const pendingInstructionRef = useRef<string | null>(null)

  // Auto-scrub session ids when ticket attachments change.
  useEffect(() => {
    const valid = new Set(ticketAttachments.map((a) => a.id))
    setSessionAttachmentIds((prev) => prev.filter((id) => valid.has(id)))
  }, [ticketAttachments])

  // ─── WS handler ─────────────────────────────────────────────────────────
  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  const handleAiWs = useCallback(
    (raw: unknown) => {
      const msg = raw as Record<string, unknown>
      if (!msg || typeof msg.type !== 'string') return
      const reqId = msg.requestId as string | undefined
      if (!reqId || reqId !== aiRequestIdRef.current) return

      if (msg.type === 'ticket_ai_edit_stream') {
        const delta = msg.delta as string
        streamBufferRef.current += delta
        setStreamBuffer(streamBufferRef.current)
      } else if (msg.type === 'ticket_ai_edit_done') {
        const fullText = msg.fullText as string
        streamBufferRef.current = ''
        setStreamBuffer('')
        setProposedDraft(fullText)
        setAiRequestId(null)
        setUi({ kind: 'reviewing' })
        if (pendingInstructionRef.current) {
          const queued = pendingInstructionRef.current
          pendingInstructionRef.current = null
          setPriorInstructions((prev) => [...prev, queued])
          setHistory((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'Refinement ready — see the diff on the right.',
            },
          ])
        }
      } else if (msg.type === 'ticket_ai_edit_error') {
        streamBufferRef.current = ''
        setStreamBuffer('')
        setAiRequestId(null)
        pendingInstructionRef.current = null
        setUi({ kind: 'error', message: (msg.error as string) ?? 'AI edit failed' })
      }
    },
    [],
  )

  useLayoutEffect(() => {
    registerHandler('ticket_ai_edit_overlay', handleAiWs)
    return () => unregisterHandler('ticket_ai_edit_overlay')
  }, [handleAiWs, registerHandler, unregisterHandler])

  // ─── Submit ─────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (instructions: string, attachmentIds: string[]) => {
      if (!instructions.trim()) return
      const trimmed = instructions.trim()
      pendingInstructionRef.current = trimmed
      streamBufferRef.current = ''
      setStreamBuffer('')
      setUi({ kind: 'streaming' })
      setHistory((prev) => [...prev, { role: 'user', content: trimmed }])

      const body: Record<string, unknown> = {
        instructions: trimmed,
        description,
        title: currentTitle,
        attachmentIds,
      }
      if (proposedDraft !== null) {
        body.priorInstructions = priorInstructions
        body.priorProposal = proposedDraft
      }

      try {
        const res = await fetch(`${getApiBase()}/tickets/${ticket.id}/ai-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { requestId: string }
        setAiRequestId(data.requestId)
      } catch (err) {
        pendingInstructionRef.current = null
        setUi({ kind: 'error', message: (err as Error).message })
      }
    },
    [currentTitle, description, priorInstructions, proposedDraft, ticket.id],
  )

  const submitFromEditor = useCallback(() => {
    const text = editorRef.current?.getPlainText().trim() ?? ''
    if (!text) return
    const editorIds = editorRef.current?.getAttachmentIds() ?? []
    const merged = Array.from(new Set([...sessionAttachmentIds, ...editorIds]))
    void submit(text, merged)
    editorRef.current?.clear()
    setSessionAttachmentIds([])
  }, [sessionAttachmentIds, submit])

  const submitChip = useCallback(
    (text: string) => {
      // Chip submits skip the rich editor (no attachments needed).
      void submit(text, sessionAttachmentIds)
    },
    [sessionAttachmentIds, submit],
  )

  // ─── Cancel ─────────────────────────────────────────────────────────────
  const cancelInFlight = useCallback(async () => {
    const reqId = aiRequestIdRef.current
    if (!reqId) return
    try {
      await fetch(
        `${getApiBase()}/tickets/${ticket.id}/ai-edit?requestId=${encodeURIComponent(reqId)}`,
        { method: 'DELETE' },
      )
    } catch {
      /* best-effort */
    }
  }, [ticket.id])

  const handleDiscard = useCallback(async () => {
    if (ui.kind === 'streaming') await cancelInFlight()
    onClose()
  }, [cancelInFlight, onClose, ui.kind])

  const parsedDraft = useMemo(() => {
    if (proposedDraft === null) return null
    return parseRefinedOutput(proposedDraft, currentTitle)
  }, [currentTitle, proposedDraft])

  const handleApply = useCallback(() => {
    if (!parsedDraft) return
    onApply(parsedDraft)
    toast.success('Draft applied')
  }, [onApply, parsedDraft])

  // ─── Render ─────────────────────────────────────────────────────────────
  const uiPhase: AiEditUiPhase =
    ui.kind === 'composing'
      ? 'composing'
      : ui.kind === 'streaming'
        ? 'streaming'
        : ui.kind === 'reviewing'
          ? 'reviewing'
          : 'error'

  const diff = useMemo(() => {
    if (!parsedDraft) return null
    const titleChanged = parsedDraft.title !== currentTitle
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            Title
          </div>
          {titleChanged ? (
            <div className="space-y-1 text-xs font-mono">
              <div className="text-red-300/90 line-through">{currentTitle}</div>
              <div className="text-green-200">{parsedDraft.title}</div>
            </div>
          ) : (
            <div className="text-xs font-mono text-foreground/70">{currentTitle}</div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1 px-1">
            Description
          </div>
          <AiEditDiffView
            original={description}
            proposed={parsedDraft.description}
            className="bg-transparent border-0 p-0"
          />
        </div>
      </div>
    )
  }, [currentTitle, description, parsedDraft])

  const isStreaming = ui.kind === 'streaming'
  const composer = (
    <div className="space-y-2">
      <RichAttachmentEditor
        ref={editorRef}
        ticketKey={ticket.id}
        placeholder={
          proposedDraft === null
            ? 'Describe how to refine this spec…'
            : 'Send a follow-up refinement…'
        }
        minHeight={120}
        autoFocus
        disabled={isStreaming}
        ariaLabel="AI Edit prompt"
        onAttachmentAdded={(a) => {
          if (!ticketAttachments.some((x) => x.id === a.id)) {
            onAttachmentsChange([...ticketAttachments, a])
          }
          setSessionAttachmentIds((prev) =>
            prev.includes(a.id) ? prev : [...prev, a.id],
          )
        }}
        onAttachmentRemoved={(a) => {
          setSessionAttachmentIds((prev) => prev.filter((id) => id !== a.id))
        }}
        onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
        onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
        onSubmit={submitFromEditor}
      />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono">⌘⏎</kbd> submit
          <span className="mx-1.5">·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono">Esc</kbd> cancel
        </span>
        <Button
          size="sm"
          onClick={submitFromEditor}
          disabled={isStreaming}
          className="gap-1.5"
        >
          {isStreaming ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Refine
        </Button>
      </div>
    </div>
  )

  return (
    <AiEditShell
      uiPhase={uiPhase}
      errorMessage={ui.kind === 'error' ? ui.message : null}
      eyebrow="AI Edit"
      targetLabel={ticket.title || `Spec #${ticket.id}`}
      targetLabelMono={false}
      headline="Refine your spec"
      streamingHeadline="Refining your spec…"
      description={
        ticket.title && ticket.title.length < 140
          ? `Spec #${ticket.id} · ${ticket.title}`
          : `Spec #${ticket.id}`
      }
      chips={SPEC_SUGGESTION_CHIPS}
      onChipSubmit={submitChip}
      composer={composer}
      streamingText={streamBuffer}
      history={history}
      diff={diff}
      diffHeaderLabel={`Spec #${ticket.id} description`}
      baseBody={description}
      baseBodyDisclosureLabel="View current description"
      canApply={ui.kind === 'reviewing' && proposedDraft !== null}
      onApply={handleApply}
      onDiscard={() => void handleDiscard()}
      onClose={() => void handleDiscard()}
    />
  )
}
