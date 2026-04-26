import { useState, useEffect, useRef } from 'react'
import { PanelLeft, FolderOpen, Plus, BarChart2, BookOpen, Settings, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useHub } from '../hooks/useHub'
import type { HubProject } from '../hooks/useHub'
import { useSidebarPin } from '../context/SidebarPinContext'

interface ArcSidebarProps {
  onAddProject: () => void
  onOpenAnalytics: () => void
  onOpenDocs: () => void
  onOpenSettings: () => void
}

function ProjectItem({
  project,
  isActive,
  expanded,
  onSelect,
  onRemove,
}: {
  project: HubProject
  isActive: boolean
  expanded: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirming) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirming(false)
      onRemove()
    } else {
      setConfirming(true)
      confirmTimerRef.current = setTimeout(() => {
        setConfirming(false)
        confirmTimerRef.current = null
      }, 3000)
    }
  }

  function handleSelectKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSelect()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleSelectKeyDown}
      className={cn(
        'group relative flex items-center gap-2 w-full h-8 rounded-md transition-colors',
        expanded ? 'px-2' : 'px-0 justify-center',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      title={!expanded ? project.name : undefined}
      aria-current={isActive ? 'page' : undefined}
    >
      <FolderOpen
        className={cn(
          'flex-shrink-0 w-4 h-4',
          isActive && 'text-dracula-purple'
        )}
      />
      {expanded && (
        <>
          <span className="text-xs truncate flex-1 text-left">{project.name}</span>
          <button
            type="button"
            onClick={handleRemoveClick}
            className={cn(
              'flex-shrink-0 flex items-center justify-center rounded-sm transition-all',
              'opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-muted',
              confirming
                ? 'opacity-100 px-1 h-4 text-[10px] text-destructive bg-destructive/10 hover:bg-destructive/20'
                : 'w-3.5 h-3.5'
            )}
            aria-label={confirming ? `Confirm remove ${project.name}` : `Remove ${project.name}`}
          >
            {confirming ? 'confirm?' : <X className="w-2.5 h-2.5" />}
          </button>
        </>
      )}
    </div>
  )
}

export function ArcSidebar({
  onAddProject,
  onOpenAnalytics,
  onOpenDocs,
  onOpenSettings,
}: ArcSidebarProps) {
  const { projects, activeProjectId, setActiveProjectId, removeProject } = useHub()
  const { leftPinned: pinned, setLeftPinned: setPinned } = useSidebarPin()
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered

  const navItems = [
    { label: 'Docs', icon: BookOpen, action: onOpenDocs },
    { label: 'Analytics', icon: BarChart2, action: onOpenAnalytics },
    { label: 'Settings', icon: Settings, action: onOpenSettings },
  ]

  async function handleRemove(project: HubProject) {
    try {
      await removeProject(project.id)
    } catch {
      // errors handled via toast in parent
    }
  }

  return (
    <div
      className={cn(
        'relative flex flex-col h-full border-r border-border bg-background flex-shrink-0',
        'transition-all duration-200 ease-in-out overflow-hidden',
        expanded ? 'w-52' : 'w-11'
      )}
      onMouseEnter={() => { if (!pinned) setHovered(true) }}
      onMouseLeave={() => { if (!pinned) setHovered(false) }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center h-12 border-b border-border flex-shrink-0',
          expanded ? 'px-3 justify-between' : 'justify-center'
        )}
      >
        {expanded && (
          <span className="font-mono text-sm font-bold whitespace-nowrap overflow-hidden text-dracula-purple">
            Hub
          </span>
        )}
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors flex-shrink-0',
            pinned
              ? 'text-foreground bg-muted'
              : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
          )}
          aria-label={pinned ? 'Unpin left sidebar' : 'Pin left sidebar'}
          title={pinned ? 'Unpin left sidebar (⌥⌘B)' : 'Pin left sidebar (⌥⌘B)'}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            expanded={expanded}
            onSelect={() => setActiveProjectId(project.id)}
            onRemove={() => handleRemove(project)}
          />
        ))}

        {/* Add project */}
        <button
          type="button"
          onClick={onAddProject}
          className={cn(
            'flex items-center gap-2 w-full h-8 rounded-md transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            expanded ? 'px-2' : 'px-0 justify-center'
          )}
          aria-label="Add project"
          title={!expanded ? 'Add project' : undefined}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {expanded && <span className="text-xs whitespace-nowrap">Add project</span>}
        </button>
      </div>

      {/* Hub nav items */}
      <div className="border-t border-border py-2 px-1.5 space-y-0.5">
        {navItems.map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className={cn(
              'flex items-center gap-2 w-full h-8 rounded-md transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              expanded ? 'px-2' : 'px-0 justify-center'
            )}
            aria-label={label}
            title={!expanded ? label : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {expanded && <span className="text-xs whitespace-nowrap">{label}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
