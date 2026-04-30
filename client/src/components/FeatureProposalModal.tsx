import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckCircle, Send } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { useProposal } from '../hooks/useProposal'
import { useHub } from '../hooks/useHub'

const MD_CLASSES = `prose prose-invert prose-xs max-w-none
  prose-p:my-1 prose-p:leading-relaxed
  prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold
  prose-ul:my-1 prose-ol:my-1 prose-li:my-0
  prose-code:text-cyan-300 prose-code:text-[10px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
  prose-pre:my-1 prose-pre:bg-muted/30 prose-pre:rounded-md prose-pre:p-2 prose-pre:text-[10px]
  prose-strong:text-foreground prose-em:text-foreground/70
  prose-table:my-2 prose-table:text-[10px]
  prose-thead:border-border prose-thead:bg-muted/30
  prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:font-semibold
  prose-td:px-2 prose-td:py-1 prose-td:border-border
  text-foreground/80`

interface FeatureProposalModalProps {
  open: boolean
  onClose: () => void
}

// ─── Streaming indicator ─────────────────────────────────────────────────────

function StreamingIndicator({ toolCount }: { toolCount: number }) {
  return (
    <div className="rounded-lg px-3 py-2 bg-muted/40 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:300ms]" />
      </div>
      {toolCount > 0 && (
        <p className="text-[10px] text-muted-foreground animate-pulse">
          Reading codebase... ({toolCount} {toolCount === 1 ? 'file' : 'files'} explored)
        </p>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeatureProposalModal({ open, onClose }: FeatureProposalModalProps) {
  const { activeProjectId } = useHub()
  const { state, startProposal, sendRefinement, createIssue, cancel, reset } =
    useProposal(activeProjectId)

  const [idea, setIdea] = useState('')
  const [refinementInput, setRefinementInput] = useState('')
  const [confirmCreate, setConfirmCreate] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.streamingText, state.status, state.history.length])

  // Focus refinement textarea when entering review
  useEffect(() => {
    if (state.status === 'review') {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [state.status])

  function handleClose() {
    if (state.status === 'exploring' || state.status === 'refining' || state.status === 'creating_issue') {
      cancel()
    }
    if (state.status !== 'created') {
      reset()
      setIdea('')
      setRefinementInput('')
      setConfirmCreate(false)
    }
    onClose()
  }

  async function handleExplore() {
    if (!idea.trim()) return
    await startProposal(idea.trim())
  }

  async function handleRefine() {
    if (!refinementInput.trim()) return
    const feedback = refinementInput.trim()
    setRefinementInput('')
    await sendRefinement(feedback)
  }

  function handleStartOver() {
    reset()
    setIdea('')
    setRefinementInput('')
    setConfirmCreate(false)
  }

  // Parse tool markers
  const toolMatches = state.streamingText.match(/<!--tool:(\w+)-->/g) ?? []
  const toolCount = toolMatches.length
  const displayStreamingText = state.streamingText.replace(/<!--tool:\w+-->/g, '').trim()

  const isActive = state.status === 'exploring' || state.status === 'refining' || state.status === 'creating_issue'
  const isConversational = state.status === 'review' || state.status === 'refining' || state.status === 'exploring'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl glass-card flex flex-col max-h-[85vh]">

        {/* ─── idle: input step ──────────────────────────────────────────── */}
        {state.status === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>Propose a Feature</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Describe your idea in plain language. Claude will read the codebase and structure it into a full proposal.
              </p>
              <textarea
                autoFocus
                aria-label="Feature idea"
                className={cn(
                  'w-full resize-none rounded-md border border-border/50 bg-background/50',
                  'px-3 py-2 text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-accent-primary/50',
                  'min-h-[120px] max-h-64'
                )}
                placeholder="e.g. I want users to be able to set a budget alert so they get notified when API costs exceed a threshold..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleExplore() }
                }}
              />
              <p className="text-[10px] text-muted-foreground">Cmd+Enter to submit</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" onClick={handleExplore} disabled={!idea.trim()}>
                Explore Idea
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Conversational view (exploring, review, refining) ─────────── */}
        {isConversational && (
          <>
            <DialogHeader>
              <DialogTitle>
                {state.status === 'exploring' ? 'Exploring your idea...'
                  : state.status === 'refining' ? 'Refining proposal...'
                  : 'Review Proposal'}
              </DialogTitle>
            </DialogHeader>

            {/* Chat-like scrollable area */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 max-h-[50vh] pr-1">
              {/* Original idea */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-accent-primary/20 border border-accent-primary/30">
                  {idea}
                </div>
              </div>

              {/* Conversation history */}
              {state.history.map((turn, i) => (
                <div key={i} className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {turn.role === 'user' ? (
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-accent-primary/20 border border-accent-primary/30">
                      {turn.content}
                    </div>
                  ) : (
                    <div className="w-full rounded-lg px-3 py-2 text-xs bg-muted/40">
                      <div className={MD_CLASSES}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Live streaming content (during exploring or refining) */}
              {isActive && (
                displayStreamingText ? (
                  <div className="w-full rounded-lg px-3 py-2 text-xs bg-muted/40">
                    <div className={MD_CLASSES}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayStreamingText}</ReactMarkdown>
                    </div>
                    <span className="inline-block w-1.5 h-3 bg-accent-primary ml-0.5 animate-pulse" />
                  </div>
                ) : (
                  <StreamingIndicator toolCount={toolCount} />
                )
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            {state.status === 'review' && (
              <div className="border-t border-border/30 pt-3">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    aria-label="Refinement feedback"
                    className={cn(
                      'flex-1 resize-none rounded-md border border-border/50 bg-background/50',
                      'px-3 py-2 text-xs placeholder:text-muted-foreground',
                      'focus:outline-none focus:ring-1 focus:ring-accent-primary/50',
                      'min-h-[48px] max-h-24'
                    )}
                    placeholder="Ask for changes, add constraints, refine scope..."
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleRefine() }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={handleRefine}
                    disabled={!refinementInput.trim()}
                    title="Send refinement (Cmd+Enter)"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Cmd+Enter to send</p>
              </div>
            )}

            <DialogFooter>
              {confirmCreate ? (
                <>
                  <p className="text-xs text-muted-foreground mr-auto">Create a GitHub Issue from this proposal?</p>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCreate(false)}>No</Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => { setConfirmCreate(false); createIssue() }}
                  >
                    Yes, create issue
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={handleStartOver}>Start Over</Button>
                  <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
                  {state.status === 'review' && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setConfirmCreate(true)}
                    >
                      Create GitHub Issue
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </>
        )}

        {/* ─── creating_issue ────────────────────────────────────────────── */}
        {state.status === 'creating_issue' && (
          <>
            <DialogHeader>
              <DialogTitle>Creating GitHub Issue...</DialogTitle>
            </DialogHeader>
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-green-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-green-500 animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-xs text-muted-foreground animate-pulse">
                Creating issue via GitHub CLI...
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── created: success ──────────────────────────────────────────── */}
        {state.status === 'created' && (
          <>
            <DialogHeader>
              <DialogTitle>Issue Created</DialogTitle>
            </DialogHeader>
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-sm font-semibold">Issue Created</h3>
              {state.issueUrl && (
                <a
                  href={state.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-primary hover:underline break-all"
                >
                  {state.issueUrl}
                </a>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setIdea(''); setRefinementInput(''); setConfirmCreate(false) }}>Propose Another</Button>
              <Button size="sm" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── error ─────────────────────────────────────────────────────── */}
        {state.status === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Something went wrong</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <p className="text-xs text-red-400">{state.errorMessage ?? 'An error occurred'}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setIdea(''); setRefinementInput('') }}>Try Again</Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── cancelled ─────────────────────────────────────────────────── */}
        {state.status === 'cancelled' && (
          <>
            <DialogHeader>
              <DialogTitle>Cancelled</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <p className="text-xs text-muted-foreground">The proposal was cancelled.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setIdea(''); setRefinementInput('') }}>Start Over</Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
