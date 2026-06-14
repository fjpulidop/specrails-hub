import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-500/20 aurora-light:bg-accent-success/10 text-emerald-400 aurora-light:text-accent-success border-emerald-500/30 aurora-light:border-accent-success/30',
        warning: 'border-transparent bg-amber-500/20 aurora-light:bg-accent-warning/10 text-amber-400 aurora-light:text-accent-warning border-amber-500/30 aurora-light:border-accent-warning/30',
        running: 'border-transparent bg-blue-500/20 aurora-light:bg-accent-info/10 text-blue-400 aurora-light:text-accent-info border-blue-500/30 aurora-light:border-accent-info/30',
        queued: 'border-transparent bg-slate-500/20 aurora-light:bg-muted text-slate-400 aurora-light:text-muted-foreground border-slate-500/30 aurora-light:border-border',
        failed: 'border-transparent bg-red-500/20 aurora-light:bg-destructive/10 text-red-400 aurora-light:text-destructive border-red-500/30 aurora-light:border-destructive/30',
        canceled: 'border-transparent bg-slate-600/20 aurora-light:bg-muted text-slate-500 aurora-light:text-muted-foreground border-slate-600/30 aurora-light:border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
