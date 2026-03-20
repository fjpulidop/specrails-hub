import { Plus, X, FolderOpen } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { cn } from '../lib/utils'
import { useHub } from '../hooks/useHub'
import type { HubProject } from '../hooks/useHub'

interface TabBarProps {
  onAddProject: () => void
}

function ProjectTab({
  project,
  isActive,
  onSelect,
  onRemove,
}: {
  project: HubProject
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirming) {
      // Second click within 3s — actually remove
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirming(false)
      onRemove()
    } else {
      // First click — enter confirm state, auto-reset after 3s
      setConfirming(true)
      confirmTimerRef.current = setTimeout(() => {
        setConfirming(false)
        confirmTimerRef.current = null
      }, 3000)
    }
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-t-md border-b-0 transition-colors whitespace-nowrap',
        isActive
          ? 'bg-background text-foreground border border-border border-b-background z-10'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
      )}
    >
      <FolderOpen className="w-3 h-3 flex-shrink-0" />
      <span className="max-w-[120px] truncate">{project.name}</span>
      <button
        type="button"
        onClick={handleRemoveClick}
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-sm transition-all',
          confirming
            ? 'px-1 h-4 text-[10px] text-destructive bg-destructive/10 hover:bg-destructive/20 opacity-100'
            : 'w-3.5 h-3.5',
          !confirming && (isActive
            ? 'opacity-50 hover:opacity-100 hover:bg-muted'
            : 'opacity-50 md:opacity-0 md:group-hover:opacity-50 hover:!opacity-100 hover:bg-muted')
        )}
        aria-label={confirming ? `Confirm remove ${project.name}` : `Remove ${project.name}`}
      >
        {confirming ? 'confirm?' : <X className="w-2.5 h-2.5" />}
      </button>
    </button>
  )
}

export function TabBar({ onAddProject }: TabBarProps) {
  const { projects, activeProjectId, setActiveProjectId, removeProject } = useHub()

  async function handleRemove(project: HubProject) {
    try {
      await removeProject(project.id)
    } catch {
      // Error handling via toast in parent
    }
  }

  return (
    <div className="flex items-end gap-0.5 px-2 pt-1 border-b border-border bg-card/30">
      {projects.map((project) => (
        <ProjectTab
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
          onSelect={() => setActiveProjectId(project.id)}
          onRemove={() => handleRemove(project)}
        />
      ))}

      <button
        type="button"
        onClick={onAddProject}
        className="h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-md transition-colors"
        aria-label="Add project"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add project</span>
      </button>
    </div>
  )
}
