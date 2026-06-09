import { useState, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Sparkles,
  MessageSquare,
  Zap,
  Globe,
  Scissors,
  Save,
  Columns2,
  Workflow,
  GitBranch,
  Bot,
  Gauge,
  FolderOpen,
  Coins,
  DollarSign,
  Wallet,
  Receipt,
  Boxes,
  Terminal,
  FileCode,
  Plug,
  Palette,
  Layers,
  Command,
  Keyboard,
  Rocket,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? '⌥' : 'Alt'

// ─── Accent palette ─────────────────────────────────────────────────────────
// Literal class strings (no interpolation) so Tailwind keeps them in the build.

interface Accent {
  text: string
  bar: string
  glow: string
  btn: string
  softBorder: string
  softBg: string
  chipBg: string
}

const ACCENTS: Record<string, Accent> = {
  primary: {
    text: 'text-accent-primary',
    bar: 'bg-accent-primary',
    glow: 'glow-primary',
    btn: 'bg-accent-primary hover:bg-accent-primary/90 text-primary-foreground',
    softBorder: 'border-accent-primary/30',
    softBg: 'bg-accent-primary/5',
    chipBg: 'bg-accent-primary/10 text-accent-primary',
  },
  info: {
    text: 'text-accent-info',
    bar: 'bg-accent-info',
    glow: 'glow-info',
    btn: 'bg-accent-info hover:bg-accent-info/90 text-primary-foreground',
    softBorder: 'border-accent-info/30',
    softBg: 'bg-accent-info/5',
    chipBg: 'bg-accent-info/10 text-accent-info',
  },
  success: {
    text: 'text-accent-success',
    bar: 'bg-accent-success',
    glow: 'glow-success',
    btn: 'bg-accent-success hover:bg-accent-success/90 text-primary-foreground',
    softBorder: 'border-accent-success/30',
    softBg: 'bg-accent-success/5',
    chipBg: 'bg-accent-success/10 text-accent-success',
  },
  secondary: {
    text: 'text-accent-secondary',
    bar: 'bg-accent-secondary',
    glow: 'glow-secondary',
    btn: 'bg-accent-secondary hover:bg-accent-secondary/90 text-primary-foreground',
    softBorder: 'border-accent-secondary/30',
    softBg: 'bg-accent-secondary/5',
    chipBg: 'bg-accent-secondary/10 text-accent-secondary',
  },
  warning: {
    text: 'text-accent-warning',
    bar: 'bg-accent-warning',
    glow: 'glow-warning',
    btn: 'bg-accent-warning hover:bg-accent-warning/90 text-primary-foreground',
    softBorder: 'border-accent-warning/30',
    softBg: 'bg-accent-warning/5',
    chipBg: 'bg-accent-warning/10 text-accent-warning',
  },
  highlight: {
    text: 'text-accent-highlight',
    bar: 'bg-accent-highlight',
    glow: 'glow-highlight',
    btn: 'bg-accent-highlight hover:bg-accent-highlight/90 text-primary-foreground',
    softBorder: 'border-accent-highlight/30',
    softBg: 'bg-accent-highlight/5',
    chipBg: 'bg-accent-highlight/10 text-accent-highlight',
  },
}

// ─── Reusable bits ────────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded border border-border/60 bg-card/80 font-mono text-[11px] text-foreground shadow-sm">
      {children}
    </kbd>
  )
}

function Feature({
  icon,
  label,
  children,
  accent,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  accent: Accent
}) {
  return (
    <div className="flex gap-3 items-start">
      <div className={cn('mt-0.5 shrink-0 grid place-items-center w-7 h-7 rounded-md border border-border/40', accent.softBg, accent.text)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function Callout({ accent, label, children }: { accent: Accent; label?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border p-3', accent.softBorder, accent.softBg)}>
      {label && <p className={cn('text-[10px] font-semibold uppercase tracking-wider mb-1.5', accent.text)}>{label}</p>}
      <div className="text-xs text-foreground/90 leading-relaxed">{children}</div>
    </div>
  )
}

function FlowStrip({ steps }: { steps: { label: string; cls: string }[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[13px] font-medium">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-2">
          <span className={s.cls}>{s.label}</span>
          {i < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </span>
      ))}
    </div>
  )
}

// ─── Step definitions ───────────────────────────────────────────────────────

interface StepConfig {
  navLabel: string
  icon: React.ReactNode
  accent: Accent
  title: string
  subtitle: string
  content: React.ReactNode
}

const STEPS: StepConfig[] = [
  // 1 — Welcome
  {
    navLabel: 'Welcome',
    icon: <Sparkles className="w-6 h-6" />,
    accent: ACCENTS.primary,
    title: 'Welcome to specrails-hub',
    subtitle: 'Your local cockpit for shipping software with AI agents',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          specrails-hub turns an idea into shipped code — and lets you <span className="text-foreground font-medium">see, steer, and trust</span> every
          step. Draft a spec by talking to an AI, drop it on an execution rail, and hit Play. The pipeline handles
          architecture, implementation, review and the pull request, streaming its work live the whole way.
        </p>
        <Callout accent={ACCENTS.primary} label="The core loop">
          <FlowStrip
            steps={[
              { label: 'Add Spec', cls: 'text-accent-info' },
              { label: 'Drop in a Rail', cls: 'text-accent-success' },
              { label: 'Hit Play', cls: 'text-accent-warning' },
              { label: 'Ship', cls: 'text-accent-secondary' },
            ]}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Each spec flows through <span className="text-foreground">Architect → Developer → Reviewer → Ship</span> automatically.
          </p>
        </Callout>
        <div className="flex gap-3 items-start">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-accent-success" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">100% local · single user · no accounts.</span> Everything runs on your
            machine. Your code never leaves the laptop unless <span className="italic">you</span> spawn an agent against it.
          </p>
        </div>
        <p className="text-xs text-muted-foreground italic">This quick tour walks through everything the hub can do — about a minute.</p>
      </div>
    ),
  },

  // 2 — Author specs
  {
    navLabel: 'Author specs',
    icon: <MessageSquare className="w-6 h-6" />,
    accent: ACCENTS.info,
    title: 'Turn ideas into specs',
    subtitle: 'Six ways to capture exactly what you want built',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          A <span className="text-foreground font-medium">spec</span> is a description of work you want done. Author one however suits the moment —
          from a quick one-liner to a full conversation with the AI.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
          <Feature icon={<MessageSquare className="w-4 h-4" />} label="Explore — converse" accent={ACCENTS.info}>
            Describe what you want in a chat; a live draft rebuilds itself every turn. A preset slider tunes how much project
            context the AI sees — from your message only, up to the full codebase plus your MCP servers.
          </Feature>
          <Feature icon={<Zap className="w-4 h-4" />} label="Quick — one shot" accent={ACCENTS.info}>
            Already know what you want? Generate a complete spec in a single turn. Optionally enrich it with a Contract Layer:
            exact names, data shapes, invariants and a file-touch list so the agents don&apos;t reinvent anything.
          </Feature>
          <Feature icon={<Globe className="w-4 h-4" />} label="From a website" accent={ACCENTS.info}>
            Opens an embedded browser. Hover-select an element or drag a rectangle, and the screenshot, DOM and applied CSS
            become attachments. The desktop build ships its own Chromium, so it works offline.
          </Feature>
          <Feature icon={<Scissors className="w-4 h-4" />} label="SMASH a big epic" accent={ACCENTS.info}>
            Explode a large spec into a family of smaller sub-specs in one click — each child carries a short summary on its card.
          </Feature>
          <Feature icon={<Save className="w-4 h-4" />} label="Drafts &amp; Continue Editing" accent={ACCENTS.info}>
            Park an in-progress exploration as a draft ticket and resume it later; reopen any spec back in Explore to keep refining it.
          </Feature>
          <Feature icon={<Columns2 className="w-4 h-4" />} label="Compare side by side" accent={ACCENTS.info}>
            Drag a spec to the screen edge and a picker of your other specs slides in — review two of them together, tablet-style.
          </Feature>
        </div>
      </div>
    ),
  },

  // 3 — Run the pipeline (rails)
  {
    navLabel: 'Run on rails',
    icon: <Workflow className="w-6 h-6" />,
    accent: ACCENTS.success,
    title: 'Run the pipeline on rails',
    subtitle: 'Organize specs into lanes, then launch the agents',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The right side of the Dashboard is your <span className="text-foreground font-medium">Rails</span> — execution lanes. Drag a spec card onto a
          rail and press <span className="text-accent-warning font-medium">▶ Play</span> to launch an implementation job.
        </p>
        <Callout accent={ACCENTS.success} label="What each job runs">
          <FlowStrip
            steps={[
              { label: 'Architect', cls: 'text-accent-info' },
              { label: 'Developer', cls: 'text-accent-success' },
              { label: 'Reviewer', cls: 'text-accent-warning' },
              { label: 'Ship', cls: 'text-accent-secondary' },
            ]}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">Every phase streams its logs live as it works.</p>
        </Callout>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
          <Feature icon={<GitBranch className="w-4 h-4" />} label="Pick how a rail runs" accent={ACCENTS.success}>
            Each rail chooses a mode: <span className="text-foreground">Implement</span> (the full structured pipeline),
            <span className="text-foreground"> Batch</span> (several specs in sequence), or <span className="text-foreground">Ultracode</span>
            {' '}(Claude works autonomously, no fixed pipeline).
          </Feature>
          <Feature icon={<Bot className="w-4 h-4" />} label="Agent profiles" accent={ACCENTS.success}>
            A per-project, declarative catalog that decides which agents run and which model each one uses — picked per rail and
            snapshotted per job so concurrent work stays isolated.
          </Feature>
          <Feature icon={<Gauge className="w-4 h-4" />} label="Live job detail" accent={ACCENTS.success}>
            Every job shows a ticket-identity header, a live duration ticker and running turn/token counts, with the authoritative
            cost resolved on exit.
          </Feature>
          <Feature icon={<FolderOpen className="w-4 h-4" />} label="Many projects, isolated" accent={ACCENTS.success}>
            Each project has its own database and job queue. Run different projects at the same time and switch between them from the
            left sidebar — your place is remembered per project.
          </Feature>
        </div>
      </div>
    ),
  },

  // 4 — Providers
  {
    navLabel: 'Your agent',
    icon: <Bot className="w-6 h-6" />,
    accent: ACCENTS.secondary,
    title: 'Bring your own agent',
    subtitle: 'Claude Code and Codex, as first-class engines',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The hub treats <span className="text-foreground font-medium">Claude Code</span> and <span className="text-foreground font-medium">Codex CLI</span>
          {' '}as interchangeable engines behind one contract. A project can install one or both — the choice is made at install time.
        </p>
        <div className="rounded-lg border border-border/40 overflow-hidden text-xs">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-card/40">
            <div className="px-3 py-2 font-semibold text-muted-foreground">Capability</div>
            <div className="px-3 py-2 font-semibold text-accent-secondary text-center">Claude Code</div>
            <div className="px-3 py-2 font-semibold text-accent-success text-center">Codex CLI</div>
          </div>
          {[
            ['Streaming & session resume', 'Native', 'Native'],
            ['Cost reporting', 'Provider-billed', 'Estimated (~)'],
            ['Telemetry (OTEL)', 'Native', 'Synthesized'],
            ['Agent profiles', 'Yes', '—'],
          ].map((row) => (
            <div key={row[0]} className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-border/30">
              <div className="px-3 py-2 text-foreground/90">{row[0]}</div>
              <div className="px-3 py-2 text-center text-muted-foreground">{row[1]}</div>
              <div className="px-3 py-2 text-center text-muted-foreground">{row[2]}</div>
            </div>
          ))}
        </div>
        <Callout accent={ACCENTS.secondary} label="When both are installed">
          Pick the engine <span className="text-foreground">per spec, per rail, or per terminal launch</span>. The hub remembers your
          last choice per project. Codex cost is estimated from a local rate-card and always flagged with a <span className="font-mono">~</span>.
        </Callout>
      </div>
    ),
  },

  // 5 — Cost
  {
    navLabel: 'Track cost',
    icon: <Coins className="w-6 h-6" />,
    accent: ACCENTS.warning,
    title: 'Track every cent',
    subtitle: 'Every billable invocation, recorded and visualized',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every AI invocation — across rails, Quick, Explore, AI edits, SMASH and file summaries — is recorded for
          <span className="text-foreground font-medium"> both Claude and Codex</span>. No more guessing what the agents cost.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
          <Feature icon={<Gauge className="w-4 h-4" />} label="Analytics page" accent={ACCENTS.warning}>
            A burn-rate hero, daily timeline, top tickets, model breakdown and a cost-vs-turns scatter. Filter by period
            (7d / 30d / 90d / All) and by surface.
          </Feature>
          <Feature icon={<Receipt className="w-4 h-4" />} label="Per-ticket spending" accent={ACCENTS.warning}>
            Each spec&apos;s detail shows what it cost and how many turns it took, deep-linking into Analytics filtered to that ticket.
          </Feature>
          <Feature icon={<DollarSign className="w-4 h-4" />} label="Honest numbers" accent={ACCENTS.warning}>
            Claude cost is the provider-billed figure; Codex is estimated and flagged with <span className="font-mono">~</span>. Token totals
            include the cache tiers, so the figures actually reconcile.
          </Feature>
          <Feature icon={<Wallet className="w-4 h-4" />} label="Budgets &amp; alerts" accent={ACCENTS.warning}>
            Set a daily budget and a per-job cost alert; the hub auto-pauses the queue when you cross the line. Export anything to CSV or JSON.
          </Feature>
        </div>
      </div>
    ),
  },

  // 6 — Workspace
  {
    navLabel: 'Workspace',
    icon: <Boxes className="w-6 h-6" />,
    accent: ACCENTS.highlight,
    title: 'Make it your workspace',
    subtitle: 'Everything you need without leaving the window',
    content: (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
          <Feature icon={<Terminal className="w-4 h-4" />} label="Terminal panel" accent={ACCENTS.highlight}>
            A real VS-Code-style terminal at the bottom (<Kbd>{MOD}</Kbd> <Kbd>J</Kbd>) — WebGL rendering, search, inline images,
            drag-drop paths and shell integration. Up to 10 sessions per project.
          </Feature>
          <Feature icon={<FileCode className="w-4 h-4" />} label="Code explorer" accent={ACCENTS.highlight}>
            A read-only file tree and Monaco viewer with plain-language AI summaries and &ldquo;touched by AI&rdquo; provenance chips,
            so anyone can follow what changed and why.
          </Feature>
          <Feature icon={<Plug className="w-4 h-4" />} label="Integrations" accent={ACCENTS.highlight}>
            A per-project marketplace of MCP integrations — Serena semantic code-navigation is bundled. Installs are additive:
            adding one never disturbs another.
          </Feature>
          <Feature icon={<Palette className="w-4 h-4" />} label="Themes" accent={ACCENTS.highlight}>
            Five built-in themes — specrails (default), dracula, aurora-light, obsidian-dark and matrix — applied before the UI
            paints, so there&apos;s no flash. Change them in Settings → Appearance.
          </Feature>
          <Feature icon={<Layers className="w-4 h-4" />} label="Minimizable chats" accent={ACCENTS.highlight}>
            Park an Explore or AI-Edit session into a dock chip and pick it back up later — never lost across refreshes or project switches.
          </Feature>
          <Feature icon={<Rocket className="w-4 h-4" />} label="Desktop or browser" accent={ACCENTS.highlight}>
            Run the hub in your browser, or grab the signed desktop app (macOS &amp; Windows) that bundles its own server and runtimes.
          </Feature>
        </div>
      </div>
    ),
  },

  // 7 — Move fast / get started
  {
    navLabel: 'Move fast',
    icon: <Command className="w-6 h-6" />,
    accent: ACCENTS.primary,
    title: 'Move at the speed of thought',
    subtitle: 'Keyboard-first, everywhere',
    content: (
      <div className="space-y-4">
        <Callout accent={ACCENTS.primary} label="Command palette">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-foreground">Press</span> <Kbd>{MOD}</Kbd> <span className="text-muted-foreground">+</span> <Kbd>K</Kbd>
            <span className="text-muted-foreground">anywhere</span>
          </div>
          Switch projects, run spec commands, jump to any page and find recent jobs — all with fuzzy search.
        </Callout>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
          <Feature icon={<Terminal className="w-4 h-4" />} label="Terminal panel" accent={ACCENTS.primary}>
            Toggle with <Kbd>{MOD}</Kbd> <Kbd>J</Kbd>.
          </Feature>
          <Feature icon={<Keyboard className="w-4 h-4" />} label="All shortcuts" accent={ACCENTS.primary}>
            Press <Kbd>?</Kbd> to see the full cheat-sheet.
          </Feature>
          <Feature icon={<MessageSquare className="w-4 h-4" />} label="Chat sidebar" accent={ACCENTS.primary}>
            Toggle the right sidebar with <Kbd>{MOD}</Kbd> <Kbd>B</Kbd>.
          </Feature>
          <Feature icon={<FolderOpen className="w-4 h-4" />} label="Projects sidebar" accent={ACCENTS.primary}>
            Toggle the left Arc sidebar with <Kbd>{ALT}</Kbd> <Kbd>{MOD}</Kbd> <Kbd>B</Kbd>.
          </Feature>
        </div>
        <Callout accent={ACCENTS.primary}>
          <span className="text-foreground font-medium">That&apos;s the tour.</span> Add a project from the left sidebar and ship your first
          spec. You can reopen this walkthrough anytime from Settings.
        </Callout>
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
    if (dontShowAgain) dismissOnboarding()
    setStep(0)
    onClose()
  }, [dontShowAgain, onClose])

  // Completing the whole tour counts as "seen".
  const handleFinish = useCallback(() => {
    dismissOnboarding()
    setStep(0)
    onClose()
  }, [onClose])

  const handleNext = useCallback(() => {
    if (isLast) handleFinish()
    else setStep((s) => s + 1)
  }, [isLast, handleFinish])

  const handleBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), [])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-[calc(100vw-2rem)] max-w-4xl max-h-[88vh] translate-x-[-50%] translate-y-[-50%] overflow-hidden border border-border/30 bg-popover shadow-2xl backdrop-blur-xl sm:rounded-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="onboarding-wizard"
          aria-describedby="onboarding-description"
        >
          {/* Accent glow bar */}
          <div className={cn('h-1 w-full transition-all duration-500', current.accent.bar)} />

          <div className="flex min-h-0">
            {/* ── Left step navigation ── */}
            <nav className="hidden md:flex w-60 shrink-0 flex-col border-r border-border/30 bg-card/20 p-4">
              <div className="px-2 mb-5">
                <p className="text-sm font-bold tracking-tight">
                  <span className="text-accent-primary">spec</span>
                  <span className="text-accent-secondary">rails</span>
                  <span className="text-muted-foreground"> hub</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Product tour</p>
              </div>
              <ol className="space-y-0.5">
                {STEPS.map((s, i) => {
                  const isActive = i === step
                  const isDone = i < step
                  return (
                    <li key={s.navLabel}>
                      <button
                        type="button"
                        onClick={() => setStep(i)}
                        aria-label={`Go to step ${i + 1}: ${s.navLabel}`}
                        aria-current={isActive ? 'step' : undefined}
                        className={cn(
                          'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          isActive ? cn('bg-card/70', s.accent.text) : 'text-muted-foreground hover:bg-card/40 hover:text-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'grid place-items-center w-5 h-5 shrink-0 rounded-full text-[10px] font-bold border',
                            isActive
                              ? cn(s.accent.bar, 'text-primary-foreground border-transparent')
                              : isDone
                                ? 'bg-accent-success/15 text-accent-success border-accent-success/30'
                                : 'border-border/50 text-muted-foreground'
                          )}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : i + 1}
                        </span>
                        <span className="text-xs font-medium truncate">{s.navLabel}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
              <div className="mt-auto px-2.5 pt-4 text-[10px] text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </div>
            </nav>

            {/* ── Right content ── */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-6 sm:p-7">
                {/* Header */}
                <div className={cn('flex items-center gap-3.5 mb-5', current.accent.text)}>
                  <div className={cn('grid place-items-center w-12 h-12 shrink-0 rounded-xl border border-border/30 bg-card/40', current.accent.glow)}>
                    {current.icon}
                  </div>
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="text-lg font-bold leading-tight text-foreground">
                      {current.title}
                    </DialogPrimitive.Title>
                    <p id="onboarding-description" className="text-xs text-muted-foreground mt-0.5">
                      {current.subtitle}
                    </p>
                  </div>
                </div>

                {/* Mobile progress (left nav hidden) */}
                <div className="md:hidden flex items-center gap-1.5 mb-5">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.navLabel}
                      type="button"
                      onClick={() => setStep(i)}
                      aria-label={`Step ${i + 1}`}
                      className={cn('h-1.5 rounded-full transition-all', i === step ? cn('w-6', s.accent.bar) : 'w-1.5 bg-muted-foreground/30')}
                    />
                  ))}
                </div>

                {/* Step body */}
                <div className="min-h-[300px]">{current.content}</div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-border/30 px-6 sm:px-7 py-3.5">
                <div className="flex-1 min-w-0">
                  {isFirst && (
                    <label className="inline-flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={dontShowAgain}
                        onChange={(e) => setDontShowAgain(e.target.checked)}
                        className="w-3.5 h-3.5 rounded"
                        data-testid="onboarding-dismiss-checkbox"
                      />
                      <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                        Don&apos;t show this again
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isFirst ? (
                    <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs text-muted-foreground" data-testid="onboarding-skip">
                      Skip tour
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={handleBack} className="text-xs" data-testid="onboarding-back">
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button size="sm" onClick={handleNext} className={cn('text-xs', current.accent.btn)} data-testid="onboarding-next">
                    {isLast ? 'Get Started' : 'Next'}
                    {!isLast && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
