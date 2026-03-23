import { useState, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Command,
  GripVertical,
  Pin,
  ChevronDown,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const ONBOARDING_KEY = 'specrails-hub:onboarding-dismissed'

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY)
  } catch {
    // ignore
  }
}

function dismissOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {
    // ignore
  }
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepConfig {
  icon: React.ReactNode
  accent: string
  glowClass: string
  title: string
  subtitle: string
  content: React.ReactNode
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1 rounded border border-border/50 bg-card/80 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  )
}

function FeatureRow({ icon, label, description }: { icon: React.ReactNode; label: string; description: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

const STEPS: StepConfig[] = [
  // Step 1: Welcome
  {
    icon: <Sparkles className="w-6 h-6" />,
    accent: 'text-dracula-purple',
    glowClass: 'glow-purple',
    title: 'Welcome to specrails-hub',
    subtitle: 'Your AI-powered development control center',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          specrails-hub lets you manage multiple AI development projects from a single interface.
          Orchestrate pipelines, stream logs in real-time, and let AI handle the heavy lifting &mdash;
          from architecture to shipping.
        </p>
        <div className="rounded-lg border border-border/30 bg-card/20 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-dracula-purple uppercase tracking-wider">The pipeline</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-dracula-cyan">Architect</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-dracula-green">Developer</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-dracula-orange">Reviewer</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-dracula-pink">Ship</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Each spec flows through these phases automatically, with full visibility at every step.
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Let&apos;s take a quick tour of the key features.
        </p>
      </div>
    ),
  },

  // Step 2: Command Palette
  {
    icon: <Search className="w-6 h-6" />,
    accent: 'text-dracula-cyan',
    glowClass: 'glow-cyan',
    title: 'Command Palette',
    subtitle: 'Your fastest way to navigate',
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Press <Kbd>{navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}</Kbd> <span>+</span> <Kbd>K</Kbd> anywhere to open
        </div>
        <div className="space-y-3">
          <FeatureRow
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            label="Switch projects"
            description="Jump between projects instantly. Your scroll position and route are preserved."
          />
          <FeatureRow
            icon={<Command className="w-3.5 h-3.5" />}
            label="Run spec commands"
            description="Launch propose, implement, batch-implement, and more directly from the palette."
          />
          <FeatureRow
            icon={<Search className="w-3.5 h-3.5" />}
            label="Find anything"
            description="Search across jobs, navigation routes, and project names with fuzzy matching."
          />
        </div>
        <div className="rounded-lg border border-border/30 bg-card/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            <span className="text-dracula-cyan font-medium">Pro tip:</span> Press <Kbd>?</Kbd> to see all keyboard shortcuts at a glance.
          </p>
        </div>
      </div>
    ),
  },

  // Step 3: Dashboard
  {
    icon: <LayoutDashboard className="w-6 h-6" />,
    accent: 'text-dracula-green',
    glowClass: 'glow-green',
    title: 'Your Dashboard',
    subtitle: 'Organize your workspace your way',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          The dashboard is divided into collapsible sections that you can customize to match your workflow.
        </p>
        <div className="space-y-3">
          <FeatureRow
            icon={<GripVertical className="w-3.5 h-3.5" />}
            label="Drag to reorder"
            description="Grab the handle on any section header and drag it to rearrange your layout."
          />
          <FeatureRow
            icon={<ChevronDown className="w-3.5 h-3.5" />}
            label="Collapse & expand"
            description="Click the chevron to collapse sections you don't need right now."
          />
          <FeatureRow
            icon={<Pin className="w-3.5 h-3.5" />}
            label="Pin favorites"
            description="Pin sections to keep them expanded by default. Your layout persists across sessions."
          />
        </div>
        <div className="rounded-lg border border-border/30 bg-card/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            <span className="text-dracula-green font-medium">Sections include:</span> Health overview, Spec commands, Rails features, and recent Jobs.
          </p>
        </div>
      </div>
    ),
  },

  // Step 4: Chat
  {
    icon: <MessageSquare className="w-6 h-6" />,
    accent: 'text-dracula-pink',
    glowClass: 'glow-pink',
    title: 'AI Chat',
    subtitle: 'Your development copilot, always available',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          The chat panel lives in the sidebar of every project. Use it to brainstorm, ask questions about your codebase,
          or let the AI propose specs for you.
        </p>
        <div className="space-y-3">
          <FeatureRow
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Per-project conversations"
            description="Each project has its own chat history. Switch projects and your conversation stays."
          />
          <FeatureRow
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="AI-generated proposals"
            description="The AI can propose spec changes directly from chat. Review and launch them with one click."
          />
          <FeatureRow
            icon={<ArrowRight className="w-3.5 h-3.5" />}
            label="Resizable sidebar"
            description="Drag the edge of the chat panel to resize it, or expand it to full screen for deep work."
          />
        </div>
      </div>
    ),
  },

  // Step 5: Multi-project
  {
    icon: <FolderOpen className="w-6 h-6" />,
    accent: 'text-dracula-orange',
    glowClass: 'glow-orange',
    title: 'Multi-Project Hub',
    subtitle: 'All your projects, one place',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          specrails-hub manages multiple projects simultaneously. Each project gets its own database,
          job queue, and chat — completely isolated.
        </p>
        <div className="space-y-3">
          <FeatureRow
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            label="Tab-based navigation"
            description="Open projects appear as tabs in the top bar. Click to switch, double-click to close."
          />
          <FeatureRow
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Guided setup wizard"
            description="Adding a new project? The wizard walks you through installing specrails-core step by step."
          />
          <FeatureRow
            icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            label="Hub overview & analytics"
            description="See aggregate metrics across all your projects from the top bar navigation."
          />
        </div>
        <div className="rounded-lg border border-dracula-orange/30 bg-dracula-orange/5 p-2.5">
          <p className="text-[10px] text-foreground">
            You&apos;re all set! Start by adding a project or exploring the dashboard.
          </p>
        </div>
      </div>
    ),
  },
]

// ─── OnboardingWizard ─────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  open: boolean
  onClose: () => void
}

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      dismissOnboarding()
    }
    setStep(0)
    onClose()
  }, [dontShowAgain, onClose])

  const handleNext = useCallback(() => {
    if (isLast) {
      dismissOnboarding()
      setStep(0)
      onClose()
    } else {
      setStep((s) => s + 1)
    }
  }, [isLast, onClose])

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogPrimitive.Portal>
        {/* Extra-blurred overlay for premium feel */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] border border-border/30 bg-popover shadow-2xl backdrop-blur-xl sm:rounded-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          data-testid="onboarding-wizard"
          aria-describedby="onboarding-description"
        >
          {/* Accent glow bar at the top */}
          <div className={cn('h-1 w-full rounded-t-xl transition-all duration-500', {
            'bg-dracula-purple': step === 0,
            'bg-dracula-cyan': step === 1,
            'bg-dracula-green': step === 2,
            'bg-dracula-pink': step === 3,
            'bg-dracula-orange': step === 4,
          })} />

          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="space-y-3">
              <div className={cn('flex items-center gap-3', current.accent)}>
                <div className={cn('p-2 rounded-lg border border-border/30 bg-card/30', current.glowClass)}>
                  {current.icon}
                </div>
                <div>
                  <DialogPrimitive.Title className="text-base font-semibold leading-tight">
                    {current.title}
                  </DialogPrimitive.Title>
                  <p id="onboarding-description" className="text-[10px] text-muted-foreground mt-0.5">
                    {current.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="min-h-[200px]">
              {current.content}
            </div>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step
                      ? cn('w-6', {
                          'bg-dracula-purple': step === 0,
                          'bg-dracula-cyan': step === 1,
                          'bg-dracula-green': step === 2,
                          'bg-dracula-pink': step === 3,
                          'bg-dracula-orange': step === 4,
                        })
                      : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              {/* Don't show again — only on first step */}
              <div className="flex-1">
                {isFirst && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="w-3 h-3 rounded"
                      data-testid="onboarding-dismiss-checkbox"
                    />
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                      Don&apos;t show again
                    </span>
                  </label>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="text-xs"
                    data-testid="onboarding-back"
                  >
                    <ArrowLeft className="w-3 h-3 mr-1" />
                    Back
                  </Button>
                )}
                {isFirst && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    className="text-xs text-muted-foreground"
                    data-testid="onboarding-skip"
                  >
                    Skip tour
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  className={cn('text-xs', {
                    'bg-dracula-purple hover:bg-dracula-purple/90 text-primary-foreground': step === 0,
                    'bg-dracula-cyan hover:bg-dracula-cyan/90 text-primary-foreground': step === 1,
                    'bg-dracula-green hover:bg-dracula-green/90 text-primary-foreground': step === 2,
                    'bg-dracula-pink hover:bg-dracula-pink/90 text-primary-foreground': step === 3,
                    'bg-dracula-orange hover:bg-dracula-orange/90 text-primary-foreground': step === 4,
                  })}
                  data-testid="onboarding-next"
                >
                  {isLast ? 'Get Started' : 'Next'}
                  {!isLast && <ArrowRight className="w-3 h-3 ml-1" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
