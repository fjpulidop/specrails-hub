import { Play, Square } from 'lucide-react'
import { Button } from './ui/button'

export type RailMode = 'implement' | 'batch-implement'
export type RailStatus = 'idle' | 'running'

interface RailControlsProps {
  mode: RailMode
  status: RailStatus
  onModeChange: (mode: RailMode) => void
  onToggle: () => void
}

export function RailControls({ mode, status, onModeChange, onToggle }: RailControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
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

      {/* Play / Stop toggle */}
      <Button
        size="sm"
        variant="ghost"
        className={`h-5 w-5 p-0 rounded-full transition-all duration-200 ${
          status === 'running'
            ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
            : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10'
        }`}
        onClick={onToggle}
        title={status === 'running' ? 'Stop' : 'Play'}
      >
        {status === 'running' ? (
          <Square className="w-2.5 h-2.5 fill-current" />
        ) : (
          <Play className="w-2.5 h-2.5 fill-current" />
        )}
      </Button>
    </div>
  )
}
