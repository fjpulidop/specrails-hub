import { useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen, AlertTriangle, Check } from 'lucide-react'
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
// Hub context drives the WS-based project list update after add

interface AddProjectDialogProps {
  open: boolean
  onClose: () => void
}

type DialogState =
  | { step: 'input' }
  | { step: 'no-specrails'; projectName: string; projectPath: string }
  | { step: 'installing'; projectName: string; projectPath: string }

export function AddProjectDialog({ open, onClose }: AddProjectDialogProps) {
  const [projectPath, setProjectPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [dialogState, setDialogState] = useState<DialogState>({ step: 'input' })
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
        body: JSON.stringify({ path: trimmedPath, name: projectName.trim() || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error('Failed to add project', { description: data.error })
        return
      }

      if (data.has_specrails === false) {
        setDialogState({
          step: 'no-specrails',
          projectName: data.project.name,
          projectPath: data.project.path,
        })
      } else {
        toast.success(`Project "${data.project.name}" registered`)
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
    setDialogState({ step: 'input' })
    onClose()
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) resetAndClose()
  }

  function handleSkipInstall() {
    toast.success(`Project "${(dialogState as { projectName: string }).projectName}" registered without specrails`)
    resetAndClose()
  }

  // ─── Input step ──────────────────────────────────────────────────────────────

  if (dialogState.step === 'input') {
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
            <Button variant="outline" size="sm" onClick={onClose} disabled={isAdding}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isAdding || !projectPath.trim()}>
              {isAdding ? 'Adding...' : 'Add Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ─── No specrails step ───────────────────────────────────────────────────────

  if (dialogState.step === 'no-specrails') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-4 h-4" />
              specrails not detected
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{dialogState.projectName}</strong> was registered
              but doesn&apos;t have specrails installed. Without it, pipeline commands won&apos;t be available.
            </p>

            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium">To install specrails, run in your project:</p>
              <code className="block text-xs font-mono bg-background/50 px-2 py-1.5 rounded border border-border select-all">
                cd {dialogState.projectPath} && npx specrails
              </code>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>This will set up:</p>
              <ul className="list-none space-y-0.5 ml-1">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 mt-0.5 text-dracula-green flex-shrink-0" />
                  <span>Specialized AI agents (architect, developer, reviewer)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 mt-0.5 text-dracula-green flex-shrink-0" />
                  <span>Workflow commands (/sr:implement, /sr:product-backlog...)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3 h-3 mt-0.5 text-dracula-green flex-shrink-0" />
                  <span>User personas and per-layer conventions</span>
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleSkipInstall}>
              Skip for now
            </Button>
            <Button size="sm" onClick={resetAndClose}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
