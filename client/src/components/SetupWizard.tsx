import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { Check, ArrowRight, Package, Bot, Terminal, Users, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { CheckpointTracker, type CheckpointState } from './CheckpointTracker'
import { SetupChat, type SetupChatMessage } from './SetupChat'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { cn } from '../lib/utils'
import type { HubProject } from '../hooks/useHub'

// ─── Wizard step types ────────────────────────────────────────────────────────

type WizardStep =
  | { step: 'proposal' }
  | { step: 'installing' }
  | { step: 'setup'; sessionId?: string }
  | { step: 'complete'; summary: SetupSummary }
  | { step: 'error'; message: string; retryStep: 'installing' | 'setup' }

interface SetupSummary {
  agents: number
  personas: number
  commands: number
}

// ─── Initial checkpoint states ────────────────────────────────────────────────

const INITIAL_CHECKPOINTS: CheckpointState[] = [
  { key: 'base_install', name: 'Base installation', status: 'pending' },
  { key: 'repo_analysis', name: 'Repository analysis', status: 'pending' },
  { key: 'stack_conventions', name: 'Stack & conventions', status: 'pending' },
  { key: 'product_discovery', name: 'Product discovery', status: 'pending' },
  { key: 'agent_generation', name: 'Agent generation', status: 'pending' },
  { key: 'command_config', name: 'Command configuration', status: 'pending' },
  { key: 'final_verification', name: 'Final verification', status: 'pending' },
]

// ─── Phase 2: Proposal ────────────────────────────────────────────────────────

function ProposalStep({
  project,
  onInstall,
  onSkip,
}: {
  project: HubProject
  onInstall: () => void
  onSkip: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-6 gap-6">
      <div className="w-14 h-14 rounded-2xl bg-dracula-purple/20 flex items-center justify-center">
        <Package className="w-7 h-7 text-dracula-purple" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-base font-semibold">Install specrails in {project.name}?</h2>
        <p className="text-sm text-muted-foreground">
          This project doesn&apos;t have specrails installed yet. Install it to unlock
          AI-powered development workflows.
        </p>
      </div>

      <div className="w-full rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">What will be installed:</p>
        <ul className="space-y-2">
          {[
            { icon: Bot, text: 'Specialized AI agents (architect, developer, reviewer)' },
            { icon: Terminal, text: 'Workflow commands (/sr:implement, /sr:product-backlog...)' },
            { icon: Users, text: 'User personas and per-layer conventions' },
            { icon: Package, text: 'Agent memory and configuration scaffolding' },
          ].map(({ text }) => (
            <li key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <div className="w-4 h-4 rounded bg-dracula-green/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-dracula-green" />
              </div>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3 w-full">
        <Button variant="outline" size="sm" className="flex-1" onClick={onSkip}>
          Skip for now
        </Button>
        <Button size="sm" className="flex-1 gap-2" onClick={onInstall}>
          <Package className="w-3.5 h-3.5" />
          Install specrails
        </Button>
      </div>
    </div>
  )
}

// ─── Phase 3: Installing ──────────────────────────────────────────────────────

function InstallingStep({
  logLines,
}: {
  logLines: string[]
}) {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto px-6 py-8 gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-dracula-purple/20 flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-dracula-purple animate-pulse" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Installing specrails...</h2>
          <p className="text-xs text-muted-foreground">Running npx specrails in your project</p>
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-border/30 bg-muted/10 overflow-auto p-3 font-mono text-[9px] text-muted-foreground space-y-0.5">
        {logLines.length === 0 ? (
          <p className="text-center text-muted-foreground mt-4">Waiting for output...</p>
        ) : (
          logLines.slice(-300).map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all leading-tight">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Phase 5: Complete ────────────────────────────────────────────────────────

function CompleteStep({
  summary,
  onGoToProject,
}: {
  summary: SetupSummary
  onGoToProject: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-6 gap-6">
      <div className="w-16 h-16 rounded-2xl bg-dracula-green/20 flex items-center justify-center">
        <Check className="w-8 h-8 text-dracula-green" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-base font-semibold">specrails is ready!</h2>
        <p className="text-sm text-muted-foreground">
          Your project has been fully configured with AI workflows.
        </p>
      </div>

      <div className="w-full rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-dracula-purple">{summary.agents}</div>
            <div className="text-[10px] text-muted-foreground">Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-dracula-pink">{summary.personas}</div>
            <div className="text-[10px] text-muted-foreground">Personas</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-dracula-green">{summary.commands}</div>
            <div className="text-[10px] text-muted-foreground">Commands</div>
          </div>
        </div>
      </div>

      <Button size="sm" className="gap-2" onClick={onGoToProject}>
        Go to project
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

// ─── Error step ───────────────────────────────────────────────────────────────

function ErrorStep({
  message,
  onRetry,
  onSkip,
}: {
  message: string
  onRetry: () => void
  onSkip: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-6 gap-6">
      <div className="text-center space-y-2">
        <h2 className="text-base font-semibold text-destructive">Setup failed</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={onSkip}>
          Skip setup
        </Button>
        <Button size="sm" className="gap-2" onClick={onRetry}>
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </Button>
      </div>
    </div>
  )
}

// ─── SetupWizard ──────────────────────────────────────────────────────────────

interface SetupWizardProps {
  project: HubProject
  onComplete: () => void
  onSkip: () => void
}

export function SetupWizard({ project, onComplete, onSkip }: SetupWizardProps) {
  const [wizardStep, setWizardStep] = useState<WizardStep>({ step: 'proposal' })
  const [checkpoints, setCheckpoints] = useState<CheckpointState[]>(INITIAL_CHECKPOINTS)
  const [logLines, setLogLines] = useState<string[]>([])
  const [chatMessages, setChatMessages] = useState<SetupChatMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  // Track whether we need to auto-start the setup phase after install completes
  const pendingSetupStart = useRef(false)

  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // ─── WebSocket message handler ──────────────────────────────────────────────

  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (typeof msg.type !== 'string') return
    if ((msg.projectId as string) !== project.id) return

    switch (msg.type) {
      case 'setup_log': {
        const line = msg.line as string
        setLogLines((prev) => [...prev, line])
        break
      }

      case 'setup_install_done': {
        // Base install done — signal to auto-start setup phase
        pendingSetupStart.current = true
        setWizardStep({ step: 'setup' })
        break
      }

      case 'setup_checkpoint': {
        const key = msg.checkpoint as string
        const status = msg.status as 'running' | 'done'
        const detail = msg.detail as string | undefined
        const duration_ms = msg.duration_ms as number | undefined
        setCheckpoints((prev) =>
          prev.map((cp) =>
            cp.key === key
              ? { ...cp, status, detail: detail ?? cp.detail, duration_ms: duration_ms ?? cp.duration_ms }
              : cp
          )
        )
        break
      }

      case 'setup_chat': {
        const text = msg.text as string
        const role = msg.role as 'assistant' | 'user'
        if (role === 'assistant') {
          setIsStreaming(true)
          setStreamingText((prev) => prev + text)
        }
        break
      }

      case 'setup_turn_done': {
        // Claude finished one turn but setup isn't complete yet.
        // Save session ID and flush streaming text — wait for user input.
        const turnSid = msg.sessionId as string | undefined
        if (turnSid) setSessionId(turnSid)

        setStreamingText((prev) => {
          if (prev) {
            setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          }
          return ''
        })
        setIsStreaming(false)
        break
      }

      case 'setup_complete': {
        const sid = msg.sessionId as string | undefined
        if (sid) setSessionId(sid)

        // Flush any streaming text into messages
        setStreamingText((prev) => {
          if (prev) {
            setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          }
          return ''
        })
        setIsStreaming(false)

        // Mark all checkpoints done
        setCheckpoints((prev) => prev.map((cp) => ({ ...cp, status: 'done' as const })))

        const summary = msg.summary as SetupSummary
        setWizardStep({ step: 'complete', summary })
        break
      }

      case 'setup_error': {
        const error = msg.error as string
        // Flush streaming text
        setStreamingText((prev) => {
          if (prev) {
            setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          }
          return ''
        })
        setIsStreaming(false)

        const currentStep = wizardStep.step === 'installing' ? 'installing' : 'setup'
        setWizardStep({ step: 'error', message: error, retryStep: currentStep })
        break
      }
    }
  }, [project.id, wizardStep.step])

  useLayoutEffect(() => {
    registerHandler(`setup-${project.id}`, handleWsMessage)
    return () => unregisterHandler(`setup-${project.id}`)
  }, [handleWsMessage, registerHandler, unregisterHandler, project.id])

  // When streaming text completes (setup_complete or gap between turns), commit to messages
  // We detect turn end via setup_complete. Between user sends, streaming builds up.

  // ─── Actions ────────────────────────────────────────────────────────────────

  function startInstall() {
    setWizardStep({ step: 'installing' })
    setLogLines([])
    fetch(`/api/projects/${project.id}/setup/install`, { method: 'POST' }).catch((err) => {
      console.error('[SetupWizard] install start error:', err)
    })
  }

  function startSetup() {
    setCheckpoints(INITIAL_CHECKPOINTS)
    setChatMessages([])
    setStreamingText('')
    setIsStreaming(false)
    fetch(`/api/projects/${project.id}/setup/start`, { method: 'POST' }).catch((err) => {
      console.error('[SetupWizard] setup start error:', err)
    })
  }

  function handleSendMessage(text: string) {
    if (!sessionId) return
    setChatMessages((prev) => [...prev, { role: 'user', text }])
    setStreamingText('')
    setIsStreaming(true)
    fetch(`/api/projects/${project.id}/setup/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text }),
    }).catch((err) => {
      console.error('[SetupWizard] send message error:', err)
    })
  }

  function handleRetry() {
    if (wizardStep.step !== 'error') return
    const retryStep = wizardStep.retryStep
    setWizardStep({ step: retryStep === 'installing' ? 'installing' : 'setup' })
    if (retryStep === 'installing') {
      startInstall()
    } else {
      startSetup()
    }
  }

  // Auto-start setup phase when install completes
  useEffect(() => {
    if (wizardStep.step === 'setup' && pendingSetupStart.current) {
      pendingSetupStart.current = false
      startSetup()
    }
  // startSetup is a stable function defined below; eslint-disable-next-line is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep.step])

  // Commit streaming text to messages when streaming ends mid-turn.
  // setup_complete handles the final flush directly; this handles unexpected stream end.
  useEffect(() => {
    if (!isStreaming && streamingText) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: streamingText }])
      setStreamingText('')
    }
  }, [isStreaming, streamingText])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Wizard step indicator */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          {[
            { id: 'proposal', label: 'Proposal' },
            { id: 'installing', label: 'Install' },
            { id: 'setup', label: 'Configure' },
            { id: 'complete', label: 'Complete' },
          ].map((s, i, arr) => {
            const stepOrder = ['proposal', 'installing', 'setup', 'complete']
            const currentIndex = stepOrder.indexOf(wizardStep.step === 'error'
              ? wizardStep.retryStep
              : wizardStep.step
            )
            const thisIndex = stepOrder.indexOf(s.id)
            const isDone = thisIndex < currentIndex
            const isCurrent = thisIndex === currentIndex

            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                      isDone && 'bg-dracula-green text-background',
                      isCurrent && 'bg-dracula-purple text-background',
                      !isDone && !isCurrent && 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {isDone ? <Check className="w-2.5 h-2.5" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      isCurrent && 'text-foreground',
                      !isCurrent && 'text-muted-foreground'
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className={cn('w-6 h-px', isDone ? 'bg-dracula-green/50' : 'bg-border/50')} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        {wizardStep.step === 'proposal' && (
          <ProposalStep
            project={project}
            onInstall={startInstall}
            onSkip={onSkip}
          />
        )}

        {wizardStep.step === 'installing' && (
          <InstallingStep logLines={logLines} />
        )}

        {wizardStep.step === 'setup' && (
          <div className="flex h-full">
            {/* Left: checkpoint tracker */}
            <div className="w-72 flex-shrink-0 border-r border-border/30 overflow-hidden">
              <CheckpointTracker
                checkpoints={checkpoints}
                logLines={logLines}
              />
            </div>
            {/* Right: setup chat */}
            <div className="flex-1 overflow-hidden">
              <SetupChat
                projectId={project.id}
                messages={chatMessages}
                isStreaming={isStreaming}
                streamingText={streamingText}
                sessionId={sessionId}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}

        {wizardStep.step === 'complete' && (
          <CompleteStep
            summary={wizardStep.summary}
            onGoToProject={onComplete}
          />
        )}

        {wizardStep.step === 'error' && (
          <ErrorStep
            message={wizardStep.message}
            onRetry={handleRetry}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  )
}
