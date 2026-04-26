import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { useHub } from '../hooks/useHub'
import { cn } from '../lib/utils'

interface AddProjectDialogProps {
  open: boolean
  onClose: () => void
}

type Provider = 'claude' | 'codex'

export function AddProjectDialog({ open, onClose }: AddProjectDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<Provider>('claude')
  const [projectPath, setProjectPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<{ claude: boolean; codex: boolean }>({ claude: true, codex: false })

  const { addProject, startSetupWizard, setActiveProjectId } = useHub()

  useEffect(() => {
    if (!open) return
    fetch('/api/hub/available-providers')
      .then((r) => r.json())
      .then((data) => {
        // Codex support is coming soon (in lab) — force the UI to treat it as unavailable
        // so the provider selector renders it non-selectable with a "Coming Soon" label.
        setAvailableProviders({ claude: Boolean(data.claude), codex: false })
        setSelectedProvider('claude')
      })
      .catch(() => { /* ignore — defaults to claude */ })
  }, [open])

  async function handleAdd() {
    const trimmedPath = projectPath.trim()
    if (!trimmedPath) {
      toast.error('Project path is required')
      return
    }

    setIsAdding(true)
    try {
      if (selectedProvider !== 'claude') {
        toast.error('Codex support is coming soon')
        return
      }

      const data = await addProject(trimmedPath, projectName.trim() || undefined, selectedProvider)
      if (!data) return
      const { project } = data

      if (data.has_specrails === false) {
        resetAndClose()
        setActiveProjectId(project.id)
        startSetupWizard(project.id)
      } else {
        toast.success(`Project "${project.name}" registered`)
        resetAndClose()
      }
    } catch (err) {
      toast.error('Failed to add project', { description: (err as Error).message })
    } finally {
      setIsAdding(false)
    }
  }

  function resetAndClose() {
    setProjectPath('')
    setProjectName('')
    onClose()
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) resetAndClose()
  }

  const noProviderAvailable = !availableProviders.claude && !availableProviders.codex

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Add Project
          </DialogTitle>
          <DialogDescription>
            Register a project directory to manage it from the hub.
          </DialogDescription>
        </DialogHeader>

        {noProviderAvailable && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
            No AI CLI detected. Install Claude Code or Codex CLI first.
          </p>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Project path <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="/Users/me/my-project"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAdd() }}
                autoFocus
                className="flex-1"
              />
              {IS_TAURI && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Browse for folder"
                  onClick={async () => {
                    try {
                      const { open } = await import('@tauri-apps/plugin-dialog')
                      const selected = await open({ directory: true, multiple: false, title: 'Select project folder' })
                      if (typeof selected === 'string' && selected) {
                        setProjectPath(selected)
                        if (!projectName) {
                          setProjectName(selected.split('/').filter(Boolean).pop() ?? '')
                        }
                      }
                    } catch {
                      // Tauri dialog not available — user can still type path
                    }
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Absolute path to the project root
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Display name <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="My Project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAdd() }}
            />
            <p className="text-[10px] text-muted-foreground">
              Defaults to the directory name
            </p>
          </div>

          {/* Provider selector — less prominent, inline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">AI provider</label>
            <div className="flex gap-2">
              <button
                disabled={!availableProviders.claude}
                onClick={() => setSelectedProvider('claude')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-left transition-colors text-xs',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  selectedProvider === 'claude' && availableProviders.claude
                    ? 'border-dracula-purple/60 bg-dracula-purple/10 text-foreground'
                    : 'border-border/30 text-muted-foreground hover:border-border/60',
                  !availableProviders.claude && 'opacity-40 cursor-not-allowed'
                )}
              >
                <span>🤖</span>
                <span className="font-medium">Claude</span>
                {!availableProviders.claude && (
                  <span className="text-[9px] text-muted-foreground/60">not found</span>
                )}
              </button>

              <button
                disabled
                aria-disabled="true"
                title="Codex (OpenAI) — Coming Soon. Currently being tested in our lab."
                onClick={(e) => e.preventDefault()}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-left transition-colors text-xs',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'border-border/30 text-muted-foreground opacity-50 cursor-not-allowed'
                )}
              >
                <span>⚡</span>
                <span className="font-medium">Codex</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-dracula-orange/80">
                  Coming Soon
                </span>
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/70">
              Cannot be changed after the project is created.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isAdding || !projectPath.trim() || noProviderAvailable}
          >
            {isAdding ? 'Adding...' : 'Add Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
