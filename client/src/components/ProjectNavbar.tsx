import { PanelLeft, PanelRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'
import type { SidebarMode } from '../context/SidebarPinContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

const LEFT_LABEL: Record<SidebarMode, string> = {
  'pinned-open': 'Collapse left sidebar (keep pinned)',
  'pinned-collapsed': 'Unpin left sidebar',
  'unpinned': 'Pin left sidebar open',
}

const RIGHT_LABEL: Record<SidebarMode, string> = {
  'pinned-open': 'Collapse right sidebar (keep pinned)',
  'pinned-collapsed': 'Unpin right sidebar',
  'unpinned': 'Pin right sidebar open',
}

function SidebarButton({
  mode,
  onToggle,
  label,
  shortcut,
  icon: Icon,
}: {
  mode: SidebarMode
  onToggle: () => void
  label: string
  shortcut: string
  icon: React.ElementType
}) {
  const lit = mode !== 'unpinned'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            lit
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
          {shortcut}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}

export function ProjectNavbar() {
  const { leftMode, rightMode, cycleLeftMode, cycleRightMode } = useSidebarPin()

  return (
    <TooltipProvider delayDuration={500}>
      <nav className="flex items-center justify-between h-8 px-2 border-b border-border bg-background/50 flex-shrink-0">
        <SidebarButton
          mode={leftMode}
          onToggle={cycleLeftMode}
          label={LEFT_LABEL[leftMode]}
          shortcut="⌥⌘B"
          icon={PanelLeft}
        />
        <SidebarButton
          mode={rightMode}
          onToggle={cycleRightMode}
          label={RIGHT_LABEL[rightMode]}
          shortcut="⌘B"
          icon={PanelRight}
        />
      </nav>
    </TooltipProvider>
  )
}
