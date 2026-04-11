import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Sparkles, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useChatContext } from '../hooks/useChat'
import type { LocalTicket } from '../types'

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
  tickets: LocalTicket[]
  onTicketCreated?: (ticket: LocalTicket) => void
}

type ModalPhase = 'input' | 'generating' | 'done'

export function ProposeSpecModal({ open, onClose, tickets, onTicketCreated }: ProposeSpecModalProps) {
  const chat = useChatContext()
  const [phase, setPhase] = useState<ModalPhase>('input')
  const [inputText, setInputText] = useState('')
  const conversationIdRef = useRef<string | null>(null)
  const createdTicketRef = useRef<LocalTicket | null>(null)
  const knownTicketIdsRef = useRef<Set<number>>(new Set())

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('input')
      setInputText('')
      conversationIdRef.current = null
      createdTicketRef.current = null
    }
    return () => {
      // Kill any running Claude process when the modal closes
      if (conversationIdRef.current && chat) {
        chat.abortStream(conversationIdRef.current)
      }
      conversationIdRef.current = null
      createdTicketRef.current = null
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detect new tickets during generation by watching the tickets array
  useEffect(() => {
    if (phase !== 'generating') return
    // Find any ticket that wasn't in the snapshot taken at generation start
    const newTicket = tickets.find((t) => !knownTicketIdsRef.current.has(t.id))
    if (newTicket) {
      createdTicketRef.current = newTicket
      setPhase('done')
    }
  }, [phase, tickets])

  // When done, close modal and show the created ticket
  useEffect(() => {
    if (phase !== 'done') return
    const ticket = createdTicketRef.current
    // Small delay for a polished feel
    const timer = setTimeout(() => {
      onClose()
      if (ticket && onTicketCreated) {
        onTicketCreated(ticket)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [phase, onClose, onTicketCreated])

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || !chat) return
    // Snapshot current ticket IDs before starting generation
    knownTicketIdsRef.current = new Set(tickets.map((t) => t.id))
    setPhase('generating')

    const prompt = [
      '/specrails:propose-spec',
      '',
      'Here is the spec idea from the user:',
      '',
      inputText.trim(),
      '',
      'IMPORTANT INSTRUCTIONS:',
      '- Generate the spec based on the above description.',
      '- Create the local ticket automatically when done.',
      '- Do NOT ask any questions — accept all defaults and proceed directly.',
      '- Complete the entire flow without user interaction.',
    ].join('\n')

    const id = await chat.startWithMessage(prompt)
    if (id) {
      conversationIdRef.current = id
    }
  }, [inputText, chat, tickets])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // Prevent closing on overlay click during generation
  const preventInteractOutside = useCallback((e: Event) => {
    if (phase === 'generating') e.preventDefault()
  }, [phase])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg flex flex-col gap-0 p-0 overflow-hidden"
        onInteractOutside={preventInteractOutside}
        onPointerDownOutside={preventInteractOutside}
      >
        <DialogHeader className="px-5 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary/70" />
            Add Spec
          </DialogTitle>
        </DialogHeader>

        {phase === 'input' && (
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
              <span className="text-[11px] text-muted-foreground/50">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
              </span>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!inputText.trim()}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Generate Spec
              </Button>
            </div>
          </div>
        )}

        {phase === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 gap-4">
            <div className="relative">
              <Loader2 className="w-8 h-8 text-primary/60 animate-spin" />
              <Sparkles className="w-3.5 h-3.5 text-primary absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium">Generating your spec...</p>
              <p className="text-xs text-muted-foreground/70">
                This may take a moment. The spec will appear automatically when ready.
              </p>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 gap-3">
            <Sparkles className="w-8 h-8 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-400">Spec created!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
