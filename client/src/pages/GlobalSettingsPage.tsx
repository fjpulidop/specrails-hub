import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { TerminalSettingsSection } from '../components/settings/TerminalSettingsSection'
import { Settings, Trash2, Zap, Plus, Bell, GraduationCap } from 'lucide-react'
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
import {
  getOsNotificationPrefs,
  setOsNotificationPrefs,
  type OsNotificationFilter,
} from '../hooks/useOsNotifications'

type WebhookEvent = 'job.completed' | 'job.failed' | 'daily_budget_exceeded'

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'job.completed', label: 'Job completed' },
  { value: 'job.failed', label: 'Job failed' },
  { value: 'daily_budget_exceeded', label: 'Daily budget exceeded' },
]

interface WebhookRow {
  id: string
  project_id: string | null
  url: string
  secret: string
  events: string
  enabled: number
  created_at: string
}

interface HubSettings {
  port: number
  specrailsTechUrl: string
  costAlertThresholdUsd: number | null
}

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onOpenOnboarding?: () => void
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

export default function SettingsDialog({ open, onClose, onOpenOnboarding }: SettingsDialogProps) {
  const { projects, removeProject } = useHub()
  const [hubSettings, setHubSettings] = useState<HubSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [specrailsTechUrl, setSpecrailsTechUrl] = useState('')
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [costAlertThreshold, setCostAlertThreshold] = useState('')
  const [isSavingThreshold, setIsSavingThreshold] = useState(false)
  const [hubDailyBudget, setHubDailyBudget] = useState('')
  const [isSavingHubBudget, setIsSavingHubBudget] = useState(false)

  // Webhook state
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookSecret, setNewWebhookSecret] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEvent[]>(['job.completed', 'job.failed'])
  const [isAddingWebhook, setIsAddingWebhook] = useState(false)

  // OS Notification preferences (localStorage)
  const [notifEnabled, setNotifEnabled] = useState(() => getOsNotificationPrefs().enabled)
  const [notifFilter, setNotifFilter] = useState<OsNotificationFilter>(() => getOsNotificationPrefs().filter)

  function handleToggleNotifications(enabled: boolean) {
    setNotifEnabled(enabled)
    setOsNotificationPrefs({ enabled, filter: notifFilter })
    toast.success(enabled ? 'OS notifications enabled' : 'OS notifications disabled')
  }

  function handleNotifFilterChange(filter: OsNotificationFilter) {
    setNotifFilter(filter)
    setOsNotificationPrefs({ enabled: notifEnabled, filter })
  }

  const loadWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/webhooks')
      if (res.ok) {
        const data = await res.json() as { webhooks: WebhookRow[] }
        setWebhooks(data.webhooks)
      }
    } catch { /* ignore */ }
  }, [])

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
    void loadWebhooks()
  }, [open, loadWebhooks])

  useEffect(() => {
    if (!open) return
    fetch('/api/hub/budget')
      .then((r) => r.json())
      .then((data: { hubDailyBudgetUsd?: number | null }) => {
        if (data.hubDailyBudgetUsd != null) setHubDailyBudget(String(data.hubDailyBudgetUsd))
        else setHubDailyBudget('')
      })
      .catch(() => {})
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

  async function handleSaveHubDailyBudget() {
    setIsSavingHubBudget(true)
    try {
      const val = hubDailyBudget.trim() === '' ? null : parseFloat(hubDailyBudget)
      if (val !== null && (isNaN(val) || val <= 0)) {
        toast.error('Enter a positive number or leave blank to disable')
        return
      }
      const res = await fetch('/api/hub/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubDailyBudgetUsd: val }),
      })
      if (res.ok) {
        toast.success(val == null ? 'Hub daily budget removed' : `Hub daily budget set to $${val}`)
      } else {
        toast.error('Failed to save hub daily budget')
      }
    } catch {
      toast.error('Failed to save hub daily budget')
    } finally {
      setIsSavingHubBudget(false)
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

  async function handleAddWebhook() {
    if (!newWebhookUrl.trim()) {
      toast.error('URL is required')
      return
    }
    if (newWebhookEvents.length === 0) {
      toast.error('Select at least one event')
      return
    }
    setIsAddingWebhook(true)
    try {
      const res = await fetch('/api/hub/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newWebhookUrl.trim(), secret: newWebhookSecret.trim(), events: newWebhookEvents }),
      })
      if (res.ok) {
        toast.success('Webhook added')
        setNewWebhookUrl('')
        setNewWebhookSecret('')
        setNewWebhookEvents(['job.completed', 'job.failed'])
        await loadWebhooks()
      } else {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? 'Failed to add webhook')
      }
    } catch {
      toast.error('Failed to add webhook')
    } finally {
      setIsAddingWebhook(false)
    }
  }

  async function handleToggleWebhook(id: string, enabled: boolean) {
    try {
      await fetch(`/api/hub/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      await loadWebhooks()
    } catch {
      toast.error('Failed to update webhook')
    }
  }

  async function handleDeleteWebhook(id: string) {
    try {
      const res = await fetch(`/api/hub/webhooks/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Webhook removed')
        await loadWebhooks()
      }
    } catch {
      toast.error('Failed to remove webhook')
    }
  }

  async function handleTestWebhook(id: string) {
    try {
      const res = await fetch(`/api/hub/webhooks/${id}/test`, { method: 'POST' })
      if (res.ok) {
        toast.success('Test ping sent')
      }
    } catch {
      toast.error('Failed to send test ping')
    }
  }

  function toggleNewEvent(event: WebhookEvent) {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
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

            {/* Budget & Alerts */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Budget &amp; Alerts
              </h3>
              <div className="rounded-md border border-border p-3 space-y-4">
                {/* Hub daily budget */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Hub daily budget (USD)</p>
                  <p className="text-[10px] text-muted-foreground">
                    Global daily spend limit across all projects. Queues auto-pause when exceeded.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={hubDailyBudget}
                      onChange={(e) => setHubDailyBudget(e.target.value)}
                      placeholder="e.g. 10.00"
                      className="h-7 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs shrink-0"
                      disabled={isSavingHubBudget}
                      onClick={() => void handleSaveHubDailyBudget()}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                {/* Per-job cost alert threshold */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-medium">Per-job cost alert (USD)</p>
                  <p className="text-[10px] text-muted-foreground">
                    Alert when a single job exceeds this amount. Leave blank to disable.
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
            </div>

            {/* OS Notifications */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                OS Notifications
              </h3>
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Show native desktop notifications when jobs complete or fail. Notifications only appear when the tab is not focused.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifEnabled}
                    onChange={(e) => handleToggleNotifications(e.target.checked)}
                    className="w-3.5 h-3.5"
                    data-testid="notif-toggle"
                  />
                  <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs">Enable OS Notifications</span>
                </label>
                {notifEnabled && (
                  <div className="space-y-1.5 pl-6">
                    <p className="text-[10px] text-muted-foreground">Notify on:</p>
                    <div className="flex flex-wrap gap-3">
                      {([
                        { value: 'all' as const, label: 'All (completed & failed)' },
                        { value: 'completed' as const, label: 'Completed only' },
                        { value: 'failed' as const, label: 'Failed only' },
                      ]).map(({ value, label }) => (
                        <label key={value} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                          <input
                            type="radio"
                            name="notif-filter"
                            checked={notifFilter === value}
                            onChange={() => handleNotifFilterChange(value)}
                            className="w-3 h-3"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Webhooks */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Outbound Webhooks
              </h3>
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Notify external tools (Slack, Zapier, CI/CD) on hub events. Requests are signed via <code className="font-mono">X-Specrails-Signature</code> when a secret is set.
                </p>

                {webhooks.length > 0 && (
                  <div className="space-y-1.5">
                    {webhooks.map((wh) => {
                      const events: string[] = (() => { try { return JSON.parse(wh.events) as string[] } catch { return [] } })()
                      return (
                        <div key={wh.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-xs font-mono truncate">{wh.url}</p>
                            <p className="text-[10px] text-muted-foreground">{events.join(', ')}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => void handleToggleWebhook(wh.id, !wh.enabled)}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${wh.enabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
                              title={wh.enabled ? 'Disable' : 'Enable'}
                            >
                              {wh.enabled ? 'on' : 'off'}
                            </button>
                            <button
                              onClick={() => void handleTestWebhook(wh.id)}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                              title="Send test ping"
                            >
                              <Zap className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => void handleDeleteWebhook(wh.id)}
                              className="text-muted-foreground hover:text-destructive p-0.5"
                              title="Remove"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-2 border-t border-border pt-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Add webhook</p>
                  <Input
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    placeholder="https://hooks.example.com/..."
                    className="h-7 text-xs font-mono"
                  />
                  <Input
                    value={newWebhookSecret}
                    onChange={(e) => setNewWebhookSecret(e.target.value)}
                    placeholder="Signing secret (optional)"
                    className="h-7 text-xs font-mono"
                  />
                  <div className="flex flex-wrap gap-3">
                    {WEBHOOK_EVENTS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newWebhookEvents.includes(value)}
                          onChange={() => toggleNewEvent(value)}
                          className="w-3 h-3"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs w-full"
                    disabled={isAddingWebhook || !newWebhookUrl.trim()}
                    onClick={() => void handleAddWebhook()}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Webhook
                  </Button>
                </div>
              </div>
            </div>

            {/* Onboarding */}
            {onOpenOnboarding && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Onboarding
                </h3>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium">Platform Tour</p>
                      <p className="text-[10px] text-muted-foreground">
                        Replay the welcome wizard to review key features.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs shrink-0"
                      onClick={onOpenOnboarding}
                      data-testid="replay-onboarding"
                    >
                      <GraduationCap className="w-3 h-3 mr-1" />
                      Replay Tour
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Terminal panel */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Terminal Panel
              </h3>
              <TerminalSettingsSection mode="hub" />
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
