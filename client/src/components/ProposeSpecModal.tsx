import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Sparkles, Send, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useChatContext } from '../hooks/useChat'
import { useHub } from '../hooks/useHub'
import { useSpecGenTracker } from '../hooks/useSpecGenTracker'
import { API_ORIGIN } from '../lib/origin'
import { deleteAllAttachments } from '../lib/attachments'
import { RichAttachmentEditor, type RichAttachmentEditorHandle } from './RichAttachmentEditor'
import type { LocalTicket } from '../types'

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
  tickets: LocalTicket[]
  onTicketCreated?: (ticket: LocalTicket) => void
}

function genPendingId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // fallback (shouldn't be hit in modern browsers)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function ProposeSpecModal({ open, onClose, tickets }: ProposeSpecModalProps) {
  const chat = useChatContext()
  const { activeProjectId, projects } = useHub()
  const tracker = useSpecGenTracker()
  const [exploreCodebase, setExploreCodebase] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasText, setHasText] = useState(false)
  const [attachmentCount, setAttachmentCount] = useState(0)
  const [pendingSpecId, setPendingSpecId] = useState<string>(() => genPendingId())
  const editorRef = useRef<RichAttachmentEditorHandle | null>(null)
  const submittedRef = useRef(false)

  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  const projectsRef = useRef(projects)
  useEffect(() => { projectsRef.current = projects }, [projects])

  // Reset on open; cleanup orphaned attachments on close-without-submit
  useEffect(() => {
    if (open) {
      setPendingSpecId(genPendingId())
      setIsSubmitting(false)
      setHasText(false)
      setAttachmentCount(0)
      submittedRef.current = false
      // defer to let dialog mount
      setTimeout(() => editorRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    // On close, if not submitted and we had attachments, clean up
    if (!open && !submittedRef.current && attachmentCount > 0) {
      deleteAllAttachments(pendingSpecId).catch((err) => console.warn('[ProposeSpec] cleanup failed:', err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canSubmit = useMemo(() => hasText && !isSubmitting, [hasText, isSubmitting])

  const handleSubmit = useCallback(async () => {
    const idea = editorRef.current?.getPlainText().trim() ?? ''
    if (!idea) return
    const attachmentIds = editorRef.current?.getAttachmentIds() ?? []
    if (exploreCodebase && !chat) return

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    const projectName = projectsRef.current.find(p => p.id === projectId)?.name ?? 'Project'
    const toastId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const truncated = idea.length > 45 ? idea.slice(0, 45) + '…' : idea
    const knownTicketIds = new Set(tickets.map(t => t.id))
    const startTime = Date.now()

    toast.loading(`${projectName} · ${truncated}`, { id: toastId, description: 'Generating...' })

    submittedRef.current = true
    setIsSubmitting(true)
    editorRef.current?.clear()
    setAttachmentCount(0)
    setHasText(false)

    const reg = { toastId, truncated, knownTicketIds, projectId, projectName, startTime, persistId: toastId }

    try {
      if (exploreCodebase && chat) {
        // Attachments not wired into explore-codebase path in v1 — drop them
        if (attachmentIds.length > 0) {
          await deleteAllAttachments(pendingSpecId).catch(() => {})
        }
        const prompt = [
          '/specrails:propose-spec',
          '',
          'Here is the spec idea from the user:',
          '',
          idea,
          '',
          'IMPORTANT INSTRUCTIONS:',
          '- Generate the spec based on the above description.',
          '- Create the local ticket automatically when done.',
          '- Do NOT ask any questions — accept all defaults and proceed directly.',
          '- Complete the entire flow without user interaction.',
          '- Be FAST: skip broad codebase exploration. Only read 1-2 files if strictly necessary to understand the relevant area. Prefer writing the spec from your knowledge of the project.',
        ].join('\n')

        const conversationId = await chat.startWithMessage(prompt, { lightweight: true, maxTurns: 8 })
        if (conversationId) tracker.registerExploreSpec(conversationId, reg)
        else toast.error(`${projectName} · Failed to start`, { id: toastId })
      } else {
        let res: Response
        try {
          res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/tickets/generate-spec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea, attachmentIds, pendingSpecId }),
          })
        } catch (err) {
          console.error('[ProposeSpec] generate-spec fetch threw:', err)
          toast.error(`${projectName} · Failed to start`, { id: toastId })
          return
        }
        if (!res.ok) {
          toast.error(`${projectName} · Failed to start`, { id: toastId })
          return
        }
        const data = await res.json() as { requestId: string }
        tracker.registerFastSpec(data.requestId, reg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [chat, tickets, exploreCodebase, tracker, pendingSpecId])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary/70" />
            Add Spec
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col p-5 gap-4">
          <p className="text-sm text-muted-foreground">
            Describe the feature or change you want to propose. Attach mockups, briefs, or data to give Claude more context.
          </p>
          <RichAttachmentEditor
            ref={editorRef}
            ticketKey={pendingSpecId}
            placeholder="e.g. Add a dark mode toggle to the settings page that persists the user's preference..."
            minHeight={160}
            autoFocus
            ariaLabel="Spec idea"
            onChange={() => setHasText((editorRef.current?.getPlainText().length ?? 0) > 0)}
            onAttachmentAdded={() => setAttachmentCount((c) => c + 1)}
            onAttachmentRemoved={(a) => {
              setAttachmentCount((c) => Math.max(0, c - 1))
              // fire-and-forget server delete; editor only removed pill
              fetch(`${API_ORIGIN}/api/projects/${activeProjectIdRef.current}/tickets/${pendingSpecId}/attachments/${a.id}`, { method: 'DELETE' }).catch(() => {})
            }}
            onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
            onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
            onSubmit={handleSubmit}
          />
          {exploreCodebase && attachmentCount > 0 && (
            <p className="text-[11px] text-amber-500">
              ⚠ Attachments are ignored in Explore mode. Uncheck “Explore codebase” to include them.
            </p>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={exploreCodebase}
                onChange={(e) => setExploreCodebase(e.target.checked)}
                className="rounded border-border/60 bg-background text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
                <Search className="w-3 h-3" />
                Explore codebase
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                {exploreCodebase ? '~1 min' : '~15s'}
              </span>
            </label>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Generate Spec
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
