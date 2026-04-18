import { useState, useEffect, useRef, useCallback, useLayoutEffect, memo } from 'react'
import { Check, ArrowRight, Package, Bot, ChevronLeft, Settings2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from './ui/button'
import { CheckpointTracker, type CheckpointState } from './CheckpointTracker'
import { SetupChat, type SetupChatMessage } from './SetupChat'
import { AgentSelector, ALL_AGENTS, CORE_AGENTS, DEFAULT_SELECTED } from './AgentSelector'
import { ModelSelector, type ModelPreset, type ModelOverrides } from './ModelSelector'
import { TierSelector, type InstallTier } from './TierSelector'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { cn } from '../lib/utils'
import type { HubProject } from '../hooks/useHub'

// ─── Wizard step types ────────────────────────────────────────────────────────

type WizardStep =
  | { step: 'agent-selection' }
  | { step: 'installing'; tier: InstallTier }
  | { step: 'enriching'; sessionId?: string }
  | { step: 'complete'; summary: SetupSummary }
  | { step: 'error'; message: string; retryStep: 'installing' | 'enriching' }

interface SetupSummary {
  agents: number
  specrailsCommands: number
  opsxCommands: number
  personas: number
  legacySrRemoved: number
  tier: 'quick' | 'full'
}

const EMPTY_SUMMARY: SetupSummary = {
  agents: 0,
  specrailsCommands: 0,
  opsxCommands: 0,
  personas: 0,
  legacySrRemoved: 0,
  tier: 'quick',
}

// ─── Install config ───────────────────────────────────────────────────────────

interface InstallConfig {
  tier: InstallTier
  selectedAgents: string[]
  modelPreset: ModelPreset
  modelOverrides: ModelOverrides
}

// Map full model IDs to short names used by specrails-core
function toShortModelName(modelId: string): string {
  if (modelId.includes('opus')) return 'opus'
  if (modelId.includes('haiku')) return 'haiku'
  if (modelId.includes('sonnet')) return 'sonnet'
  return modelId // codex models pass through as-is
}

// Map preset to default short model name
function presetToDefaultModel(preset: ModelPreset): string {
  const defaults: Record<ModelPreset, string> = {
    balanced: 'sonnet',
    budget: 'haiku',
    max: 'sonnet',
  }
  return defaults[preset]
}

function buildDefaultConfig(): InstallConfig {
  return {
    tier: 'quick',
    selectedAgents: [...DEFAULT_SELECTED],
    modelPreset: 'balanced',
    modelOverrides: {},
  }
}

// ─── Initial checkpoint states ────────────────────────────────────────────────

const QUICK_CHECKPOINTS: CheckpointState[] = [
  { key: 'base_install', name: 'Base installation', status: 'pending' },
  { key: 'agent_selection', name: 'Agent selection', status: 'pending' },
  { key: 'agent_generation', name: 'Agent generation', status: 'pending' },
]

const FULL_CHECKPOINTS: CheckpointState[] = [
  { key: 'base_install', name: 'Base installation', status: 'pending' },
  { key: 'repo_analysis', name: 'Repository analysis', status: 'pending' },
  { key: 'stack_conventions', name: 'Stack & conventions', status: 'pending' },
  { key: 'product_discovery', name: 'Product discovery', status: 'pending' },
  { key: 'agent_generation', name: 'Agent generation', status: 'pending' },
  { key: 'command_config', name: 'Command configuration', status: 'pending' },
  { key: 'final_verification', name: 'Final verification', status: 'pending' },
]

// ─── Per-project wizard state cache (survives unmount on tab switch) ─────────

interface WizardSnapshot {
  wizardStep: WizardStep
  checkpoints: CheckpointState[]
  logLines: string[]
  chatMessages: SetupChatMessage[]
  sessionId: string | null
  isStreaming: boolean
  installConfig: InstallConfig
}

const wizardCache = new Map<string, WizardSnapshot>()

// ─── Shared log renderer ──────────────────────────────────────────────────────

const PROSE_CLASSES = `prose prose-invert prose-xs max-w-none
  prose-p:my-1 prose-p:leading-relaxed
  prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold
  prose-ul:my-1 prose-ol:my-1 prose-li:my-0
  prose-code:text-cyan-300 prose-code:text-[10px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
  prose-pre:my-1 prose-pre:bg-muted/30 prose-pre:rounded-md prose-pre:p-2 prose-pre:text-[10px]
  prose-strong:text-foreground prose-em:text-foreground/70
  prose-table:my-2 prose-table:text-[10px]
  prose-thead:border-border prose-thead:bg-muted/30
  prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:font-semibold
  prose-td:px-2 prose-td:py-1 prose-td:border-border
  text-foreground/80`

const SetupLogLines = memo(function SetupLogLines({ lines }: { lines: string[] }) {
  const content = lines.join('\n')
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
})

// ─── Step 1: Agent Selection ──────────────────────────────────────────────────

type AgentSelectionTab = 'agents' | 'models'

function AgentSelectionStep({
  config,
  onChange,
  onInstall,
  onSkip,
  provider,
}: {
  config: InstallConfig
  onChange: (config: InstallConfig) => void
  onInstall: () => void
  onSkip: () => void
  provider: 'claude' | 'codex'
}) {
  const [activeTab, setActiveTab] = useState<AgentSelectionTab>('agents')
  const selectedAgents = ALL_AGENTS.filter((a) => config.selectedAgents.includes(a.id))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-dracula-purple/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-dracula-purple" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Configure your agents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose which agents to install and how to run them.
            </p>
          </div>
        </div>

        {/* Tier selector */}
        <TierSelector
          tier={config.tier}
          onChange={(tier) => onChange({ ...config, tier })}
        />

        {/* Tabs */}
        <div className="flex border-b border-border/30">
          {(['agents', 'models'] as AgentSelectionTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-dracula-purple text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'agents' ? (
                <>
                  <Bot className="w-3 h-3" />
                  Agents
                </>
              ) : (
                <>
                  <Settings2 className="w-3 h-3" />
                  Models
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto px-6 pb-4">
        {activeTab === 'agents' ? (
          <AgentSelector
            selected={config.selectedAgents}
            onChange={(selectedAgents) => onChange({ ...config, selectedAgents })}
          />
        ) : (
          <ModelSelector
            agents={selectedAgents}
            provider={provider}
            preset={config.modelPreset}
            overrides={config.modelOverrides}
            onPresetChange={(modelPreset) => onChange({ ...config, modelPreset })}
            onOverrideChange={(agentId, model) => {
              const next = { ...config.modelOverrides }
              if (model) {
                next[agentId] = model
              } else {
                delete next[agentId]
              }
              onChange({ ...config, modelOverrides: next })
            }}
          />
        )}
      </div>

      {/* Footer actions — install CTA centered, skip left-anchored */}
      <div className="flex-shrink-0 border-t border-border/30 px-6 py-4 relative flex items-center">
        <button
          onClick={onSkip}
          className="absolute left-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <div data-testid="install-cta-wrapper" className="mx-auto">
          <Button
            size="sm"
            className="gap-2"
            onClick={onInstall}
            disabled={config.selectedAgents.length === 0}
          >
            <Package className="w-3.5 h-3.5" />
            {config.tier === 'quick' ? 'Quick Install' : 'Install & Enrich'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Installing ───────────────────────────────────────────────────────

function InstallingStep({
  logLines,
  tier,
  onBack,
}: {
  logLines: string[]
  tier: InstallTier
  onBack: () => void
}) {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto px-6 py-8 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-dracula-purple/20 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-dracula-purple animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Installing specrails...</h2>
            <p className="text-xs text-muted-foreground">
              {tier === 'quick'
                ? 'Installing agents from templates'
                : 'Running npx specrails-core in your project'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1.5 text-xs">
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Button>
      </div>

      <div className="flex-1 rounded-lg border border-border/30 bg-muted/10 overflow-auto p-3 text-[11px] text-muted-foreground space-y-0.5">
        {logLines.length === 0 ? (
          <p className="text-center text-muted-foreground mt-4">Waiting for output...</p>
        ) : (
          <SetupLogLines lines={logLines.slice(-300)} />
        )}
      </div>
    </div>
  )
}

// ─── Step 3 (full only): Enriching ───────────────────────────────────────────

function EnrichStep({
  checkpoints,
  logLines,
  chatMessages,
  isStreaming,
  streamingText,
  sessionId,
  projectId,
  onBack,
  onSendMessage,
}: {
  checkpoints: CheckpointState[]
  logLines: string[]
  chatMessages: SetupChatMessage[]
  isStreaming: boolean
  streamingText: string
  sessionId: string | null
  projectId: string
  onBack: () => void
  onSendMessage: (text: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-border/20">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onBack}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 flex-shrink-0 border-r border-border/30 overflow-hidden">
          <CheckpointTracker
            checkpoints={checkpoints}
            logLines={logLines}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <SetupChat
            projectId={projectId}
            messages={chatMessages}
            isStreaming={isStreaming}
            streamingText={streamingText}
            sessionId={sessionId}
            onSendMessage={onSendMessage}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  projectName,
  summary,
  onGoToProject,
}: {
  projectName: string
  summary: SetupSummary
  onGoToProject: () => void
}) {
  const showPersonas = summary.tier === 'full' && summary.personas > 0
  const tileCount = showPersonas ? 4 : 3

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-6 gap-8">
      <div className="w-16 h-16 rounded-2xl bg-dracula-green/20 flex items-center justify-center">
        <Check className="w-8 h-8 text-dracula-green" />
      </div>

      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold">
          Welcome to <span className="text-dracula-purple">spec</span><span className="text-dracula-pink">rails</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          <strong className="text-foreground">{projectName}</strong> is now configured with
          AI-powered development workflows.{' '}
          {summary.tier === 'full' && summary.personas > 0
            ? 'Your specialized agents, personas, and commands are ready to use.'
            : 'Your specialized agents and commands are ready to use.'}
        </p>
      </div>

      <div className="w-full rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className={cn('grid gap-4 text-center', tileCount === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
          <div>
            <div className="text-2xl font-bold text-dracula-purple">{summary.agents}</div>
            <div className="text-[10px] text-muted-foreground">Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-dracula-green">{summary.specrailsCommands}</div>
            <div className="text-[10px] text-muted-foreground">/specrails:*</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-dracula-cyan">{summary.opsxCommands}</div>
            <div className="text-[10px] text-muted-foreground">/opsx:*</div>
          </div>
          {showPersonas && (
            <div>
              <div className="text-2xl font-bold text-dracula-pink">{summary.personas}</div>
              <div className="text-[10px] text-muted-foreground">Personas</div>
            </div>
          )}
        </div>

        {summary.legacySrRemoved > 0 && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Removed {summary.legacySrRemoved} legacy <code className="text-xs">/sr:*</code> command{summary.legacySrRemoved === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          Learn how to get the most out of specrails:
        </p>
        <a
          href="https://specrails.dev/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-dracula-purple hover:underline"
        >
          specrails.dev/docs
        </a>
      </div>

      <Button size="sm" className="gap-2" onClick={onGoToProject}>
        Continue to project
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

// ─── Error step ───────────────────────────────────────────────────────────────

import { RotateCcw } from 'lucide-react'

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

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ wizardStep, tier }: { wizardStep: WizardStep; tier: InstallTier }) {
  const quickSteps = [
    { id: 'agent-selection', label: 'Configure' },
    { id: 'installing', label: 'Install' },
    { id: 'complete', label: 'Done' },
  ]
  const fullSteps = [
    { id: 'agent-selection', label: 'Configure' },
    { id: 'installing', label: 'Install' },
    { id: 'enriching', label: 'Enrich' },
    { id: 'complete', label: 'Done' },
  ]

  const steps = tier === 'quick' ? quickSteps : fullSteps
  const stepOrder = steps.map((s) => s.id)

  const currentStepId = wizardStep.step === 'error' ? wizardStep.retryStep : wizardStep.step
  const currentIndex = stepOrder.indexOf(currentStepId)

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
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
              <span className={cn(
                'text-[10px] font-medium',
                isCurrent && 'text-foreground',
                !isCurrent && 'text-muted-foreground'
              )}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('w-6 h-px', isDone ? 'bg-dracula-green/50' : 'bg-border/50')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── SetupWizard ──────────────────────────────────────────────────────────────

interface SetupWizardProps {
  project: HubProject
  onComplete: () => void
  onSkip: () => void
}

export function SetupWizard({ project, onComplete: rawOnComplete, onSkip: rawOnSkip }: SetupWizardProps) {
  const onComplete = useCallback(() => { wizardCache.delete(project.id); rawOnComplete() }, [project.id, rawOnComplete])
  const onSkip = useCallback(() => { wizardCache.delete(project.id); rawOnSkip() }, [project.id, rawOnSkip])

  const cached = wizardCache.get(project.id)

  const [wizardStep, setWizardStep] = useState<WizardStep>(cached?.wizardStep ?? { step: 'agent-selection' })
  const [installConfig, setInstallConfig] = useState<InstallConfig>(cached?.installConfig ?? buildDefaultConfig())
  const [checkpoints, setCheckpoints] = useState<CheckpointState[]>(cached?.checkpoints ?? QUICK_CHECKPOINTS)
  const [logLines, setLogLines] = useState<string[]>(cached?.logLines ?? [])
  const [chatMessages, setChatMessages] = useState<SetupChatMessage[]>(cached?.chatMessages ?? [])
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(cached?.isStreaming ?? false)
  const [sessionId, setSessionId] = useState<string | null>(cached?.sessionId ?? null)

  const pendingEnrichStart = useRef(false)
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist refs for cache-on-unmount
  const wizardStepRef = useRef(wizardStep)
  const checkpointsRef = useRef(checkpoints)
  const logLinesRef = useRef(logLines)
  const chatMessagesRef = useRef(chatMessages)
  const sessionIdRef = useRef(sessionId)
  const isStreamingRef = useRef(isStreaming)
  const installConfigRef = useRef(installConfig)

  wizardStepRef.current = wizardStep
  checkpointsRef.current = checkpoints
  logLinesRef.current = logLines
  chatMessagesRef.current = chatMessages
  sessionIdRef.current = sessionId
  isStreamingRef.current = isStreaming
  installConfigRef.current = installConfig

  useEffect(() => {
    return () => {
      wizardCache.set(project.id, {
        wizardStep: wizardStepRef.current,
        checkpoints: checkpointsRef.current,
        logLines: logLinesRef.current,
        chatMessages: chatMessagesRef.current,
        sessionId: sessionIdRef.current,
        isStreaming: isStreamingRef.current,
        installConfig: installConfigRef.current,
      })
    }
  }, [project.id])

  // On remount after tab switch: check if the install/enrich finished while we were away
  useEffect(() => {
    if (wizardStep.step !== 'installing' && wizardStep.step !== 'enriching') return

    async function syncState() {
      try {
        const res = await fetch(`/api/projects/${project.id}/setup/checkpoints`)
        if (!res.ok) return
        const data = await res.json() as {
          checkpoints: CheckpointState[]
          isInstalling: boolean
          isSettingUp: boolean
          savedSessionId: string | null
          logLines?: string[]
          summary?: SetupSummary
        }

        if (data.savedSessionId && !sessionIdRef.current) {
          setSessionId(data.savedSessionId)
        }

        if (data.checkpoints) {
          setCheckpoints((prev) =>
            prev.map((cp) => {
              const serverCp = data.checkpoints!.find((s: CheckpointState) => s.key === cp.key)
              if (!serverCp) return cp
              if (cp.status === 'done' && serverCp.status !== 'done') return cp
              return { ...cp, ...serverCp }
            })
          )
        }

        if (data.logLines && data.logLines.length > 0) {
          setLogLines((prev) => data.logLines!.length > prev.length ? data.logLines! : prev)
        }

        if (!data.isSettingUp && !data.isInstalling) {
          setIsStreaming(false)
        }

        // Install done → advance to enrich (full) or complete (quick)
        if (wizardStep.step === 'installing' && !data.isInstalling) {
          const hasBaseInstall = data.checkpoints?.some(
            (cp: CheckpointState) => cp.key === 'base_install' && cp.status === 'done'
          )
          if (hasBaseInstall) {
            if (installConfigRef.current.tier === 'full') {
              setWizardStep({ step: 'enriching' })
              pendingEnrichStart.current = true
            } else {
              setWizardStep({ step: 'complete', summary: data.summary ?? { ...EMPTY_SUMMARY } })
            }
          }
        }

        // Enrich finished
        const finalDone = data.checkpoints?.find(
          (cp: CheckpointState) => cp.key === 'final_verification'
        )
        if (finalDone?.status === 'done' && !data.isSettingUp) {
          setCheckpoints((prev) => prev.map((cp) => ({ ...cp, status: 'done' as const })))
          setWizardStep({ step: 'complete', summary: data.summary ?? { ...EMPTY_SUMMARY } })
        }
      } catch {
        // non-fatal
      }
    }
    syncState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // ─── WebSocket handler ──────────────────────────────────────────────────────

  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (typeof msg.type !== 'string') return
    if ((msg.projectId as string) !== project.id) return

    switch (msg.type) {
      case 'setup_log': {
        setLogLines((prev) => [...prev, msg.line as string])
        break
      }

      case 'setup_install_done': {
        if (installConfigRef.current.tier === 'full') {
          pendingEnrichStart.current = true
          setWizardStep({ step: 'enriching' })
        } else {
          // Quick install done → complete
          const summary = (msg.summary as SetupSummary | undefined) ?? { ...EMPTY_SUMMARY }
          setWizardStep({ step: 'complete', summary })
        }
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
        const turnSid = msg.sessionId as string | undefined
        if (turnSid) setSessionId(turnSid)
        setStreamingText((prev) => {
          if (prev) setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          return ''
        })
        setIsStreaming(false)
        break
      }

      case 'setup_complete': {
        const sid = msg.sessionId as string | undefined
        if (sid) setSessionId(sid)
        setStreamingText((prev) => {
          if (prev) setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          return ''
        })
        setIsStreaming(false)
        setCheckpoints((prev) => prev.map((cp) => ({ ...cp, status: 'done' as const })))
        setWizardStep({ step: 'complete', summary: msg.summary as SetupSummary })
        break
      }

      case 'setup_error': {
        const error = msg.error as string
        setStreamingText((prev) => {
          if (prev) setChatMessages((msgs) => [...msgs, { role: 'assistant', text: prev }])
          return ''
        })
        setIsStreaming(false)
        const step = wizardStep.step
        const retryStep: 'installing' | 'enriching' =
          step === 'installing' ? 'installing' : 'enriching'
        setWizardStep({ step: 'error', message: error, retryStep })
        break
      }
    }
  }, [project.id, wizardStep.step])

  useLayoutEffect(() => {
    registerHandler(`setup-${project.id}`, handleWsMessage)
    return () => unregisterHandler(`setup-${project.id}`)
  }, [handleWsMessage, registerHandler, unregisterHandler, project.id])

  // Safety streaming timeout
  useEffect(() => {
    if (!isStreaming) {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = null
      }
      return
    }
    if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
    streamingTimeoutRef.current = setTimeout(() => { setIsStreaming(false) }, 30_000)
    return () => { if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current) }
  }, [isStreaming, streamingText])

  useEffect(() => {
    if (!isStreaming && streamingText) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: streamingText }])
      setStreamingText('')
    }
  }, [isStreaming, streamingText])

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleInstall() {
    const cfg = installConfigRef.current
    const provider = (project as { provider?: 'claude' | 'codex' }).provider ?? 'claude'

    // Ensure core agents are always included
    const selectedWithCore = [...new Set([...CORE_AGENTS, ...cfg.selectedAgents])]
    const excluded = ALL_AGENTS.map((a) => a.id).filter((id) => !selectedWithCore.includes(id))

    // Convert model overrides from full IDs to short names (sonnet/haiku/opus)
    const shortOverrides: Record<string, string> = {}
    for (const [agentId, modelId] of Object.entries(cfg.modelOverrides)) {
      if (modelId) shortOverrides[agentId] = toShortModelName(modelId)
    }

    // Reset checkpoints based on tier
    setCheckpoints(cfg.tier === 'quick' ? QUICK_CHECKPOINTS : FULL_CHECKPOINTS)
    setLogLines([])
    setWizardStep({ step: 'installing', tier: cfg.tier })

    // Write install config matching specrails-core's install-config.yaml schema
    try {
      await fetch(`/api/projects/${project.id}/setup/install-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          provider,
          tier: cfg.tier,
          agents: {
            selected: selectedWithCore,
            excluded,
          },
          models: {
            preset: cfg.modelPreset,
            defaults: { model: presetToDefaultModel(cfg.modelPreset) },
            overrides: shortOverrides,
          },
          agent_teams: false,
        }),
      })
    } catch (err) {
      console.error('[SetupWizard] install-config write error:', err)
    }

    fetch(`/api/projects/${project.id}/setup/install`, { method: 'POST' }).catch((err) => {
      console.error('[SetupWizard] install start error:', err)
    })
  }

  function startEnrich() {
    setChatMessages([])
    setStreamingText('')
    setIsStreaming(false)
    fetch(`/api/projects/${project.id}/setup/start`, { method: 'POST' }).catch((err) => {
      console.error('[SetupWizard] enrich start error:', err)
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
    if (retryStep === 'installing') {
      handleInstall()
    } else {
      setWizardStep({ step: 'enriching' })
      startEnrich()
    }
  }

  // Auto-start enrich phase when install completes (full tier)
  useEffect(() => {
    if (wizardStep.step === 'enriching' && pendingEnrichStart.current) {
      pendingEnrichStart.current = false
      startEnrich()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep.step])

  // Determine current tier for step indicator (use config tier, fallback to 'full')
  const currentTier: InstallTier =
    wizardStep.step === 'installing' ? wizardStep.tier : installConfig.tier

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Wizard step indicator */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 py-2">
        <StepIndicator wizardStep={wizardStep} tier={currentTier} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        {wizardStep.step === 'agent-selection' && (
          <AgentSelectionStep
            config={installConfig}
            onChange={setInstallConfig}
            onInstall={handleInstall}
            onSkip={onSkip}
            provider={(project as { provider?: 'claude' | 'codex' }).provider ?? 'claude'}
          />
        )}

        {wizardStep.step === 'installing' && (
          <InstallingStep
            logLines={logLines}
            tier={wizardStep.tier}
            onBack={() => setWizardStep({ step: 'agent-selection' })}
          />
        )}

        {wizardStep.step === 'enriching' && (
          <EnrichStep
            checkpoints={checkpoints}
            logLines={logLines}
            chatMessages={chatMessages}
            isStreaming={isStreaming}
            streamingText={streamingText}
            sessionId={sessionId}
            projectId={project.id}
            onBack={() => setWizardStep({ step: 'installing', tier: installConfig.tier })}
            onSendMessage={handleSendMessage}
          />
        )}

        {wizardStep.step === 'complete' && (
          <CompleteStep
            projectName={project.name}
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
