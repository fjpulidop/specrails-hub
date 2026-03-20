import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BarChart3, Settings, Activity, GitBranch } from 'lucide-react'
import { cn } from '../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import type { HubProject } from '../hooks/useHub'
import { NotificationCenter } from './NotificationCenter'
import FeatureFunnelDialog from './FeatureFunnelDialog'

interface ProjectNavbarProps {
  project: HubProject
}

export function ProjectNavbar({ project }: ProjectNavbarProps) {
  const [funnelOpen, setFunnelOpen] = useState(false)

  const navItems = [
    { to: '/', end: true, icon: LayoutDashboard, label: 'Home' },
    { to: '/analytics', end: false, icon: BarChart3, label: 'Analytics' },
    { to: '/activity', end: false, icon: Activity, label: 'Activity' },
  ]

  return (
    <>
      <FeatureFunnelDialog open={funnelOpen} onClose={() => setFunnelOpen(false)} />

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
            <button
              onClick={() => setFunnelOpen(true)}
              className="h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Funnel</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Feature Funnel — pipeline visual</TooltipContent>
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
