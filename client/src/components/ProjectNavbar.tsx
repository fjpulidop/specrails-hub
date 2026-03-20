import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BarChart3, Settings, Activity, GitBranch, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import type { HubProject } from '../hooks/useHub'
import { NotificationCenter } from './NotificationCenter'
import FeatureFunnelDialog from './FeatureFunnelDialog'
import { SpecLauncherModal } from './SpecLauncherModal'
import { getApiBase } from '../lib/api'

interface ProjectNavbarProps {
  project: HubProject
}

export function ProjectNavbar({ project }: ProjectNavbarProps) {
  const [funnelOpen, setFunnelOpen] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [activeChangesCount, setActiveChangesCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${getApiBase()}/changes`)
        if (!res.ok || cancelled) return
        const data = await res.json() as { changes: { isArchived: boolean }[] }
        if (!cancelled) setActiveChangesCount(data.changes.filter((c) => !c.isArchived).length)
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [project.id])

  const navItems = [
    { to: '/', end: true, icon: LayoutDashboard, label: 'Home' },
    { to: '/analytics', end: false, icon: BarChart3, label: 'Analytics' },
    { to: '/activity', end: false, icon: Activity, label: 'Activity' },
  ]

  return (
    <>
      <FeatureFunnelDialog open={funnelOpen} onClose={() => setFunnelOpen(false)} />
      <SpecLauncherModal open={launcherOpen} onClose={() => setLauncherOpen(false)} activeProjectId={project.id} />

    <nav className="flex items-center justify-between h-9 px-3 border-b border-border bg-background/50">
      {/* Project name */}
      <span className="text-xs text-muted-foreground truncate max-w-[160px]">
        {project.path}
      </span>

      {/* Center nav */}
      <div className="flex items-center gap-0.5">
        {navItems.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors',
                isActive
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )
            }
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </NavLink>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to="/changes"
              className={({ isActive }) =>
                cn(
                  'h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors',
                  isActive
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )
              }
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Changes</span>
              {activeChangesCount > 0 && (
                <span className="text-[9px] px-1 py-0 rounded-full bg-dracula-purple/20 text-dracula-purple font-medium leading-4">
                  {activeChangesCount}
                </span>
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent>Active OpenSpec Changes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setFunnelOpen(true)}
              className="h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <GitBranch className="w-3.5 h-3.5 opacity-60" />
              <span>Funnel</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Feature Funnel — pipeline visual</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setLauncherOpen(true)}
              className="h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>New Change</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Launch a new OpenSpec change with opsx:ff</TooltipContent>
        </Tooltip>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <NotificationCenter activeProjectId={project.id} />

        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
                  isActive
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )
              }
            >
              <Settings className="w-3.5 h-3.5" />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent>Project Settings</TooltipContent>
        </Tooltip>
      </div>
    </nav>
    </>
  )
}
