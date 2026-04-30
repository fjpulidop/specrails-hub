import { useState } from 'react'
import { Check, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

export interface CheckpointState {
  key: string
  name: string
  status: 'pending' | 'running' | 'done'
  detail?: string
  duration_ms?: number
}

interface CheckpointTrackerProps {
  checkpoints: CheckpointState[]
  logLines: string[]
}

function CheckpointNode({ checkpoint, index }: { checkpoint: CheckpointState; index: number }) {
  const isDone = checkpoint.status === 'done'
  const isRunning = checkpoint.status === 'running'
  const isPending = checkpoint.status === 'pending'

  return (
    <div className="flex items-start gap-3">
      {/* Node indicator */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
            isDone && 'bg-accent-success/20 border-accent-success text-accent-success',
            isRunning && 'bg-accent-primary/20 border-accent-primary text-accent-primary animate-pulse',
            isPending && 'bg-muted/30 border-border text-muted-foreground'
          )}
        >
          {isDone ? (
            <Check className="w-3 h-3" />
          ) : isRunning ? (
            <Clock className="w-3 h-3" />
          ) : (
            <span>{index + 1}</span>
          )}
        </div>
        {/* Connector line (not shown for last item) */}
      </div>

      {/* Checkpoint info */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-medium',
              isDone && 'text-foreground',
              isRunning && 'text-accent-primary',
              isPending && 'text-muted-foreground'
            )}
          >
            {checkpoint.name}
          </span>
          {/* duration intentionally hidden — it clutters the UI */}
        </div>
        {(isRunning || isDone) && checkpoint.detail && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {checkpoint.detail}
          </p>
        )}
      </div>
    </div>
  )
}

export function CheckpointTracker({ checkpoints, logLines }: CheckpointTrackerProps) {
  const [logsExpanded, setLogsExpanded] = useState(false)

  const doneCount = checkpoints.filter((c) => c.status === 'done').length
  const totalCount = checkpoints.length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex-shrink-0">
        <h3 className="text-xs font-semibold text-foreground mb-2">Setup progress</h3>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-success rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-muted-foreground">
            {doneCount} of {totalCount} complete
          </span>
          <span className="text-[10px] text-muted-foreground">{progressPct}%</span>
        </div>
      </div>

      {/* Checkpoint list */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-0">
        {checkpoints.map((checkpoint, i) => (
          <div key={checkpoint.key} className="relative">
            <CheckpointNode checkpoint={checkpoint} index={i} />
            {/* Connector line between nodes */}
            {i < checkpoints.length - 1 && (
              <div
                className={cn(
                  'absolute left-[11px] top-6 w-0.5 h-4',
                  checkpoint.status === 'done' ? 'bg-accent-success/40' : 'bg-border/40'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Raw log (collapsible) */}
      <div className="flex-shrink-0 border-t border-border/30">
        <button
          className="w-full flex items-center gap-1.5 px-4 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLogsExpanded((prev) => !prev)}
        >
          {logsExpanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
          )}
          Raw log ({logLines.length} lines)
        </button>
        {logsExpanded && (
          <div className="max-h-40 overflow-auto px-4 pb-3 font-mono text-[9px] text-muted-foreground space-y-0.5">
            {logLines.slice(-200).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all leading-tight">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
