import { List, StickyNote } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip'
import { cn } from '../lib/utils'
import type { SpecsViewTier } from '../lib/specs-view-tier'

interface SpecsViewTierToggleProps {
  tier: SpecsViewTier
  onChange: (tier: SpecsViewTier) => void
  className?: string
}

interface Option {
  value: SpecsViewTier
  Icon: typeof List
  label: string
}

const OPTIONS: Option[] = [
  { value: 'row', Icon: List, label: 'List view' },
  { value: 'postit', Icon: StickyNote, label: 'Post-it view' },
]

export function SpecsViewTierToggle({ tier, onChange, className }: SpecsViewTierToggleProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="radiogroup"
        aria-label="Specs view"
        className={cn(
          'inline-flex items-center rounded-md border border-accent-secondary/30 bg-accent-secondary/10 p-0.5 shrink-0',
          className,
        )}
      >
        {OPTIONS.map(({ value, Icon, label }) => {
          const active = tier === value
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  onClick={() => onChange(value)}
                  className={cn(
                    'inline-flex items-center justify-center h-6 w-6 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                    active
                      ? 'bg-accent-secondary/40 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent-secondary/20',
                  )}
                  data-testid={`specs-view-tier-${value}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
