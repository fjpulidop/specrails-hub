import { CheckCircle2, Circle, Layers } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select'
import { cn } from '../lib/utils'

export type SpecStatusFilterValue = 'all' | 'todo' | 'done'

interface SpecStatusFilterProps {
  value: SpecStatusFilterValue
  onChange: (next: SpecStatusFilterValue) => void
  /** Total count per bucket — surfaced inside the trigger when a filter is active. */
  counts?: { all: number; todo: number; done: number }
  className?: string
}

const LABELS: Record<SpecStatusFilterValue, string> = {
  all: 'All',
  todo: 'ToDo',
  done: 'Done',
}

export function SpecStatusFilter({ value, onChange, counts, className }: SpecStatusFilterProps) {
  const visibleCount = counts ? counts[value] : null

  return (
    <div className={cn('flex items-center shrink-0', className)}>
      <Select value={value} onValueChange={(v) => onChange(v as SpecStatusFilterValue)}>
        <SelectTrigger
          aria-label="Filter by status"
          data-testid="spec-status-filter"
          className="h-7 w-auto gap-1.5 px-2 text-xs bg-accent-info/10 border-accent-info/30 hover:bg-accent-info/20"
        >
          <Layers className="w-3 h-3 text-muted-foreground" />
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <span>{LABELS[value]}</span>
              {visibleCount !== null && (
                <span className="text-[10px] text-muted-foreground/80">·&nbsp;{visibleCount}</span>
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="inline-flex items-center gap-2">
              <Layers className="w-3 h-3 text-muted-foreground" />
              <span>All</span>
              {counts && <span className="text-[10px] text-muted-foreground/70">{counts.all}</span>}
            </span>
          </SelectItem>
          <SelectItem value="todo">
            <span className="inline-flex items-center gap-2">
              <Circle className="w-3 h-3 text-muted-foreground" />
              <span>ToDo</span>
              {counts && <span className="text-[10px] text-muted-foreground/70">{counts.todo}</span>}
            </span>
          </SelectItem>
          <SelectItem value="done">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-accent-success/80" />
              <span>Done</span>
              {counts && <span className="text-[10px] text-muted-foreground/70">{counts.done}</span>}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
