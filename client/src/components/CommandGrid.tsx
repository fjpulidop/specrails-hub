import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { getApiBase } from '../lib/api'
import {
  Rocket,
  Layers,
  ClipboardList,
  ChevronRight,
  Sparkles,
  Wrench,
  HeartPulse,
  Shield,
  HelpCircle,
  Play,
  ArrowRight,
  Terminal,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'
import type { CommandInfo } from '../types'

const COMMAND_META: Record<string, { icon: LucideIcon; color: string; glow: string; accent: string }> = {
  'propose-spec': {
    icon: Sparkles,
    color: 'text-accent-info',
    glow: 'hover:shadow-[0_0_20px_rgba(139,233,253,0.15)] hover:border-accent-info/50',
    accent: 'bg-accent-info/10 group-hover:bg-accent-info/20',
  },
  implement: {
    icon: Rocket,
    color: 'text-accent-primary',
    glow: 'hover:shadow-[0_0_20px_rgba(189,147,249,0.15)] hover:border-accent-primary/50',
    accent: 'bg-accent-primary/10 group-hover:bg-accent-primary/20',
  },
  'batch-implement': {
    icon: Layers,
    color: 'text-accent-secondary',
    glow: 'hover:shadow-[0_0_20px_rgba(255,121,198,0.15)] hover:border-accent-secondary/50',
    accent: 'bg-accent-secondary/10 group-hover:bg-accent-secondary/20',
  },
  'product-backlog': {
    icon: ClipboardList,
    color: 'text-accent-info',
    glow: 'hover:shadow-[0_0_20px_rgba(139,233,253,0.15)] hover:border-accent-info/50',
    accent: 'bg-accent-info/10 group-hover:bg-accent-info/20',
  },
  'update-product-driven-backlog': {
    icon: Sparkles,
    color: 'text-accent-success',
    glow: 'hover:shadow-[0_0_20px_rgba(80,250,123,0.15)] hover:border-accent-success/50',
    accent: 'bg-accent-success/10 group-hover:bg-accent-success/20',
  },
  'refactor-recommender': {
    icon: Wrench,
    color: 'text-accent-warning',
    glow: 'hover:shadow-[0_0_20px_rgba(255,184,108,0.15)] hover:border-accent-warning/50',
    accent: 'bg-accent-warning/10 group-hover:bg-accent-warning/20',
  },
  'health-check': {
    icon: HeartPulse,
    color: 'text-accent-success',
    glow: 'hover:shadow-[0_0_20px_rgba(80,250,123,0.15)] hover:border-accent-success/50',
    accent: 'bg-accent-success/10 group-hover:bg-accent-success/20',
  },
  'compat-check': {
    icon: Shield,
    color: 'text-accent-highlight',
    glow: 'hover:shadow-[0_0_20px_rgba(241,250,140,0.12)] hover:border-accent-highlight/50',
    accent: 'bg-accent-highlight/10 group-hover:bg-accent-highlight/20',
  },
  why: {
    icon: HelpCircle,
    color: 'text-muted-foreground',
    glow: 'hover:shadow-[0_0_20px_rgba(189,147,249,0.12)] hover:border-accent-primary/40',
    accent: 'bg-surface/30 group-hover:bg-surface/50',
  },
}

const FALLBACK_META = {
  icon: Play,
  color: 'text-accent-primary',
  glow: 'hover:shadow-[0_0_20px_rgba(189,147,249,0.15)] hover:border-accent-primary/50',
  accent: 'bg-accent-primary/10 group-hover:bg-accent-primary/20',
}

const DISCOVERY_ORDER = ['propose-spec', 'update-product-driven-backlog', 'product-backlog'] as const
const DELIVERY_ORDER  = ['implement', 'batch-implement'] as const
const DISCOVERY_SET   = new Set<string>(DISCOVERY_ORDER)
const DELIVERY_SET    = new Set<string>(DELIVERY_ORDER)
const DISPLAY_NAMES: Record<string, string> = {
  'propose-spec': 'Custom-Propose',
  'update-product-driven-backlog': 'Auto-propose',
  'product-backlog': 'Auto-Select Specs',
}
const HIDDEN_SLUGS = new Set(['propose-feature'])

const WIZARD_COMMANDS = new Set(['implement', 'batch-implement'])

interface SectionHeaderProps {
  label: string
  subtitle?: string
  accent: 'cyan' | 'purple' | 'muted'
  collapsible?: boolean
  open?: boolean
  count?: number
  onToggle?: () => void
}

function SectionHeader({ label, subtitle, accent, collapsible, open, count, onToggle }: SectionHeaderProps) {
  if (collapsible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-90')} />
        {label} ({count})
      </button>
    )
  }

  const barColor = accent === 'cyan'
    ? 'bg-accent-info'
    : accent === 'purple'
    ? 'bg-accent-primary'
    : 'bg-muted-foreground/30'

  const labelColor = accent === 'cyan'
    ? 'text-accent-info'
    : accent === 'purple'
    ? 'text-accent-primary'
    : 'text-muted-foreground'

  const glowBg = accent === 'cyan'
    ? 'bg-accent-info/5'
    : accent === 'purple'
    ? 'bg-accent-primary/5'
    : ''

  return (
    <div className={cn('rounded-lg px-3 py-2.5 mb-3 border border-transparent', glowBg, accent !== 'muted' && 'border-surface/10')}>
      <div className="flex items-center gap-2.5">
        <div className={cn('w-1 h-5 rounded-full shrink-0', barColor)} />
        <div>
          <p className={cn('text-[11px] font-bold uppercase tracking-widest leading-none', labelColor)}>{label}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-tight">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface CommandCardProps {
  cmd: CommandInfo
  onClick: () => void
}

function CommandCard({ cmd, onClick }: CommandCardProps) {
  const isWizard = WIZARD_COMMANDS.has(cmd.slug)
  const meta = COMMAND_META[cmd.slug] ?? FALLBACK_META
  const Icon = meta.icon
  const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'glass-card cursor-pointer group w-full text-left',
            'flex items-center gap-3 px-4 py-3.5',
            'border border-border/30 rounded-xl',
            'transition-all duration-200 active:scale-[0.98]',
            meta.glow,
          )}
          onClick={onClick}
        >
          {/* Icon container */}
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-all duration-200',
            meta.accent,
          )}>
            <Icon className={cn('w-5 h-5 transition-transform duration-200 group-hover:scale-110', meta.color)} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
            {cmd.description && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-tight line-clamp-1">
                {cmd.description}
              </p>
            )}
            {(cmd.totalRuns !== undefined || cmd.lastRunAt) && (
              <div className="flex items-center gap-1.5 mt-1">
                {cmd.totalRuns !== undefined && cmd.totalRuns > 0 && (
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    {cmd.totalRuns} run{cmd.totalRuns !== 1 ? 's' : ''}
                  </span>
                )}
                {cmd.totalRuns !== undefined && cmd.totalRuns > 0 && cmd.lastRunAt && (
                  <span className="text-[10px] text-muted-foreground/30">·</span>
                )}
                {cmd.lastRunAt && (
                  <span className="text-[10px] text-muted-foreground/40">
                    {formatDistanceToNow(new Date(cmd.lastRunAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action hint */}
          {isWizard ? (
            <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent-primary group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-accent-info transition-all duration-200 shrink-0 opacity-0 group-hover:opacity-100" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px]">
        <p className="font-medium font-mono text-[11px]">/specrails:{cmd.slug}</p>
        {cmd.description && (
          <p className="text-muted-foreground mt-0.5">{cmd.description}</p>
        )}
        {isWizard && (
          <p className="text-accent-primary mt-1 text-[10px]">Opens guided wizard</p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

interface CommandGridProps {
  commands: CommandInfo[]
  onOpenWizard: (commandSlug: string) => void
}

async function spawnCommand(command: string, priority?: string): Promise<string> {
  const body: Record<string, string> = { command: `/specrails:${command}` }
  if (priority && priority !== 'normal') body.priority = priority
  const res = await fetch(`${getApiBase()}/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { jobId?: string; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Failed to spawn command')
  return data.jobId!
}

export function CommandGrid({ commands, onOpenWizard }: CommandGridProps) {
  const [othersOpen, setOthersOpen] = useState(false)
  const navigate = useNavigate()

  if (commands.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/30 p-10 text-center space-y-3">
        <Terminal className="w-9 h-9 text-muted-foreground/20 mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">No commands installed</p>
        <p className="text-xs text-muted-foreground/50">
          Run <code className="font-mono">/setup</code> in Claude Code to install specrails commands
        </p>
      </div>
    )
  }

  async function handleCommandClick(cmd: CommandInfo) {
    const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
    if (WIZARD_COMMANDS.has(cmd.slug)) {
      onOpenWizard(cmd.slug)
      return
    }
    const promise = spawnCommand(cmd.slug)
    toast.promise(promise, {
      loading: `Queuing ${displayName}...`,
      success: `${displayName} queued`,
      error: (err: Error) => err.message,
    })
    try {
      const jobId = await promise
      navigate(`/jobs/${jobId}`)
    } catch {
      // handled by toast.promise
    }
  }

  const visibleCommands = commands.filter((c) => !HIDDEN_SLUGS.has(c.slug))
  const bySlug = new Map(visibleCommands.map((c) => [c.slug, c]))
  const discovery = DISCOVERY_ORDER
    .map((s) => bySlug.get(s))
    .filter((c): c is CommandInfo => c !== undefined)
  const delivery = DELIVERY_ORDER
    .map((s) => bySlug.get(s))
    .filter((c): c is CommandInfo => c !== undefined)
  const others = visibleCommands
    .filter((c) => !DISCOVERY_SET.has(c.slug) && !DELIVERY_SET.has(c.slug))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-4">
      {/* Discovery & Delivery side-by-side columns */}
      {(discovery.length > 0 || delivery.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Discovery column (left) */}
          {discovery.length > 0 && (
            <div>
              <SectionHeader
                label="Discovery"
                subtitle="Explore & define your product"
                accent="cyan"
              />
              <div className="space-y-2">
                {discovery.map((cmd) => (
                  <CommandCard key={cmd.id} cmd={cmd} onClick={() => handleCommandClick(cmd)} />
                ))}
              </div>
            </div>
          )}

          {/* Delivery column (right) */}
          {delivery.length > 0 && (
            <div>
              <SectionHeader
                label="Delivery"
                subtitle="Build & ship features"
                accent="purple"
              />
              <div className="space-y-2">
                {delivery.map((cmd) => (
                  <CommandCard key={cmd.id} cmd={cmd} onClick={() => handleCommandClick(cmd)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Others below the columns, collapsible */}
      {others.length > 0 && (
        <section>
          <SectionHeader
            label="Others"
            accent="muted"
            collapsible
            open={othersOpen}
            count={others.length}
            onToggle={() => setOthersOpen(!othersOpen)}
          />
          {othersOpen && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {others.map((cmd) => (
                <CommandCard key={cmd.id} cmd={cmd} onClick={() => handleCommandClick(cmd)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
