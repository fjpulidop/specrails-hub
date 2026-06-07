import { useEffect, useMemo, useState } from 'react'
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
import { usePrerequisites } from '../hooks/usePrerequisites'
import { PrerequisitesPanel } from './PrerequisitesPanel'
import { InstallInstructionsModal } from './InstallInstructionsModal'
import { cn } from '../lib/utils'

interface AddProjectDialogProps {
  open: boolean
  onClose: () => void
}

type Provider = 'claude' | 'codex'

// Canonical ordering — the first selected provider becomes the project primary.
const PROVIDER_ORDER: Provider[] = ['claude', 'codex']

export function AddProjectDialog({ open, onClose }: AddProjectDialogProps) {
  // Multi-select: a project can be created with one or both providers. When both
  // are available we pre-select both; the user can deselect down to one (but
  // never zero). The first in canonical order is the primary/default provider.
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(new Set(['claude']))
  const [projectPath, setProjectPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<{ claude: boolean; codex: boolean }>({ claude: true, codex: false })
  const [installModalOpen, setInstallModalOpen] = useState(false)

  const { addProject, startSetupWizard, setActiveProjectId } = useHub()
  const { status: prereqStatus, isLoading: prereqLoading, error: prereqError, recheck: prereqRecheck } = usePrerequisites()

  const missingToolsLabel = useMemo(() => {
    if (!prereqStatus || prereqStatus.ok) return null
    const labels = prereqStatus.missingRequired.map((item) => item.label)
    if (labels.length === 0) return null
    if (labels.length === 1) return `${labels[0]} is required to add a project`
    return `${labels.join(', ')} are required to add a project`
  }, [prereqStatus])

  // Soft block: only enforce gating when we have a definitive negative answer.
  // If the fetch errored we let the user proceed and rely on the server install guard.
  const prereqsBlock = prereqStatus !== null && !prereqStatus.ok && !prereqError

  useEffect(() => {
    if (!open) return
    fetch('/api/hub/available-providers')
      .then((r) => r.json())
      .then((data) => {
        // Honour the server's real availability. The emergency-rollback env
        // var `SPECRAILS_HUB_CODEX_BETA=0` on the server reports codex:false
        // even if the binary is installed.
        const claude = Boolean(data.claude)
        const codex = Boolean(data.codex)
        setAvailableProviders({ claude, codex })
        // Default selection: every available provider is pre-selected, so the
        // common "I have both" case sets up a multi-provider project in one
        // click. The user can deselect down to one before submitting.
        const next = new Set<Provider>()
        if (claude) next.add('claude')
        if (codex) next.add('codex')
        if (next.size === 0) next.add('claude') // keep submit gating to drive the empty state
        setSelectedProviders(next)
      })
      .catch(() => { /* ignore — defaults to claude */ })
  }, [open])

  function toggleProvider(p: Provider) {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(p)) {
        if (next.size === 1) return prev // never deselect the last one
        next.delete(p)
      } else {
        next.add(p)
      }
      return next
    })
  }

  // Ordered list (primary first) for submission + summary.
  const orderedSelected = PROVIDER_ORDER.filter((p) => selectedProviders.has(p) && availableProviders[p])

  async function handleAdd() {
    const trimmedPath = projectPath.trim()
    if (!trimmedPath) {
      toast.error('Project path is required')
      return
    }

    if (orderedSelected.length === 0) {
      toast.error('Select at least one AI provider')
      return
    }

    setIsAdding(true)
    try {
      const data = await addProject(trimmedPath, projectName.trim() || undefined, orderedSelected)
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

        <PrerequisitesPanel
          status={prereqStatus}
          isLoading={prereqLoading}
          error={prereqError}
          onMoreInfo={() => setInstallModalOpen(true)}
          onRefresh={prereqRecheck}
        />

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

          {/* Provider selector — multi-select. Pick one or both. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">AI providers</label>
            <div className="flex gap-2">
              {([
                { id: 'claude' as Provider, icon: '🤖', label: 'Claude' },
                { id: 'codex' as Provider, icon: '⚡', label: 'Codex' },
              ]).map(({ id, icon, label }) => {
                const avail = availableProviders[id]
                const checked = selectedProviders.has(id) && avail
                return (
                  <button
                    key={id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={!avail}
                    onClick={() => toggleProvider(id)}
                    data-testid={`provider-toggle-${id}`}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-left transition-colors text-xs',
                      'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      checked
                        ? 'border-accent-primary/60 bg-accent-primary/10 text-foreground'
                        : 'border-border/30 text-muted-foreground hover:border-border/60',
                      !avail && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none',
                        checked ? 'border-accent-primary bg-accent-primary text-background' : 'border-border/50'
                      )}
                      aria-hidden
                    >{checked ? '✓' : ''}</span>
                    <span>{icon}</span>
                    <span className="font-medium">{label}</span>
                    {!avail && (
                      <span className="text-[9px] text-muted-foreground/60">not found</span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] text-muted-foreground/70">
              {orderedSelected.length > 1
                ? 'Both engines will be set up. The first is the project default. Cannot be changed after creation.'
                : 'Cannot be changed after the project is created.'}
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
            disabled={isAdding || !projectPath.trim() || noProviderAvailable || orderedSelected.length === 0 || prereqsBlock || prereqLoading}
            title={prereqsBlock ? missingToolsLabel ?? undefined : undefined}
            data-testid="add-project-submit"
          >
            {isAdding ? 'Adding...' : 'Add Project'}
          </Button>
        </DialogFooter>

        <InstallInstructionsModal
          open={installModalOpen}
          onClose={() => setInstallModalOpen(false)}
          status={prereqStatus}
          onRecheck={prereqRecheck}
          isRechecking={prereqLoading}
        />
      </DialogContent>
    </Dialog>
  )
}
