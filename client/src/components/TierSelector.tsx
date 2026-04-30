import { Zap, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'

export type InstallTier = 'quick' | 'full'

interface TierSelectorProps {
  tier: InstallTier
  onChange: (tier: InstallTier) => void
}

const TIERS: {
  id: InstallTier
  label: string
  tagline: string
  bullets: string[]
  icon: typeof Zap
  color: string
  borderColor: string
  bgColor: string
  /** If set, the tier is disabled and a "Coming soon"–style badge is shown. */
  badge?: string
}[] = [
  {
    id: 'quick',
    label: 'Quick Setup',
    tagline: 'Agents ready in seconds',
    bullets: [
      'Template agents with sensible defaults',
      'No AI personalization step',
      'Run /specrails:enrich any time to personalize',
    ],
    icon: Zap,
    color: 'text-accent-success',
    borderColor: 'border-accent-success',
    bgColor: 'bg-accent-success/10',
  },
  {
    id: 'full',
    label: 'Full Setup',
    tagline: 'AI-personalized agents',
    bullets: [
      'Codebase analysis & architecture detection',
      'Persona generation for your target users',
      '50+ project-specific placeholders filled',
    ],
    icon: Sparkles,
    color: 'text-accent-primary',
    borderColor: 'border-accent-primary',
    bgColor: 'bg-accent-primary/10',
    badge: 'Coming soon',
  },
]

export function TierSelector({ tier, onChange }: TierSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TIERS.map((t) => {
        const Icon = t.icon
        const disabled = !!t.badge
        const isSelected = tier === t.id && !disabled
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => { if (!disabled) onChange(t.id) }}
            disabled={disabled}
            aria-disabled={disabled}
            title={disabled ? `${t.label} — ${t.badge}` : undefined}
            className={cn(
              'relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              disabled && 'opacity-50 cursor-not-allowed grayscale',
              !disabled && (isSelected
                ? `${t.borderColor} ${t.bgColor}`
                : 'border-border/30 hover:border-border/60'),
              disabled && 'border-border/20',
            )}
          >
            {t.badge && (
              <span className="absolute top-2 right-2 rounded-full bg-muted/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.badge}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Icon className={cn('w-4 h-4', isSelected ? t.color : 'text-muted-foreground')} />
              <div>
                <p className={cn('text-xs font-semibold', isSelected ? t.color : 'text-foreground/80')}>
                  {t.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{t.tagline}</p>
              </div>
            </div>
            <ul className="space-y-1">
              {t.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn('mt-0.5 text-[8px]', isSelected ? t.color : 'text-muted-foreground/50')}>
                    ●
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
          </button>
        )
      })}
    </div>
  )
}
