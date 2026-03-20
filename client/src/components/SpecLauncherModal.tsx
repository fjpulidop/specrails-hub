import { useState, useRef, useEffect } from 'react'
import { Sparkles, CheckCircle, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { useSpecLauncher } from '../hooks/useSpecLauncher'

// ─── Change type options ───────────────────────────────────────────────────────

type ChangeType = 'feat' | 'fix' | 'refactor' | 'chore'

interface ChangeTypeOption {
  value: ChangeType
  label: string
  description: string
  colorClass: string
  selectedClass: string
}

const CHANGE_TYPES: ChangeTypeOption[] = [
  {
    value: 'feat',
    label: 'Feature',
    description: 'New functionality or enhancement',
    colorClass: 'border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5',
    selectedClass: 'border-purple-500/70 bg-purple-500/10',
  },
  {
    value: 'fix',
    label: 'Fix',
    description: 'Bug fix or correction',
    colorClass: 'border-red-500/30 hover:border-red-500/60 hover:bg-red-500/5',
    selectedClass: 'border-red-500/70 bg-red-500/10',
  },
  {
    value: 'refactor',
    label: 'Refactor',
    description: 'Code restructuring without behavior change',
    colorClass: 'border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/5',
    selectedClass: 'border-blue-500/70 bg-blue-500/10',
  },
  {
    value: 'chore',
    label: 'Chore',
    description: 'Maintenance, tooling, or config',
    colorClass: 'border-gray-500/30 hover:border-gray-500/60 hover:bg-gray-500/5',
    selectedClass: 'border-gray-500/70 bg-gray-500/10',
  },
]

// ─── Streaming indicator ──────────────────────────────────────────────────────

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-dracula-purple animate-bounce [animation-delay:300ms]" />
      <span className="text-[10px] text-muted-foreground ml-1 animate-pulse">Generating spec...</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SpecLauncherModalProps {
  open: boolean
  onClose: () => void
  activeProjectId: string | null
}

type Step = 1 | 2 | 3

export function SpecLauncherModal({ open, onClose, activeProjectId }: SpecLauncherModalProps) {
  const { state, launch, cancel, reset } = useSpecLauncher(activeProjectId)

  const [step, setStep] = useState<Step>(1)
  const [changeType, setChangeType] = useState<ChangeType | null>(null)
  const [description, setDescription] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll streaming output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.streamText])

  // Advance to step 3 when launch starts
  useEffect(() => {
    if (state.status === 'launching' || state.status === 'done' || state.status === 'error') {
      setStep(3)
    }
  }, [state.status])

  // Focus textarea when entering step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [step])

  function handleClose() {
    if (state.status === 'launching') {
      cancel()
    }
    reset()
    setStep(1)
    setChangeType(null)
    setDescription('')
    onClose()
  }

  function handleStartOver() {
    if (state.status === 'launching') {
      cancel()
    }
    reset()
    setStep(1)
    setChangeType(null)
    setDescription('')
  }

  async function handleLaunch() {
    if (!changeType || !description.trim()) return
    const fullDescription = `${changeType}: ${description.trim()}`
    await launch(fullDescription)
  }

  const selectedTypeOption = CHANGE_TYPES.find((t) => t.value === changeType)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl glass-card flex flex-col max-h-[85vh]">

        {/* ─── Step indicator ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {([1, 2, 3] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3 h-3 opacity-40" />}
              <span className={cn(
                'px-1.5 py-0.5 rounded',
                step === s ? 'bg-dracula-purple/20 text-dracula-purple font-medium' : 'opacity-50'
              )}>
                {s === 1 ? 'Type' : s === 2 ? 'Describe' : 'Generate'}
              </span>
            </span>
          ))}
        </div>

        {/* ─── Step 1: Change type selector ────────────────────────────────── */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-dracula-purple" />
                New OpenSpec Change
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                What kind of change are you creating?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CHANGE_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setChangeType(opt.value)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                      changeType === opt.value ? opt.selectedClass : opt.colorClass
                    )}
                  >
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-snug">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => setStep(2)}
                disabled={!changeType}
              >
                Next
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Step 2: Description ─────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-dracula-purple" />
                {selectedTypeOption?.label ?? 'New Change'}: Describe it
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Describe the change in plain language. Claude will read the codebase and generate a full OpenSpec change file.
              </p>
              <textarea
                ref={textareaRef}
                autoFocus
                aria-label="Change description"
                className={cn(
                  'w-full resize-none rounded-md border border-border/50 bg-background/50',
                  'px-3 py-2 text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-dracula-purple/50',
                  'min-h-[120px] max-h-64'
                )}
                placeholder={
                  changeType === 'feat' ? 'e.g. Add a dark mode toggle in the settings page that persists across sessions...' :
                  changeType === 'fix' ? 'e.g. Fix the cost calculation that shows incorrect totals when cache tokens are present...' :
                  changeType === 'refactor' ? 'e.g. Extract the WS message filtering logic into a shared utility hook...' :
                  'e.g. Update the CI pipeline to cache node_modules between runs...'
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleLaunch() }
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Cmd+Enter to generate — the spec will be created as{' '}
                <code className="font-mono text-foreground/70">{changeType}: {description.trim() || '...'}</code>
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleLaunch}
                disabled={!description.trim()}
              >
                Generate Spec
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Step 3: Streaming / done / error ────────────────────────────── */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-dracula-purple" />
                {state.status === 'done' ? 'Change Created' :
                 state.status === 'error' ? 'Generation Failed' :
                 'Generating Spec...'}
              </DialogTitle>
            </DialogHeader>

            {/* Streaming log area */}
            {(state.status === 'launching' || state.status === 'done') && (
              <div className="flex-1 min-h-0 max-h-[40vh] overflow-y-auto rounded-md border border-border/40 bg-background/30 p-3">
                {state.streamText ? (
                  <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                    {state.streamText}
                    {state.status === 'launching' && (
                      <span className="inline-block w-1.5 h-3 bg-dracula-purple ml-0.5 animate-pulse" />
                    )}
                  </pre>
                ) : (
                  state.status === 'launching' && <StreamingIndicator />
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {/* Done state */}
            {state.status === 'done' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-medium">Spec generated successfully</p>
                {state.changeId && (
                  <p className="text-xs text-muted-foreground">
                    Change: <code className="font-mono text-foreground/70">{state.changeId}</code>
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  The OpenSpec change file has been created. View it in the Feature Funnel.
                </p>
              </div>
            )}

            {/* Error state */}
            {state.status === 'error' && (
              <div className="py-4 space-y-2">
                <p className="text-xs text-red-400">{state.error ?? 'An error occurred during spec generation'}</p>
              </div>
            )}

            <DialogFooter>
              {state.status === 'launching' && (
                <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              )}
              {state.status === 'done' && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleStartOver}>Create Another</Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleClose}
                  >
                    View in Feature Funnel
                  </Button>
                </>
              )}
              {state.status === 'error' && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleStartOver}>Try Again</Button>
                  <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
