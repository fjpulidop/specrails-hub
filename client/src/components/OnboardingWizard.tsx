import { useState, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Search,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Command,
  Bot,
  Wrench,
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
    accent: 'text-accent-primary',
    glowClass: 'glow-primary',
    title: 'Welcome to specrails-hub',
    subtitle: 'Your AI-powered development control center',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          specrails-hub turns ideas into shipped code. Write a spec, drop it in a Rail, hit Play &mdash;
          AI handles architecture, implementation, review, and the PR.
        </p>
        <div className="rounded-lg border border-border/30 bg-card/20 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-accent-primary uppercase tracking-wider">The workflow</p>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-accent-info">Add Spec</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-accent-success">Drop in Rail</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-accent-warning">Hit Play</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-accent-secondary">Ship</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Each spec flows through Architect → Developer → Reviewer automatically, with live log streaming at every step.
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Let&apos;s take a quick tour of the key features.
        </p>
      </div>
    ),
  },

  // Step 2: Agents
  {
    icon: <Bot className="w-6 h-6" />,
    accent: 'text-accent-info',
    glowClass: 'glow-info',
    title: 'Specialized Agents',
    subtitle: 'The pipeline runs itself — you stay in control',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Every spec runs through a pipeline of AI agents, each with a focused role. The default pipeline includes four core agents that are always present.
        </p>
        <div className="rounded-lg border border-border/30 bg-card/20 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-accent-info uppercase tracking-wider mb-2">Core agents (always installed)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
            <div><span className="text-accent-info font-medium">Architect</span><span className="text-muted-foreground"> — designs the solution</span></div>
            <div><span className="text-accent-success font-medium">Developer</span><span className="text-muted-foreground"> — writes the code</span></div>
            <div><span className="text-accent-warning font-medium">Reviewer</span><span className="text-muted-foreground"> — runs CI, fixes failures</span></div>
            <div><span className="text-accent-secondary font-medium">Merge Resolver</span><span className="text-muted-foreground"> — handles conflicts</span></div>
          </div>
        </div>
        <FeatureRow
          icon={<Wrench className="w-3.5 h-3.5" />}
          label="Fully customizable"
          description="Agent prompts are plain Markdown files in your project. Add domain knowledge, change behavior, or swap models — no special tools needed."
        />
        <div className="rounded-lg border border-border/30 bg-card/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            <span className="text-accent-info font-medium">Optional agents:</span> Test Writer, Doc Sync, Security Reviewer, Frontend/Backend Reviewers — installed during setup.
          </p>
        </div>
      </div>
    ),
  },

  // Step 3: Multi-project
  {
    icon: <FolderOpen className="w-6 h-6" />,
    accent: 'text-accent-success',
    glowClass: 'glow-success',
    title: 'Multi-Project Hub',
    subtitle: 'All your projects, one place',
    content: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          specrails-hub manages multiple projects simultaneously. Each project gets its own database
          and job queue — completely isolated.
        </p>
        <div className="space-y-3">
          <FeatureRow
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            label="Sidebar navigation"
            description="Projects live in the left sidebar. Click to switch between them, or pin the sidebar open for quick access."
          />
          <FeatureRow
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Guided setup wizard"
            description="Adding a new project? The wizard walks you through installing specrails-core step by step."
          />
        </div>
      </div>
    ),
  },

  // Step 4: Command Palette
  {
    icon: <Search className="w-6 h-6" />,
    accent: 'text-accent-warning',
    glowClass: 'glow-warning',
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
            description="Launch propose-spec, implement, batch-implement, health-check, and more — straight from the palette."
          />
          <FeatureRow
            icon={<Search className="w-3.5 h-3.5" />}
            label="Find anything"
            description="Search recent jobs, navigate to any page, or switch projects — all with fuzzy matching."
          />
        </div>
        <div className="rounded-lg border border-accent-warning/30 bg-accent-warning/5 p-2.5">
          <p className="text-[10px] text-foreground">
            <span className="text-accent-warning font-medium">Pro tip:</span> Press <Kbd>?</Kbd> to see all keyboard shortcuts. You&apos;re all set — start shipping.
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
      if (dontShowAgain) {
        dismissOnboarding()
      }
      setStep(0)
      onClose()
    } else {
      setStep((s) => s + 1)
    }
  }, [isLast, dontShowAgain, onClose])

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
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-xl translate-x-[-50%] translate-y-[-50%] border border-border/30 bg-popover shadow-2xl backdrop-blur-xl sm:rounded-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          data-testid="onboarding-wizard"
          aria-describedby="onboarding-description"
        >
          {/* Accent glow bar at the top */}
          <div className={cn('h-1 w-full rounded-t-xl transition-all duration-500', {
            'bg-accent-primary': step === 0,
            'bg-accent-info': step === 1,
            'bg-accent-success': step === 2,
            'bg-accent-warning': step === 3,
          })} />
          {/* colors: 0=purple, 1=cyan(agents), 2=green(hub), 3=orange(cmd palette) */}

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
            <div className="min-h-[260px]">
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
                          'bg-accent-primary': step === 0,
                          'bg-accent-info': step === 1,
                          'bg-accent-success': step === 2,
                          'bg-accent-secondary': step === 3,
                          'bg-accent-warning': step === 4,
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
                    'bg-accent-primary hover:bg-accent-primary/90 text-primary-foreground': step === 0,
                    'bg-accent-info hover:bg-accent-info/90 text-primary-foreground': step === 1,
                    'bg-accent-success hover:bg-accent-success/90 text-primary-foreground': step === 2,
                    'bg-accent-warning hover:bg-accent-warning/90 text-primary-foreground': step === 3,
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
