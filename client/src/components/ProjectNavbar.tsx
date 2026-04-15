import { PanelLeft, PanelRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

function SidebarButton({
  pinned,
  onToggle,
  label,
  icon: Icon,
}: {
  pinned: boolean
  onToggle: () => void
  label: string
  icon: React.ElementType
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            pinned
              ? 'text-foreground bg-muted'
              : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
          )}
          aria-label={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground leading-none">
          ⌘K
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}

export function ProjectNavbar() {
  const { leftPinned, setLeftPinned, rightPinned, setRightPinned } = useSidebarPin()

  return (
    <TooltipProvider delayDuration={500}>
      <nav className="flex items-center justify-between h-8 px-2 border-b border-border bg-background/50 flex-shrink-0">
        <SidebarButton
          pinned={leftPinned}
          onToggle={() => setLeftPinned((p) => !p)}
          label={leftPinned ? 'Unpin left sidebar' : 'Pin left sidebar'}
          icon={PanelLeft}
        />
        <SidebarButton
          pinned={rightPinned}
          onToggle={() => setRightPinned((p) => !p)}
          label={rightPinned ? 'Unpin right sidebar' : 'Pin right sidebar'}
          icon={PanelRight}
        />
      </nav>
    </TooltipProvider>
  )
}
