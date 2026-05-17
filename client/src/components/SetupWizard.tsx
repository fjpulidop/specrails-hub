import { useState, useEffect, useRef, useCallback, useLayoutEffect, memo } from 'react'
import { Check, ArrowRight, Package, Bot, ChevronLeft, Settings2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from './ui/button'
import { type CheckpointState } from './CheckpointTracker'
import { AgentSelector, ALL_AGENTS, CORE_AGENTS, DEFAULT_SELECTED } from './AgentSelector'
import { ModelSelector, type ModelPreset, type ModelOverrides } from './ModelSelector'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { cn } from '../lib/utils'
import type { HubProject } from '../hooks/useHub'
import { usePrerequisites, type SetupPrerequisitesStatus } from '../hooks/usePrerequisites'
import { PrerequisitesPanel } from './PrerequisitesPanel'

// ─── Wizard step types ────────────────────────────────────────────────────────

type WizardStep =
  | { step: 'agent-selection' }
  | { step: 'installing' }
  | { step: 'complete'; summary: SetupSummary }
  | { step: 'error'; message: string; retryStep: 'installing' }

interface SetupSummary {
  agents: number
  specrailsCommands: number
  opsxCommands: number
  legacySrRemoved: number
}

const EMPTY_SUMMARY: SetupSummary = {
  agents: 0,
  specrailsCommands: 0,
  opsxCommands: 0,
  legacySrRemoved: 0,
}

// ─── Install config ───────────────────────────────────────────────────────────

interface InstallConfig {
  selectedAgents: string[]
  modelPreset: ModelPreset
  modelOverrides: ModelOverrides
}

// Prerequisite types and panel are provided by the shared `usePrerequisites` hook
// and `PrerequisitesPanel` component (see imports below).

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
    selectedAgents: [...DEFAULT_SELECTED],
    modelPreset: 'balanced',
    modelOverrides: {},
  }
}

// ─── Initial checkpoint states ────────────────────────────────────────────────

const INSTALL_CHECKPOINTS: CheckpointState[] = [
  { key: 'base_install', name: 'Base installation', status: 'pending' },
  { key: 'agent_selection', name: 'Agent selection', status: 'pending' },
  { key: 'agent_generation', name: 'Agent generation', status: 'pending' },
]

// ─── Per-project wizard state cache (survives unmount on tab switch) ─────────

interface WizardSnapshot {
  wizardStep: WizardStep
  checkpoints: CheckpointState[]
  logLines: string[]
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
  prerequisites,
  prerequisitesLoading,
  prerequisitesError,
  onRefreshPrerequisites,
}: {
  config: InstallConfig
  onChange: (config: InstallConfig) => void
  onInstall: () => void
  onSkip: () => void
  provider: 'claude' | 'codex'
  prerequisites: SetupPrerequisitesStatus | null
  prerequisitesLoading: boolean
  prerequisitesError: Error | null
  onRefreshPrerequisites: () => void
}) {
  const [activeTab, setActiveTab] = useState<AgentSelectionTab>('agents')
  const selectedAgents = ALL_AGENTS.filter((a) => config.selectedAgents.includes(a.id))
  // Treat null/loading as ok (don't block install on a slow fetch); only block on a definitive negative
  // answer where the server reports `ok: false`.
  const prereqsBlock = prerequisites !== null && !prerequisites.ok && !prerequisitesError
  const installDisabled = config.selectedAgents.length === 0 || prereqsBlock

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Configure your agents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose which agents to install and how to run them.
            </p>
          </div>
        </div>

        <PrerequisitesPanel
          status={prerequisites}
          isLoading={prerequisitesLoading}
          error={prerequisitesError}
          onRefresh={onRefreshPrerequisites}
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
                  ? 'border-accent-primary text-foreground'
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
            disabled={installDisabled}
          >
            <Package className="w-3.5 h-3.5" />
            Install
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Installing ───────────────────────────────────────────────────────

function InstallingStep({
  logLines,
  onBack,
}: {
  logLines: string[]
  onBack: () => void
}) {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto px-6 py-8 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-accent-primary animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Installing specrails...</h2>
            <p className="text-xs text-muted-foreground">Installing agents from templates</p>
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

// ─── Step 3: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  projectName,
  summary,
  onGoToProject,
}: {
  projectName: string
  summary: SetupSummary
  onGoToProject: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-6 gap-8">
      <div className="w-16 h-16 rounded-2xl bg-accent-success/20 flex items-center justify-center">
        <Check className="w-8 h-8 text-accent-success" />
      </div>

      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold">
          Welcome to <span className="text-accent-primary">spec</span><span className="text-accent-secondary">rails</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          <strong className="text-foreground">{projectName}</strong> is now configured with
          AI-powered development workflows. Your specialized agents and commands are ready to use.
        </p>
      </div>

      <div className="w-full rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-accent-primary">{summary.agents}</div>
            <div className="text-[10px] text-muted-foreground">Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent-success">{summary.specrailsCommands}</div>
            <div className="text-[10px] text-muted-foreground">/specrails:*</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent-info">{summary.opsxCommands}</div>
            <div className="text-[10px] text-muted-foreground">/opsx:*</div>
          </div>
        </div>

        {summary.legacySrRemoved > 0 && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Removed {summary.legacySrRemoved} legacy <code className="text-xs">/specrails:*</code> command{summary.legacySrRemoved === 1 ? '' : 's'}
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
          className="text-xs text-accent-primary hover:underline"
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

function StepIndicator({ wizardStep }: { wizardStep: WizardStep }) {
  const steps = [
    { id: 'agent-selection', label: 'Configure' },
    { id: 'installing', label: 'Install' },
    { id: 'complete', label: 'Done' },
  ]
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
                  isDone && 'bg-accent-success text-background',
                  isCurrent && 'bg-accent-primary text-background',
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
              <div className={cn('w-6 h-px', isDone ? 'bg-accent-success/50' : 'bg-border/50')} />
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
  const [checkpoints, setCheckpoints] = useState<CheckpointState[]>(cached?.checkpoints ?? INSTALL_CHECKPOINTS)
  const [logLines, setLogLines] = useState<string[]>(cached?.logLines ?? [])
  const {
    status: setupPrerequisites,
    isLoading: isRefreshingPrerequisites,
    error: setupPrerequisitesError,
    recheck: refreshSetupPrerequisites,
  } = usePrerequisites()

  // Persist refs for cache-on-unmount
  const wizardStepRef = useRef(wizardStep)
  const checkpointsRef = useRef(checkpoints)
  const logLinesRef = useRef(logLines)
  const installConfigRef = useRef(installConfig)

  wizardStepRef.current = wizardStep
  checkpointsRef.current = checkpoints
  logLinesRef.current = logLines
  installConfigRef.current = installConfig

  useEffect(() => {
    return () => {
      wizardCache.set(project.id, {
        wizardStep: wizardStepRef.current,
        checkpoints: checkpointsRef.current,
        logLines: logLinesRef.current,
        installConfig: installConfigRef.current,
      })
    }
  }, [project.id])

  // On remount after tab switch: check if the install finished while we were away
  useEffect(() => {
    if (wizardStep.step !== 'installing') return

    async function syncState() {
      try {
        const res = await fetch(`/api/projects/${project.id}/setup/checkpoints`)
        if (!res.ok) return
        const data = await res.json() as {
          checkpoints: CheckpointState[]
          isInstalling: boolean
          isSettingUp: boolean
          logLines?: string[]
          summary?: SetupSummary
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

        if (wizardStep.step === 'installing' && !data.isInstalling) {
          const hasBaseInstall = data.checkpoints?.some(
            (cp: CheckpointState) => cp.key === 'base_install' && cp.status === 'done'
          )
          if (hasBaseInstall) {
            setWizardStep({ step: 'complete', summary: data.summary ?? { ...EMPTY_SUMMARY } })
          }
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
        const summary = (msg.summary as SetupSummary | undefined) ?? { ...EMPTY_SUMMARY }
        setWizardStep({ step: 'complete', summary })
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

      case 'setup_error': {
        const error = msg.error as string
        setWizardStep({ step: 'error', message: error, retryStep: 'installing' })
        break
      }
    }
  }, [project.id])

  useLayoutEffect(() => {
    registerHandler(`setup-${project.id}`, handleWsMessage)
    return () => unregisterHandler(`setup-${project.id}`)
  }, [handleWsMessage, registerHandler, unregisterHandler, project.id])

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleInstall() {
    const cfg = installConfigRef.current
    const provider = (project as { provider?: 'claude' | 'codex' }).provider ?? 'claude'

    if (setupPrerequisites !== null && !setupPrerequisites.ok) {
      setWizardStep({
        step: 'error',
        retryStep: 'installing',
        message: [
          'SpecRails setup needs Node.js, npm, npx and Git available on PATH before it can install this project.',
          'Install the missing tools, restart SpecRails Hub, then retry setup.',
        ].join('\n\n'),
      })
      return
    }

    // Ensure core agents are always included
    const selectedWithCore = [...new Set([...CORE_AGENTS, ...cfg.selectedAgents])]
    const excluded = ALL_AGENTS.map((a) => a.id).filter((id) => !selectedWithCore.includes(id))

    // Convert model overrides from full IDs to short names (sonnet/haiku/opus)
    const shortOverrides: Record<string, string> = {}
    for (const [agentId, modelId] of Object.entries(cfg.modelOverrides)) {
      if (modelId) shortOverrides[agentId] = toShortModelName(modelId)
    }

    setCheckpoints(INSTALL_CHECKPOINTS)
    setLogLines([])
    setWizardStep({ step: 'installing' })

    // Write install config matching specrails-core's install-config.yaml schema.
    // `tier: 'quick'` is hardcoded — the hub only exposes the template-agent
    // install flow now; the legacy AI-enrich flow lives in specrails-core's
    // standalone `npx specrails-core@latest init` for users who want it.
    try {
      await fetch(`/api/projects/${project.id}/setup/install-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          provider,
          tier: 'quick',
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

  function handleRetry() {
    if (wizardStep.step !== 'error') return
    handleInstall()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Wizard step indicator */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 py-2">
        <StepIndicator wizardStep={wizardStep} />
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
            prerequisites={setupPrerequisites}
            prerequisitesLoading={isRefreshingPrerequisites}
            prerequisitesError={setupPrerequisitesError}
            onRefreshPrerequisites={refreshSetupPrerequisites}
          />
        )}

        {wizardStep.step === 'installing' && (
          <InstallingStep
            logLines={logLines}
            onBack={() => setWizardStep({ step: 'agent-selection' })}
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
