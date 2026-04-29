import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import type { ProjectConfig } from '../types'
import { TerminalSettingsSection } from '../components/settings/TerminalSettingsSection'

interface ProjectSettings {
  pipelineTelemetryEnabled: boolean
  orchestratorModel?: string
  prePrompt?: string
}

export default function SettingsPage() {
  const { activeProjectId } = useHub()
  const location = useLocation()
  // SettingsPage is only mounted in hub mode; telemetry toggle is hub-only
  const isHubMode = activeProjectId !== null

  // Scroll-to-hash + brief highlight when the page is opened with a hash anchor
  // (e.g. /settings#terminal-browser-shortcut-url from the topbar context menu).
  // The TerminalSettingsSection mounts in a loading state and only renders the
  // anchored field after its fetch resolves, so we poll for the element with a
  // 3s budget instead of trying once.
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    let cancelled = false
    const deadline = Date.now() + 3000
    const tryScroll = (): void => {
      if (cancelled) return
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-dracula-purple/60', 'rounded')
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-dracula-purple/60', 'rounded')
        }, 1800)
        return
      }
      if (Date.now() < deadline) {
        window.setTimeout(tryScroll, 80)
      }
    }
    tryScroll()
    return () => { cancelled = true }
  }, [location.hash, location.key])
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyBudget, setDailyBudget] = useState('')
  const [isSavingBudget, setIsSavingBudget] = useState(false)
  const [jobCostThreshold, setJobCostThreshold] = useState('')
  const [isSavingJobThreshold, setIsSavingJobThreshold] = useState(false)
  const [telemetryEnabled, setTelemetryEnabled] = useState(false)
  const [isSavingTelemetry, setIsSavingTelemetry] = useState(false)
  const [prePrompt, setPrePrompt] = useState('')
  const [isSavingPrePrompt, setIsSavingPrePrompt] = useState(false)

  const cacheRef = useRef<Map<string, ProjectConfig>>(new Map())

  useEffect(() => {
    // Restore cache instantly on project switch
    if (activeProjectId) {
      const cached = cacheRef.current.get(activeProjectId)
      if (cached) {
        setConfig(cached)
        setDailyBudget(cached.dailyBudgetUsd != null ? String(cached.dailyBudgetUsd) : '')
        setIsLoading(false)
      } else {
        setIsLoading(true)
      }
    }
    async function loadConfig() {
      try {
        const res = await fetch(`${getApiBase()}/config`)
        if (!res.ok) return
        const data = await res.json() as ProjectConfig
        setConfig(data)
        setDailyBudget(data.dailyBudgetUsd != null ? String(data.dailyBudgetUsd) : '')
        if (activeProjectId) cacheRef.current.set(activeProjectId, data)
      } catch {
        // ignore
      } finally {
        setIsLoading(false)
      }
    }
    loadConfig()
  }, [activeProjectId])

  useEffect(() => {
    if (!activeProjectId) return
    async function loadBudget() {
      try {
        const res = await fetch(`${getApiBase()}/budget`)
        if (!res.ok) return
        const data = await res.json() as { dailyBudgetUsd?: number | null; jobCostThresholdUsd?: number | null }
        if (data.dailyBudgetUsd != null) setDailyBudget(String(data.dailyBudgetUsd))
        if (data.jobCostThresholdUsd != null) setJobCostThreshold(String(data.jobCostThresholdUsd))
        else setJobCostThreshold('')
      } catch {
        // ignore
      }
    }
    void loadBudget()
  }, [activeProjectId])

  useEffect(() => {
    if (!activeProjectId || !isHubMode) return
    async function loadTelemetrySettings() {
      try {
        const res = await fetch(`${getApiBase()}/settings`)
        if (!res.ok) return
        const data = await res.json() as ProjectSettings
        setTelemetryEnabled(data.pipelineTelemetryEnabled ?? false)
        setPrePrompt(data.prePrompt ?? '')
      } catch {
        // ignore
      }
    }
    void loadTelemetrySettings()
  }, [activeProjectId, isHubMode])

  async function saveDailyBudget() {
    setIsSavingBudget(true)
    try {
      const parsed = dailyBudget.trim() === '' ? null : parseFloat(dailyBudget)
      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
        toast.error('Enter a positive number or leave blank to disable')
        return
      }
      const res = await fetch(`${getApiBase()}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyBudgetUsd: parsed }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success(parsed == null ? 'Daily budget removed' : `Daily budget set to $${parsed}`)
    } catch (err) {
      toast.error('Failed to save budget', { description: (err as Error).message })
    } finally {
      setIsSavingBudget(false)
    }
  }

  async function saveJobCostThreshold() {
    setIsSavingJobThreshold(true)
    try {
      const parsed = jobCostThreshold.trim() === '' ? null : parseFloat(jobCostThreshold)
      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
        toast.error('Enter a positive number or leave blank to disable')
        return
      }
      const res = await fetch(`${getApiBase()}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCostThresholdUsd: parsed }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success(parsed == null ? 'Per-job cost alert disabled' : `Alert set for jobs over $${parsed}`)
    } catch (err) {
      toast.error('Failed to save threshold', { description: (err as Error).message })
    } finally {
      setIsSavingJobThreshold(false)
    }
  }

  async function saveTelemetryToggle(enabled: boolean) {
    setIsSavingTelemetry(true)
    const prev = telemetryEnabled
    setTelemetryEnabled(enabled)
    try {
      const res = await fetch(`${getApiBase()}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineTelemetryEnabled: enabled }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success(enabled ? 'Pipeline telemetry enabled' : 'Pipeline telemetry disabled')
    } catch (err) {
      setTelemetryEnabled(prev)
      toast.error('Failed to save telemetry setting', { description: (err as Error).message })
    } finally {
      setIsSavingTelemetry(false)
    }
  }

  async function savePrePrompt() {
    setIsSavingPrePrompt(true)
    try {
      const res = await fetch(`${getApiBase()}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prePrompt }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const data = await res.json() as { settings?: ProjectSettings }
      const savedValue = data.settings?.prePrompt ?? ''
      setPrePrompt(savedValue)
      toast.success(savedValue.trim() === '' ? 'Pre-prompt cleared' : 'Pre-prompt saved')
    } catch (err) {
      toast.error('Failed to save pre-prompt', { description: (err as Error).message })
    } finally {
      setIsSavingPrePrompt(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-base font-semibold">Project Settings</h1>
        {config && (
          <p className="text-xs text-muted-foreground mt-1">
            {config.project.name}
            {config.project.repo && ` · ${config.project.repo}`}
          </p>
        )}
      </div>

      {/* Pipeline Telemetry Section — hub mode only */}
      {isHubMode && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Telemetry</CardTitle>
            <CardDescription>
              Capture token usage, phase durations, and subagent activity for diagnostic export. Off by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Enable pipeline telemetry</p>
                <p className="text-[10px] text-muted-foreground">
                  When on, OTEL data from pipeline jobs is captured locally. Use the{' '}
                  <span className="font-mono">Export diagnostic</span> button on any job card to download.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Enable pipeline telemetry"
                aria-checked={telemetryEnabled}
                disabled={isSavingTelemetry}
                onClick={() => saveTelemetryToggle(!telemetryEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
                  telemetryEnabled ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
                    telemetryEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rail Pre-prompt</CardTitle>
          <CardDescription>
            Extra project-specific instructions appended to implement and batch-implement rail jobs after the ticket context and before execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="project-pre-prompt" className="text-xs font-medium">
              Pre-prompt
            </label>
            <textarea
              id="project-pre-prompt"
              value={prePrompt}
              onChange={(e) => setPrePrompt(e.target.value)}
              placeholder="Example: Prefer incremental changes, keep migrations backward compatible, and add tests for every rail change."
              className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
            <p className="text-xs text-muted-foreground">
              Use this for stable project guidance that should accompany every rail implementation run.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={isSavingPrePrompt}
              onClick={savePrePrompt}
            >
              {isSavingPrePrompt ? 'Saving...' : 'Save pre-prompt'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Budget Section */}
      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>
            Set a daily spend cap for this project. The queue auto-pauses when the limit is hit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium">Daily budget (USD)</label>
                <p className="text-xs text-muted-foreground">
                  Leave blank to disable. Spend is calculated over the last 24 hours.
                </p>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                placeholder="e.g. 5.00"
                className="h-8 text-xs font-mono"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  disabled={isSavingBudget}
                  onClick={saveDailyBudget}
                >
                  {isSavingBudget ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium">Per-job cost alert (USD)</label>
                <p className="text-xs text-muted-foreground">
                  Alert when a single job in this project exceeds this amount.
                </p>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={jobCostThreshold}
                onChange={(e) => setJobCostThreshold(e.target.value)}
                placeholder="e.g. 0.50"
                className="h-8 text-xs font-mono"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  disabled={isSavingJobThreshold}
                  onClick={saveJobCostThreshold}
                >
                  {isSavingJobThreshold ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <TerminalSettingsSection mode="project" />

    </div>
  )
}
