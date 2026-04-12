import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { Loader2, Sparkles, Send, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useChatContext } from '../hooks/useChat'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { useHub } from '../hooks/useHub'
import { getApiBase } from '../lib/api'
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
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const { activeProjectId } = useHub()
  const [phase, setPhase] = useState<ModalPhase>('input')
  const [inputText, setInputText] = useState('')
  const [exploreCodebase, setExploreCodebase] = useState(true)
  const conversationIdRef = useRef<string | null>(null)
  const createdTicketRef = useRef<LocalTicket | null>(null)
  const knownTicketIdsRef = useRef<Set<number>>(new Set())
  const fastRequestIdRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('input')
      setInputText('')
      conversationIdRef.current = null
      createdTicketRef.current = null
      fastRequestIdRef.current = null
    }
    return () => {
      // Kill any running Claude process when the modal closes
      if (conversationIdRef.current && chat) {
        chat.abortStream(conversationIdRef.current)
      }
      conversationIdRef.current = null
      createdTicketRef.current = null
      fastRequestIdRef.current = null
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared helper: fetch tickets from API and check for new ones ──────────
  const checkForNewTickets = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${getApiBase()}/tickets`)
      if (!res.ok) return false
      const data = (await res.json()) as { tickets: LocalTicket[] } | LocalTicket[]
      const list: LocalTicket[] = Array.isArray(data) ? data : data.tickets ?? []
      const newTicket = list.find((t) => !knownTicketIdsRef.current.has(t.id))
      if (newTicket) {
        createdTicketRef.current = newTicket
        setPhase('done')
        return true
      }
    } catch { /* ignore */ }
    return false
  }, [])

  // ── Explore mode: direct WS listener for ticket events ────────────────────
  const handleTicketWs = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!msg || typeof msg.type !== 'string') return
    if (msg.projectId && msg.projectId !== activeProjectIdRef.current) return
    if (msg.type === 'ticket_created' || msg.type === 'ticket_updated') {
      // A ticket was created/updated — check if it's our new one
      checkForNewTickets()
    }
  }, [checkForNewTickets])

  useLayoutEffect(() => {
    registerHandler('propose_tickets', handleTicketWs)
    return () => unregisterHandler('propose_tickets')
  }, [handleTicketWs, registerHandler, unregisterHandler])

  // ── Explore mode: detect from tickets prop (fast path, no network) ────────
  useEffect(() => {
    if (phase !== 'generating' || !exploreCodebase) return
    const newTicket = tickets.find((t) => !knownTicketIdsRef.current.has(t.id))
    if (newTicket) {
      createdTicketRef.current = newTicket
      setPhase('done')
    }
  }, [phase, tickets, exploreCodebase])

  // ── Explore mode: polling fallback — immediate first check + 1.5s interval
  useEffect(() => {
    if (phase !== 'generating' || !exploreCodebase) return
    // Immediate first check (ticket may already be on disk)
    checkForNewTickets()
    const interval = setInterval(() => { checkForNewTickets() }, 1500)
    return () => clearInterval(interval)
  }, [phase, exploreCodebase, checkForNewTickets])

  // ── Explore mode: listen for chat_done to immediately check ───────────────
  const handleChatDone = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!msg || msg.type !== 'chat_done') return
    if (msg.conversationId !== conversationIdRef.current) return
    checkForNewTickets()
  }, [checkForNewTickets])

  useLayoutEffect(() => {
    registerHandler('propose_chat_done', handleChatDone)
    return () => unregisterHandler('propose_chat_done')
  }, [handleChatDone, registerHandler, unregisterHandler])

  // WS handler for fast mode (spec_gen_done / spec_gen_error)
  const handleSpecGenWs = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!msg || typeof msg.type !== 'string') return
    const reqId = msg.requestId as string | undefined
    if (!reqId || reqId !== fastRequestIdRef.current) return

    if (msg.type === 'spec_gen_done') {
      createdTicketRef.current = msg.ticket as LocalTicket
      setPhase('done')
    } else if (msg.type === 'spec_gen_error') {
      setPhase('input')
    }
  }, [])

  useLayoutEffect(() => {
    registerHandler('spec_gen', handleSpecGenWs)
    return () => unregisterHandler('spec_gen')
  }, [handleSpecGenWs, registerHandler, unregisterHandler])

  // When done, kill any still-running Claude process, close modal, show ticket
  useEffect(() => {
    if (phase !== 'done') return
    // Abort the ChatManager session — ticket is created, no need to keep going
    if (conversationIdRef.current && chat) {
      chat.abortStream(conversationIdRef.current)
      conversationIdRef.current = null
    }
    const ticket = createdTicketRef.current
    const timer = setTimeout(() => {
      onClose()
      if (ticket && onTicketCreated) {
        onTicketCreated(ticket)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [phase, onClose, onTicketCreated, chat])

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim()) return
    knownTicketIdsRef.current = new Set(tickets.map((t) => t.id))
    setPhase('generating')

    if (exploreCodebase) {
      // Full mode: use ChatManager with propose-spec skill
      if (!chat) return
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
        '- Be FAST: skip broad codebase exploration. Only read 1-2 files if strictly necessary to understand the relevant area. Prefer writing the spec from your knowledge of the project.',
      ].join('\n')

      const id = await chat.startWithMessage(prompt, { lightweight: true, maxTurns: 8 })
      if (id) {
        conversationIdRef.current = id
      }
    } else {
      // Fast mode: dedicated endpoint, no codebase exploration
      try {
        const res = await fetch(`${getApiBase()}/tickets/generate-spec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idea: inputText.trim() }),
        })
        if (!res.ok) {
          setPhase('input')
          return
        }
        const data = await res.json() as { requestId: string }
        fastRequestIdRef.current = data.requestId
      } catch {
        setPhase('input')
      }
    }
  }, [inputText, chat, tickets, exploreCodebase])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

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
                {exploreCodebase
                  ? 'Exploring the codebase and generating the spec. This may take a moment.'
                  : 'Generating spec from your description. This should be quick.'}
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
