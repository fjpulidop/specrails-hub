import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BarChart3, Bot, Puzzle, Settings, PanelRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'
import { useHub } from '../hooks/useHub'
import { FEATURE_AGENTS_SECTION } from '../lib/feature-flags'

const RIGHT_PIN_LABEL: Record<'pinned-open' | 'pinned-collapsed' | 'unpinned', string> = {
  'pinned-open': 'Collapse right sidebar (keep pinned)',
  'pinned-collapsed': 'Unpin right sidebar',
  'unpinned': 'Pin right sidebar open',
}

export function ProjectRightSidebar() {
  const { rightMode, cycleRightMode } = useSidebarPin()
  const { projects, activeProjectId } = useHub()
  const [hovered, setHovered] = useState(false)
  const expanded = rightMode === 'pinned-open' || (rightMode === 'unpinned' && hovered)
  const lit = rightMode !== 'unpinned'
  const pinLabel = RIGHT_PIN_LABEL[rightMode]

  // Agents section is claude-only: the agent-profile catalogue, model
  // overrides per agent, and the `sr-architect/developer/reviewer` sub-
  // agent model maps to Claude Code's `.claude/agents/<id>.md` mechanic.
  // Codex's `spawn_agent` tool uses a fixed enum of agent_types and runs
  // skills as a single-agent loop, so the per-agent UI doesn't apply.
  //
  // Integrations (plugins / MCP servers) is also claude-only today: the
  // plugin manager registers MCP servers via `.mcp.json` (claude's
  // convention). Codex uses `codex mcp add` against an isolated
  // CODEX_HOME — the hub wires that flow but the UI hasn't been adapted
  // yet, so we hide the tab on codex projects to avoid presenting a
  // claude-only surface.
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const isCodex = activeProject?.provider === 'codex'
  const showAgentsTab = FEATURE_AGENTS_SECTION && !isCodex
  const showIntegrationsTab = !isCodex

  const navItems = [
    { to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/jobs', end: false, icon: Briefcase, label: 'Jobs' },
    { to: '/analytics', end: false, icon: BarChart3, label: 'Analytics' },
    ...(showAgentsTab
      ? [{ to: '/agents', end: false, icon: Bot, label: 'Agents' }]
      : []),
    ...(showIntegrationsTab
      ? [{ to: '/integrations', end: false, icon: Puzzle, label: 'Integrations' }]
      : []),
    { to: '/settings', end: false, icon: Settings, label: 'Settings' },
  ]

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
