import { useEffect, useCallback, useRef, useState } from 'react'
import { Sparkles, Send, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useChatContext } from '../hooks/useChat'
import { useHub } from '../hooks/useHub'
import { useSpecGenTracker } from '../hooks/useSpecGenTracker'
import { API_ORIGIN } from '../lib/origin'
import type { LocalTicket } from '../types'

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
  tickets: LocalTicket[]
  onTicketCreated?: (ticket: LocalTicket) => void
}

export function ProposeSpecModal({ open, onClose, tickets }: ProposeSpecModalProps) {
  const chat = useChatContext()
  const { activeProjectId, projects } = useHub()
  const tracker = useSpecGenTracker()
  const [inputText, setInputText] = useState('')
  const [exploreCodebase, setExploreCodebase] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  const projectsRef = useRef(projects)
  useEffect(() => { projectsRef.current = projects }, [projects])

  // Reset input on open
  useEffect(() => {
    if (open) {
      setInputText('')
      setIsSubmitting(false)
    }
  }, [open])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const idea = inputText.trim()
    if (!idea) return
    if (exploreCodebase && !chat) return

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    const projectName = projectsRef.current.find(p => p.id === projectId)?.name ?? 'Project'
    const toastId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const truncated = idea.length > 45 ? idea.slice(0, 45) + '…' : idea
    const knownTicketIds = new Set(tickets.map(t => t.id))
    const startTime = Date.now()

    // Show initial loading toast — tracker takes over updates from here
    toast.loading(`${projectName} · ${truncated}`, {
      id: toastId,
      description: 'Generating...',
    })

    setInputText('')
    setIsSubmitting(true)

    const reg = { toastId, truncated, knownTicketIds, projectId, projectName, startTime, persistId: toastId }

    try {
      if (exploreCodebase && chat) {
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
        if (conversationId) {
          tracker.registerExploreSpec(conversationId, reg)
        } else {
          toast.error(`${projectName} · Failed to start`, { id: toastId })
        }
      } else {
        let res: Response
        try {
          res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/tickets/generate-spec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea }),
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
  }, [inputText, chat, tickets, exploreCodebase, tracker])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

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
            Describe the feature or change you want to propose. A spec will be generated automatically.
          </p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Add a dark mode toggle to the settings page that persists the user's preference..."
            className="w-full min-h-[160px] max-h-[300px] resize-y rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-colors"
            autoFocus
          />
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
              disabled={!inputText.trim() || isSubmitting}
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
