import { useMemo } from 'react'
import { diffWords } from 'diff'
import { cn } from '../lib/utils'

interface Props {
  original: string
  proposed: string
  className?: string
}

export function AiEditDiffView({ original, proposed, className }: Props) {
  const parts = useMemo(() => diffWords(original, proposed), [original, proposed])

  return (
    <div
      className={cn(
        'prose prose-invert prose-xs max-w-none text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words',
        'rounded-lg bg-muted/10 border border-border/40 px-4 py-3 overflow-y-auto',
        className,
      )}
    >
      {parts.map((p, i) => {
        if (p.added) {
          return (
            <span
              key={i}
              className="bg-green-500/20 text-green-200 rounded px-0.5"
              aria-label="inserted"
            >
              {p.value}
            </span>
          )
        }
        if (p.removed) {
          // Skip whitespace-only deletions (noisy)
          if (!p.value.trim()) return null
          return (
            <span
              key={i}
              className="bg-red-500/15 text-red-300/90 line-through decoration-red-400/60 rounded px-0.5 opacity-80"
              aria-label="removed"
            >
              {p.value}
            </span>
          )
        }
        return <span key={i}>{p.value}</span>
      })}
    </div>
  )
}
