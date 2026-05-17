import { ArrowUp, ArrowDown, ArrowDownUp } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip'
import { cn } from '../lib/utils'
import type { SpecSortMode, SpecSortDir } from '../types/spec-sort'

interface SpecSortControlProps {
  mode: SpecSortMode
  dir: SpecSortDir
  onChange: (mode: SpecSortMode, dir: SpecSortDir) => void
  className?: string
}

const MODE_LABELS: Record<SpecSortMode, string> = {
  'default': 'Default',
  'ticket-id': 'Ticket #',
  'priority': 'Priority',
}

export function SpecSortControl({ mode, dir, onChange, className }: SpecSortControlProps) {
  const showArrow = mode !== 'default'

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-1 shrink-0', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Select
                value={mode}
                onValueChange={(v) => onChange(v as SpecSortMode, dir)}
              >
                <SelectTrigger
                  aria-label="Sort mode"
                  className="h-7 w-auto gap-1.5 px-2 text-xs bg-accent-secondary/10 border-accent-secondary/30 hover:bg-accent-secondary/20"
                >
                  <ArrowDownUp className="w-3 h-3 text-muted-foreground" />
                  <SelectValue>{MODE_LABELS[mode]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="ticket-id">Ticket #</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TooltipTrigger>
          <TooltipContent>Sort: {MODE_LABELS[mode]}</TooltipContent>
        </Tooltip>

        {showArrow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle sort direction"
                onClick={() => onChange(mode, dir === 'asc' ? 'desc' : 'asc')}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-accent-secondary/30 bg-accent-secondary/10 hover:bg-accent-secondary/20 text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{dir === 'asc' ? 'Ascending' : 'Descending'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
