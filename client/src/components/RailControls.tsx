import { Play, Square, AlertTriangle, ScrollText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'

export type RailMode = 'implement' | 'batch-implement'
export type RailStatus = 'idle' | 'running' | 'failed'

interface RailControlsProps {
  mode: RailMode
  status: RailStatus
  activeJobId?: string
  ticketCount: number
  onModeChange: (mode: RailMode) => void
  onToggle: () => void
}

export function RailControls({ mode, status, activeJobId, ticketCount, onModeChange, onToggle }: RailControlsProps) {
  const navigate = useNavigate()
  const canPlay = ticketCount > 0
  return (
    <div className="flex items-center gap-1.5">
      {/* View Log button — visible only while running */}
      {status === 'running' && activeJobId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 rounded-full transition-all duration-200 text-[hsl(191_97%_77%)] hover:text-[hsl(191_97%_87%)] hover:bg-[hsl(191_97%_77%/0.1)] hover:shadow-[0_0_8px_hsl(191_97%_77%/0.4)]"
          onClick={() => navigate(`/jobs/${activeJobId}`)}
          title="View job log"
        >
          <ScrollText className="w-2.5 h-2.5" />
        </Button>
      )}

      {/* Mode segmented control */}
      <div className="flex items-center rounded-md border border-border/40 bg-muted/20 overflow-hidden text-[10px]">
        <button
          type="button"
          className={`px-2 py-0.5 transition-colors ${
            mode === 'implement'
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
          onClick={() => onModeChange('implement')}
        >
          Implement
        </button>
        <div className="w-px h-3 bg-border/40 shrink-0" />
        <button
          type="button"
          className={`px-2 py-0.5 transition-colors ${
            mode === 'batch-implement'
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
          onClick={() => onModeChange('batch-implement')}
        >
          Batch
        </button>
      </div>

      {/* Play / Stop / Failed toggle */}
      <Button
        size="sm"
        variant="ghost"
        className={`h-5 w-5 p-0 rounded-full transition-all duration-200 ${
          status === 'running'
            ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
            : status === 'failed'
              ? 'text-amber-400 hover:text-emerald-300 hover:bg-emerald-400/10'
              : canPlay
                ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10'
                : 'text-muted-foreground/30 cursor-not-allowed'
        }`}
        onClick={onToggle}
        disabled={!canPlay && status !== 'running'}
        title={
          status === 'running' ? 'Stop' :
          status === 'failed' ? 'Job failed — click to retry' :
          canPlay ? 'Play' : 'Add specs to this rail first'
        }
      >
        {status === 'running' ? (
          <Square className="w-2.5 h-2.5 fill-current" />
        ) : status === 'failed' ? (
          <AlertTriangle className="w-2.5 h-2.5" />
        ) : (
          <Play className="w-2.5 h-2.5 fill-current" />
        )}
      </Button>
    </div>
  )
}
