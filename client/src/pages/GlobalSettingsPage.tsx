import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Settings } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog'
import { useHub } from '../hooks/useHub'
import type { HubProject } from '../hooks/useHub'

interface HubSettings {
  port: number
  specrailsTechUrl: string
  costAlertThresholdUsd: number | null
}

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

function ProjectListItem({
  project,
  onRemove,
}: {
  project: HubProject
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md border border-border">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{project.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{project.path}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemove(project.id)}
      >
        Remove
      </Button>
    </div>
  )
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { projects, removeProject } = useHub()
  const [hubSettings, setHubSettings] = useState<HubSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [specrailsTechUrl, setSpecrailsTechUrl] = useState('')
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [costAlertThreshold, setCostAlertThreshold] = useState('')
  const [isSavingThreshold, setIsSavingThreshold] = useState(false)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    async function load() {
      try {
        const res = await fetch('/api/hub/settings')
        if (res.ok) {
          const data = await res.json() as HubSettings
          setHubSettings(data)
          setSpecrailsTechUrl(data.specrailsTechUrl ?? 'http://localhost:3000')
          setCostAlertThreshold(data.costAlertThresholdUsd != null ? String(data.costAlertThresholdUsd) : '')
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [open])

  async function handleSaveSpecrailsTechUrl() {
    if (!specrailsTechUrl.trim()) return
    setIsSavingUrl(true)
    try {
      const res = await fetch('/api/hub/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specrailsTechUrl: specrailsTechUrl.trim() }),
      })
      if (res.ok) {
        toast.success('specrails-tech URL saved')
      } else {
        toast.error('Failed to save URL')
      }
    } catch {
      toast.error('Failed to save URL')
    } finally {
      setIsSavingUrl(false)
    }
  }

  async function handleSaveCostAlertThreshold() {
    setIsSavingThreshold(true)
    try {
      const parsed = costAlertThreshold.trim() === '' ? null : parseFloat(costAlertThreshold)
      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
        toast.error('Enter a positive number or leave blank to disable')
        return
      }
      const res = await fetch('/api/hub/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costAlertThresholdUsd: parsed }),
      })
      if (res.ok) {
        toast.success(parsed == null ? 'Cost alerts disabled' : `Alert set for jobs over $${parsed}`)
      } else {
        toast.error('Failed to save threshold')
      }
    } catch {
      toast.error('Failed to save threshold')
    } finally {
      setIsSavingThreshold(false)
    }
  }

  async function handleRemoveProject(id: string) {
    try {
      await removeProject(id)
      toast.success('Project removed')
    } catch (err) {
      toast.error('Failed to remove project', { description: (err as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Hub Settings
          </DialogTitle>
          <DialogDescription>
            Manage registered projects and view hub information.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
            <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Projects section */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Registered Projects
              </h3>
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground">No projects registered yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {projects.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      onRemove={handleRemoveProject}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* specrails-tech config */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                specrails-tech
              </h3>
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Base URL for the specrails-tech API (default: http://localhost:3000)
                </p>
                <div className="flex gap-2">
                  <Input
                    value={specrailsTechUrl}
                    onChange={(e) => setSpecrailsTechUrl(e.target.value)}
                    placeholder="http://localhost:3000"
                    className="h-7 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs shrink-0"
                    disabled={isSavingUrl}
                    onClick={handleSaveSpecrailsTechUrl}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Cost alerts */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cost Alerts
              </h3>
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Alert when a single job exceeds this amount (USD). Leave blank to disable.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costAlertThreshold}
                    onChange={(e) => setCostAlertThreshold(e.target.value)}
                    placeholder="e.g. 0.50"
                    className="h-7 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs shrink-0"
                    disabled={isSavingThreshold}
                    onClick={handleSaveCostAlertThreshold}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Hub info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hub Information
              </h3>
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Port</span>
                  <span className="font-mono">{hubSettings?.port ?? 4200}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Projects</span>
                  <span className="font-mono">{projects.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Hub DB</span>
                  <span className="font-mono text-[10px] text-muted-foreground">~/.specrails/hub.sqlite</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
