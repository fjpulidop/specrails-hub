import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
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
type DialogStep = 'provider' | 'input'

export function AddProjectDialog({ open, onClose }: AddProjectDialogProps) {
  const [step, setStep] = useState<DialogStep>('provider')
  const [selectedProvider, setSelectedProvider] = useState<Provider>('claude')
  const [projectPath, setProjectPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<{ claude: boolean; codex: boolean }>({ claude: true, codex: false })

  const { startSetupWizard, setActiveProjectId } = useHub()

  useEffect(() => {
    if (!open) return
    fetch('/api/hub/available-providers')
      .then((r) => r.json())
      .then((data) => {
        setAvailableProviders(data)
        // Auto-select the first available provider
        if (!data.claude && data.codex) setSelectedProvider('codex')
        else setSelectedProvider('claude')
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
      const res = await fetch('/api/hub/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: trimmedPath,
          name: projectName.trim() || undefined,
          provider: selectedProvider,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error('Failed to add project', { description: data.error })
        return
      }

      const project = data.project

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
    setStep('provider')
    setProjectPath('')
    setProjectName('')
    onClose()
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) resetAndClose()
  }

  if (step === 'provider') {
    const noProviderAvailable = !availableProviders.claude && !availableProviders.codex
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose AI Provider</DialogTitle>
            <DialogDescription>
              Select which AI provider to use for this project. This cannot be changed later.
            </DialogDescription>
          </DialogHeader>

          {noProviderAvailable && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
              No AI CLI detected. Install Claude Code or Codex CLI first.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 py-2">
            {/* Claude Card */}
            <button
              disabled={!availableProviders.claude}
              onClick={() => setSelectedProvider('claude')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-4 text-left transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                selectedProvider === 'claude' && availableProviders.claude
                  ? 'border-dracula-purple bg-dracula-purple/10'
                  : 'border-border/30 hover:border-border/60',
                !availableProviders.claude && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="text-xl">🤖</span>
              <div className="space-y-0.5 text-center">
                <p className="text-xs font-semibold">Claude Code</p>
                <p className="text-[10px] text-muted-foreground">
                  {availableProviders.claude ? 'Available' : 'Not installed'}
                </p>
              </div>
            </button>

            {/* Codex Card */}
            <button
              disabled={!availableProviders.codex}
              onClick={() => setSelectedProvider('codex')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-4 text-left transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                selectedProvider === 'codex' && availableProviders.codex
                  ? 'border-dracula-orange bg-dracula-orange/10'
                  : 'border-border/30 hover:border-border/60',
                !availableProviders.codex && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="text-xl">⚡</span>
              <div className="space-y-0.5 text-center">
                <p className="text-xs font-semibold">Codex CLI</p>
                <p className="text-[10px] text-muted-foreground">
                  {availableProviders.codex ? 'Available' : 'Not installed'}
                </p>
              </div>
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground/70">
            ⚠️ Provider selection cannot be changed after the project is created.
          </p>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={noProviderAvailable}
              onClick={() => setStep('input')}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Add Project
            <span className={cn(
              'ml-auto text-[10px] rounded px-1.5 py-0.5 font-medium',
              selectedProvider === 'codex'
                ? 'bg-dracula-orange/20 text-dracula-orange'
                : 'bg-dracula-purple/20 text-dracula-purple'
            )}>
              {selectedProvider === 'codex' ? '⚡ Codex' : '🤖 Claude'}
            </span>
          </DialogTitle>
          <DialogDescription>
            Register a project directory to manage it from the hub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Project path <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="/Users/me/my-project"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAdd() }}
              autoFocus
            />
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
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setStep('provider')} disabled={isAdding}>
            Back
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={isAdding || !projectPath.trim()}>
            {isAdding ? 'Adding...' : 'Add Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
