import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { toast } from 'sonner'
import {
  Search,
  FolderOpen,
  Zap,
  Briefcase,
  LayoutDashboard,
  BarChart3,
  Activity,
  Settings,
  FileText,
  Globe,
  PieChart,
} from 'lucide-react'
import { useHub } from '../hooks/useHub'
import { getApiBase } from '../lib/api'
import type { CommandInfo, JobSummary } from '../types'
import { cn } from '../lib/utils'

interface CommandPaletteProps {
  onOpenSettings?: () => void
  onOpenOverview?: () => void
  onOpenAnalytics?: () => void
  onOpenDocs?: () => void
}

export function CommandPalette({ onOpenSettings, onOpenOverview, onOpenAnalytics, onOpenDocs }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([])
  const { projects, activeProjectId, setActiveProjectId } = useHub()
  const navigate = useNavigate()
  const fetchedRef = useRef(false)

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch commands and recent jobs when palette opens
  useEffect(() => {
    if (!open) {
      fetchedRef.current = false
      return
    }
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function fetchData() {
      try {
        const [configRes, jobsRes] = await Promise.all([
          fetch(`${getApiBase()}/config`),
          fetch(`${getApiBase()}/jobs?limit=10`),
        ])
        if (configRes.ok) {
          const configData = await configRes.json() as { commands: CommandInfo[] }
          setCommands(configData.commands)
        }
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json() as { jobs: JobSummary[] }
          setRecentJobs(jobsData.jobs)
        }
      } catch {
        // Silently fail — palette still works with projects and navigation
      }
    }
    fetchData()
  }, [open])

  const handleSelectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId)
    setOpen(false)
  }, [setActiveProjectId])

  const handleSelectCommand = useCallback(async (slug: string) => {
    setOpen(false)
    try {
      const res = await fetch(`${getApiBase()}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `/sr:${slug}` }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to spawn command')
      toast.success(`${slug} queued`)
      navigate(`/jobs/${data.jobId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to spawn command')
    }
  }, [navigate])

  const handleSelectJob = useCallback((jobId: string) => {
    setOpen(false)
    navigate(`/jobs/${jobId}`)
  }, [navigate])

  const handleNavigate = useCallback((path: string) => {
    setOpen(false)
    navigate(path)
  }, [navigate])

  const handleHubAction = useCallback((action: (() => void) | undefined) => {
    if (!action) return
    setOpen(false)
    action()
  }, [])

  const navItemClass = 'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className={cn(
        'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
        'border border-border/30 bg-popover shadow-2xl backdrop-blur-md rounded-xl overflow-hidden',
      )}
    >
      {/* Visually hidden title for accessibility */}
      <span className="sr-only">Command palette</span>

      {/* Search input */}
      <div className="flex items-center gap-2 px-3 border-b border-border/30">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Command.Input
          placeholder="Search projects, commands, jobs..."
          className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
          esc
        </kbd>
      </div>

      {/* Results list */}
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          No results found.
        </Command.Empty>

        {/* Projects */}
        {projects.length > 0 && (
          <Command.Group heading="Projects">
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={project.name}
                keywords={[project.slug]}
                onSelect={() => handleSelectProject(project.id)}
                className={cn(navItemClass, project.id === activeProjectId && 'text-dracula-purple')}
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{project.name}</span>
                {project.id === activeProjectId && (
                  <span className="text-[10px] text-dracula-purple font-medium">active</span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Spec */}
        {commands.length > 0 && (
          <Command.Group heading="Spec">
            {commands.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={cmd.name}
                keywords={[cmd.slug, cmd.description ?? '']}
                onSelect={() => handleSelectCommand(cmd.slug)}
                className={navItemClass}
              >
                <Zap className="w-4 h-4 text-dracula-cyan shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="truncate">{cmd.name}</span>
                  {cmd.description && (
                    <span className="text-[11px] text-muted-foreground/60 ml-2 truncate">{cmd.description}</span>
                  )}
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Jobs */}
        {recentJobs.length > 0 && (
          <Command.Group heading="Jobs">
            {recentJobs.map((job) => (
              <Command.Item
                key={job.id}
                value={`${job.command} ${job.id}`}
                keywords={[job.status]}
                onSelect={() => handleSelectJob(job.id)}
                className={navItemClass}
              >
                <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{job.command}</span>
                <span className={cn(
                  'text-[10px] font-medium',
                  job.status === 'completed' && 'text-dracula-green',
                  job.status === 'failed' && 'text-dracula-red',
                  job.status === 'running' && 'text-dracula-cyan',
                  job.status === 'queued' && 'text-muted-foreground',
                )}>
                  {job.status}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Navigation */}
        <Command.Group heading="Navigation">
          <Command.Item value="Dashboard" keywords={['home']} onSelect={() => handleNavigate('/')} className={navItemClass}>
            <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Dashboard</span>
          </Command.Item>
          {onOpenOverview && (
            <Command.Item value="Hub Overview" keywords={['projects']} onSelect={() => handleHubAction(onOpenOverview)} className={navItemClass}>
              <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>Hub Overview</span>
            </Command.Item>
          )}
          {onOpenAnalytics && (
            <Command.Item value="Hub Analytics" keywords={['cross-project']} onSelect={() => handleHubAction(onOpenAnalytics)} className={navItemClass}>
              <PieChart className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>Hub Analytics</span>
            </Command.Item>
          )}
          <Command.Item value="Analytics" keywords={['metrics']} onSelect={() => handleNavigate('/analytics')} className={navItemClass}>
            <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Analytics</span>
          </Command.Item>
          <Command.Item value="Activity Feed" keywords={['log']} onSelect={() => handleNavigate('/activity')} className={navItemClass}>
            <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Activity Feed</span>
          </Command.Item>
          <Command.Item value="Settings" keywords={['configuration']} onSelect={() => onOpenSettings ? handleHubAction(onOpenSettings) : handleNavigate('/settings')} className={navItemClass}>
            <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Settings</span>
          </Command.Item>
          <Command.Item value="Docs" keywords={['documentation']} onSelect={() => onOpenDocs ? handleHubAction(onOpenDocs) : handleNavigate('/docs')} className={navItemClass}>
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Docs</span>
          </Command.Item>
        </Command.Group>
      </Command.List>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50">
        <div className="flex items-center gap-3">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
