import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BarChart3, Bot, Settings, PanelRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'

const navItems = [
  { to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', end: false, icon: Briefcase, label: 'Jobs' },
  { to: '/analytics', end: false, icon: BarChart3, label: 'Analytics' },
  { to: '/agents', end: false, icon: Bot, label: 'Agents' },
  { to: '/settings', end: false, icon: Settings, label: 'Settings' },
]

export function ProjectRightSidebar() {
  const { rightPinned: pinned, setRightPinned: setPinned } = useSidebarPin()
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered

  return (
    <div
      className={cn(
        'relative flex flex-col h-full border-l border-border bg-background flex-shrink-0',
        'transition-all duration-200 ease-in-out overflow-hidden',
        expanded ? 'w-44' : 'w-11'
      )}
      onMouseEnter={() => { if (!pinned) setHovered(true) }}
      onMouseLeave={() => { if (!pinned) setHovered(false) }}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center h-12 border-b border-border flex-shrink-0',
        expanded ? 'px-3 justify-between' : 'justify-center'
      )}>
        {expanded && (
          <span className="font-mono text-sm font-bold whitespace-nowrap overflow-hidden text-dracula-pink">
            Project
          </span>
        )}
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            pinned
              ? 'text-foreground bg-muted'
              : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
          )}
          aria-label={pinned ? 'Unpin right sidebar' : 'Pin right sidebar'}
          title={pinned ? 'Unpin right sidebar (⌘B)' : 'Pin right sidebar (⌘B)'}
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
