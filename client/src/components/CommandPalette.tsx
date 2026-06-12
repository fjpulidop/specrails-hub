import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  PieChart,
  PanelLeft,
  PanelRight,
} from 'lucide-react'
import { useHub } from '../hooks/useHub'
import { getApiBase } from '../lib/api'
import type { CommandInfo, JobSummary } from '../types'
import { cn } from '../lib/utils'
import { useSidebarPin } from '../context/SidebarPinContext'

interface CommandPaletteProps {
  onOpenSettings?: () => void
  onOpenAnalytics?: () => void
  onOpenDocs?: () => void
}

export function CommandPalette({ onOpenSettings, onOpenAnalytics, onOpenDocs }: CommandPaletteProps) {
  const { t } = useTranslation('commands')
  const [open, setOpen] = useState(false)
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([])
  const { projects, activeProjectId, setActiveProjectId } = useHub()
  const { leftMode, rightMode, cycleLeftMode, cycleRightMode } = useSidebarPin()
  const leftLabel = leftMode === 'pinned-open'
    ? t('palette.sidebar.collapseLeftKeepPinned')
    : leftMode === 'pinned-collapsed'
      ? t('palette.sidebar.unpinLeft')
      : t('palette.sidebar.pinLeftOpen')
  const rightLabel = rightMode === 'pinned-open'
    ? t('palette.sidebar.collapseRightKeepPinned')
    : rightMode === 'pinned-collapsed'
      ? t('palette.sidebar.unpinRight')
      : t('palette.sidebar.pinRightOpen')
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
        body: JSON.stringify({ command: `/specrails:${slug}` }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? t('errors.spawnFailed'))
      toast.success(t('toasts.queued', { name: slug }))
      navigate(`/jobs/${data.jobId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.spawnFailed'))
    }
  }, [navigate, t])

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
      label={t('palette.label')}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
        'border border-border/30 bg-popover shadow-2xl backdrop-blur-md rounded-xl overflow-hidden',
      )}
    >
      {/* Visually hidden title for accessibility */}
      <span className="sr-only">{t('palette.label')}</span>

      {/* Search input */}
      <div className="flex items-center gap-2 px-3 border-b border-border/30">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Command.Input
          placeholder={t('palette.searchPlaceholder')}
          className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
          esc
        </kbd>
      </div>

      {/* Results list */}
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          {t('palette.noResults')}
        </Command.Empty>

        {/* Projects */}
        {projects.length > 0 && (
          <Command.Group heading={t('palette.groups.projects')}>
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={project.name}
                keywords={[project.slug]}
                onSelect={() => handleSelectProject(project.id)}
                className={cn(navItemClass, project.id === activeProjectId && 'text-accent-primary')}
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{project.name}</span>
                {project.id === activeProjectId && (
                  <span className="text-[10px] text-accent-primary font-medium">{t('palette.activeBadge')}</span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Spec */}
        {commands.length > 0 && (
          <Command.Group heading={t('palette.groups.spec')}>
            {commands.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={cmd.name}
                keywords={[cmd.slug, cmd.description ?? '']}
                onSelect={() => handleSelectCommand(cmd.slug)}
                className={navItemClass}
              >
                <Zap className="w-4 h-4 text-accent-info shrink-0" />
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
          <Command.Group heading={t('palette.groups.jobs')}>
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
                  job.status === 'completed' && 'text-accent-success',
                  job.status === 'failed' && 'text-destructive',
                  job.status === 'running' && 'text-accent-info',
                  job.status === 'queued' && 'text-muted-foreground',
                )}>
                  {t(`common:status.${job.status}`, { defaultValue: job.status })}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Navigation */}
        <Command.Group heading={t('palette.groups.navigation')}>
          <Command.Item value={t('palette.nav.dashboard')} keywords={['home']} onSelect={() => handleNavigate('/')} className={navItemClass}>
            <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t('palette.nav.dashboard')}</span>
          </Command.Item>
          {onOpenAnalytics && (
            <Command.Item value={t('palette.nav.hubAnalytics')} keywords={['cross-project', 'hub']} onSelect={() => handleHubAction(onOpenAnalytics)} className={navItemClass}>
              <PieChart className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t('palette.nav.hubAnalytics')}</span>
            </Command.Item>
          )}
          <Command.Item value={t('palette.nav.projectAnalytics')} keywords={['metrics']} onSelect={() => handleNavigate('/analytics')} className={navItemClass}>
            <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t('palette.nav.projectAnalytics')}</span>
          </Command.Item>
          <Command.Item value={t('palette.nav.activityFeed')} keywords={['log']} onSelect={() => handleNavigate('/activity')} className={navItemClass}>
            <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t('palette.nav.activityFeed')}</span>
          </Command.Item>
          <Command.Item value={t('palette.nav.hubSettings')} keywords={['configuration']} onSelect={() => onOpenSettings ? handleHubAction(onOpenSettings) : handleNavigate('/settings')} className={navItemClass}>
            <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t('palette.nav.hubSettings')}</span>
          </Command.Item>
          <Command.Item value={t('palette.nav.docs')} keywords={['documentation']} onSelect={() => onOpenDocs ? handleHubAction(onOpenDocs) : handleNavigate('/docs')} className={navItemClass}>
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t('palette.nav.docs')}</span>
          </Command.Item>
          <Command.Item
            value={leftLabel}
            keywords={['sidebar', 'panel', 'left', 'pin', 'collapse', 'unpin', 'cycle']}
            onSelect={() => { cycleLeftMode(); setOpen(false) }}
            className={navItemClass}
          >
            <PanelLeft className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{leftLabel}</span>
          </Command.Item>
          <Command.Item
            value={rightLabel}
            keywords={['sidebar', 'panel', 'right', 'nav', 'pin', 'collapse', 'unpin', 'cycle']}
            onSelect={() => { cycleRightMode(); setOpen(false) }}
            className={navItemClass}
          >
            <PanelRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{rightLabel}</span>
          </Command.Item>
        </Command.Group>
      </Command.List>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50">
        <div className="flex items-center gap-3">
          <span><kbd className="font-mono">↑↓</kbd> {t('palette.footer.navigate')}</span>
          <span><kbd className="font-mono">↵</kbd> {t('palette.footer.select')}</span>
          <span><kbd className="font-mono">esc</kbd> {t('palette.footer.close')}</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
