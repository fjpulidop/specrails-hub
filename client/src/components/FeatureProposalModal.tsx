import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckCircle } from 'lucide-react'
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

// ─── MD_CLASSES: verbatim copy from SetupChat.tsx ────────────────────────────
// Per spec: copy the constant, do not import from SetupChat

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface FeatureProposalModalProps {
  open: boolean
  onClose: () => void
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

  // Auto-scroll as streaming content arrives
  useEffect(() => {
    if (state.status === 'exploring' || state.status === 'refining' || state.status === 'creating_issue') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [state.streamingText, state.status])

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

  function handleProposeAnother() {
    reset()
    setIdea('')
    setRefinementInput('')
    setConfirmCreate(false)
  }

  const isStreaming = state.status === 'exploring' || state.status === 'refining' || state.status === 'creating_issue'

  // Parse tool activity markers from streamingText (<!--tool:ToolName-->)
  const toolMatches = state.streamingText.match(/<!--tool:(\w+)-->/g) ?? []
  const lastTool = toolMatches.length > 0
    ? toolMatches[toolMatches.length - 1].replace(/<!--tool:|-->/g, '')
    : null
  const toolCount = toolMatches.length
  // Strip tool markers from display text
  const displayStreamingText = state.streamingText.replace(/<!--tool:\w+-->/g, '').trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl glass-card">

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
                  'focus:outline-none focus:ring-1 focus:ring-dracula-purple/50',
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

        {/* ─── exploring: streaming step ────────────────────────────────── */}
        {state.status === 'exploring' && (
          <>
            <DialogHeader>
              <DialogTitle>Exploring your idea...</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1 italic">
                {idea}
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {displayStreamingText ? (
                  <div className="rounded-lg px-3 py-2 text-xs bg-muted/40">
                    <div className={MD_CLASSES}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayStreamingText}</ReactMarkdown>
                    </div>
                    <span className="inline-block w-1.5 h-3 bg-dracula-purple ml-0.5 animate-pulse" />
                  </div>
                ) : (
                  <div className="rounded-lg px-3 py-2 bg-muted/40 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:300ms]" />
                    </div>
                    {lastTool && (
                      <p className="text-[10px] text-muted-foreground animate-pulse">
                        Reading codebase... ({toolCount} {toolCount === 1 ? 'file' : 'files'} explored)
                      </p>
                    )}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── review: review and refine step ──────────────────────────── */}
        {state.status === 'review' && (
          <>
            <DialogHeader>
              <DialogTitle>Review Proposal</DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              <div className="rounded-lg px-3 py-2 text-xs bg-muted/40">
                <div className={MD_CLASSES}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.resultMarkdown}</ReactMarkdown>
                </div>
              </div>
            </div>
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex gap-2">
                <textarea
                  aria-label="Refinement feedback"
                  className={cn(
                    'flex-1 resize-none rounded-md border border-border/50 bg-background/50',
                    'px-3 py-2 text-xs placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-dracula-purple/50',
                    'min-h-[60px] max-h-32'
                  )}
                  placeholder="Suggest refinements..."
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleRefine() }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-end"
                  onClick={handleRefine}
                  disabled={!refinementInput.trim()}
                >
                  Refine
                </Button>
              </div>
            </div>
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
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setConfirmCreate(true)}
                  >
                    Create GitHub Issue
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}

        {/* ─── creating_issue: issue creation in progress ────────────── */}
        {state.status === 'creating_issue' && (
          <>
            <DialogHeader>
              <DialogTitle>Creating GitHub Issue...</DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {displayStreamingText ? (
                <div className="rounded-lg px-3 py-2 text-xs bg-muted/40">
                  <div className={MD_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayStreamingText}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-1.5 h-3 bg-dracula-purple ml-0.5 animate-pulse" />
                </div>
              ) : (
                <div className="rounded-lg px-3 py-2 bg-muted/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <p className="text-[10px] text-muted-foreground animate-pulse">
                    Creating issue via GitHub CLI...
                  </p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── refining: refinement streaming step ─────────────────────── */}
        {state.status === 'refining' && (
          <>
            <DialogHeader>
              <DialogTitle>Refining proposal...</DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto space-y-3">
              {state.resultMarkdown && (
                <div className="rounded-lg px-3 py-2 text-xs bg-muted/40 opacity-50">
                  <div className={MD_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.resultMarkdown}</ReactMarkdown>
                  </div>
                </div>
              )}
              {displayStreamingText ? (
                <div className="rounded-lg px-3 py-2 text-xs bg-muted/40">
                  <div className={MD_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayStreamingText}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-1.5 h-3 bg-dracula-purple ml-0.5 animate-pulse" />
                </div>
              ) : (
                <div className="rounded-lg px-3 py-2 bg-muted/40 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:300ms]" />
                  </div>
                  {lastTool && (
                    <p className="text-[10px] text-muted-foreground animate-pulse">
                      Reading codebase... ({toolCount} {toolCount === 1 ? 'file' : 'files'} explored)
                    </p>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── created: success step ────────────────────────────────────── */}
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
                  className="text-xs text-dracula-purple hover:underline break-all"
                >
                  {state.issueUrl}
                </a>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleProposeAnother}>Propose Another</Button>
              <Button size="sm" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ─── error step ───────────────────────────────────────────────── */}
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

        {/* ─── cancelled step ───────────────────────────────────────────── */}
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

        {/* Suppress unused variable warning for isStreaming — used for scroll effect */}
        {isStreaming && null}
      </DialogContent>
    </Dialog>
  )
}
