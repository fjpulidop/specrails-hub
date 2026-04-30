import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Sparkles, Send, Zap, MessagesSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useHub } from '../hooks/useHub'
import { useSpecGenTracker } from '../hooks/useSpecGenTracker'
import { API_ORIGIN } from '../lib/origin'
import { deleteAllAttachments } from '../lib/attachments'
import { RichAttachmentEditor, type RichAttachmentEditorHandle } from './RichAttachmentEditor'
import { ExploreSpecShell } from './explore-spec/ExploreSpecShell'
import type { LocalTicket } from '../types'

type SpecMode = 'quick' | 'explore'

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
  tickets: LocalTicket[]
  onTicketCreated?: (ticket: LocalTicket) => void
}

interface ExploreState {
  idea: string
  pendingSpecId: string
  initialAttachmentIds: string[]
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

export function ProposeSpecModal({ open, onClose, tickets, onTicketCreated }: ProposeSpecModalProps) {
  const { activeProjectId, projects } = useHub()
  const tracker = useSpecGenTracker()
  const [mode, setMode] = useState<SpecMode>('quick')
  const [explore, setExplore] = useState<ExploreState | null>(null)
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
      setMode('quick')
      setIsSubmitting(false)
      setHasText(false)
      setAttachmentCount(0)
      submittedRef.current = false
      // defer to let dialog mount; reset any user-resized height so the modal
      // always opens at the configured minHeight, then focus the editor.
      setTimeout(() => {
        editorRef.current?.resetHeight()
        editorRef.current?.focus()
      }, 50)
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

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    // Explore mode: hand off to the conversational overlay; the modal closes,
    // the overlay takes over, and the ticket is committed via /from-draft when
    // the user clicks Create Spec. Attachments uploaded into pendingSpecId are
    // carried through and folded into Claude's context for the first turn.
    if (mode === 'explore') {
      submittedRef.current = true // suppress attachment cleanup on close
      setExplore({ idea, pendingSpecId, initialAttachmentIds: attachmentIds })
      onClose()
      return
    }

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
    } finally {
      setIsSubmitting(false)
    }
  }, [mode, tickets, tracker, pendingSpecId, onClose])

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary/70" />
              Add Spec
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col p-5 gap-4">
            <ModeSegmented value={mode} onChange={setMode} />

            <p className="text-sm text-muted-foreground">
              {mode === 'quick'
                ? 'Describe the feature or change. Attach mockups, briefs, or data for more context.'
                : 'Describe a rough idea. Claude will help you shape it through conversation — you decide when to commit.'}
            </p>
            <RichAttachmentEditor
              ref={editorRef}
              ticketKey={pendingSpecId}
              placeholder={mode === 'quick'
                ? "e.g. Add a dark mode toggle to the settings page that persists the user's preference..."
                : "e.g. dark mode — not sure where the toggle should live or how to persist it…"}
              minHeight={160}
              autoFocus
              ariaLabel="Spec idea"
              onChange={() => setHasText((editorRef.current?.getPlainText().length ?? 0) > 0)}
              onAttachmentAdded={() => setAttachmentCount((c) => c + 1)}
              onAttachmentRemoved={(a) => {
                setAttachmentCount((c) => Math.max(0, c - 1))
                fetch(`${API_ORIGIN}/api/projects/${activeProjectIdRef.current}/tickets/${pendingSpecId}/attachments/${a.id}`, { method: 'DELETE' }).catch(() => {})
              }}
              onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
              onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
              onSubmit={handleSubmit}
            />
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {mode === 'quick' ? 'Generate Spec' : 'Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {explore && (
        <ExploreSpecShell
          initialIdea={explore.idea}
          pendingSpecId={explore.pendingSpecId}
          initialAttachmentIds={explore.initialAttachmentIds}
          onClose={() => {
            // Discarding the overlay → wipe any attachments uploaded during the
            // session (matches Quick path's close-without-submit behaviour).
            deleteAllAttachments(explore.pendingSpecId).catch(() => {})
            setExplore(null)
          }}
          onTicketCreated={(ticket) => {
            // Migration of attachments to the real ticket id is handled by
            // POST /tickets/from-draft, which receives pendingSpecId.
            setExplore(null)
            onTicketCreated?.(ticket)
          }}
        />
      )}
    </>
  )
}

function ModeSegmented({ value, onChange }: { value: SpecMode; onChange: (v: SpecMode) => void }) {
  return (
    <div role="tablist" aria-label="Spec creation mode" className="inline-flex items-center gap-1 p-1 rounded-lg border border-border/50 bg-card/40 self-start">
      <ModeOption
        active={value === 'quick'}
        icon={<Zap className="w-3.5 h-3.5" />}
        label="Quick"
        hint="~15s"
        onClick={() => onChange('quick')}
      />
      <ModeOption
        active={value === 'explore'}
        icon={<MessagesSquare className="w-3.5 h-3.5" />}
        label="Explore"
        hint="interactive"
        onClick={() => onChange('explore')}
      />
    </div>
  )
}

function ModeOption({
  active, icon, label, hint, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
      }`}
    >
      {icon}
      {label}
      <span className={`text-[10px] ${active ? 'text-primary/60' : 'text-muted-foreground/60'}`}>{hint}</span>
    </button>
  )
}
