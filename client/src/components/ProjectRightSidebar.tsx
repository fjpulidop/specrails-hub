import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BarChart3, Bot, Puzzle, Settings, PanelRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'
import { FEATURE_AGENTS_SECTION } from '../lib/feature-flags'

const navItems = [
  { to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', end: false, icon: Briefcase, label: 'Jobs' },
  { to: '/analytics', end: false, icon: BarChart3, label: 'Analytics' },
  ...(FEATURE_AGENTS_SECTION
    ? [{ to: '/agents', end: false, icon: Bot, label: 'Agents' }]
    : []),
  { to: '/integrations', end: false, icon: Puzzle, label: 'Integrations' },
  { to: '/settings', end: false, icon: Settings, label: 'Settings' },
]

const RIGHT_PIN_LABEL: Record<'pinned-open' | 'pinned-collapsed' | 'unpinned', string> = {
  'pinned-open': 'Collapse right sidebar (keep pinned)',
  'pinned-collapsed': 'Unpin right sidebar',
  'unpinned': 'Pin right sidebar open',
}

export function ProjectRightSidebar() {
  const { rightMode, cycleRightMode } = useSidebarPin()
  const [hovered, setHovered] = useState(false)
  const expanded = rightMode === 'pinned-open' || (rightMode === 'unpinned' && hovered)
  const lit = rightMode !== 'unpinned'
  const pinLabel = RIGHT_PIN_LABEL[rightMode]

  return (
    <div
      className={cn(
        'relative flex flex-col h-full border-l border-border bg-background flex-shrink-0',
        'transition-all duration-200 ease-in-out overflow-hidden',
        expanded ? 'w-44' : 'w-11'
      )}
      onMouseEnter={() => { if (rightMode === 'unpinned') setHovered(true) }}
      onMouseLeave={() => { if (rightMode === 'unpinned') setHovered(false) }}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center h-12 border-b border-border flex-shrink-0',
        expanded ? 'px-3 justify-between' : 'justify-center'
      )}>
        {expanded && (
          <span className="font-mono text-sm font-bold whitespace-nowrap overflow-hidden text-accent-secondary">
            Project
          </span>
        )}
        <button
          type="button"
          onClick={cycleRightMode}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            lit
              ? 'text-foreground bg-muted'
              : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
          )}
          aria-label={pinLabel}
          title={`${pinLabel} (⌘B)`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 px-1.5 space-y-0.5">
        {navItems.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'flex items-center gap-2 w-full h-8 rounded-md transition-colors',
              expanded ? 'px-2' : 'px-0 justify-center',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            title={!expanded ? label : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {expanded && <span className="text-xs truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
