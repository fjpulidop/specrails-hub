import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import type { ProjectConfig } from '../types'

interface ProjectSettings {
  pipelineTelemetryEnabled: boolean
}

export default function SettingsPage() {
  const { activeProjectId } = useHub()
  // SettingsPage is only mounted in hub mode; telemetry toggle is hub-only
  const isHubMode = activeProjectId !== null
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyBudget, setDailyBudget] = useState('')
  const [isSavingBudget, setIsSavingBudget] = useState(false)
  const [jobCostThreshold, setJobCostThreshold] = useState('')
  const [isSavingJobThreshold, setIsSavingJobThreshold] = useState(false)
  const [telemetryEnabled, setTelemetryEnabled] = useState(false)
  const [isSavingTelemetry, setIsSavingTelemetry] = useState(false)

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

      {/* Budget Section */}
      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>
            Set a daily spend cap for this project. The queue auto-pauses when the limit is hit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Daily budget (USD)</label>
            <div className="flex gap-2 max-w-xs">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                placeholder="e.g. 5.00"
                className="h-8 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs shrink-0"
                disabled={isSavingBudget}
                onClick={saveDailyBudget}
              >
                {isSavingBudget ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Leave blank to disable. Spend is calculated over the last 24 hours.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Per-job cost alert (USD)</label>
            <div className="flex gap-2 max-w-xs">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={jobCostThreshold}
                onChange={(e) => setJobCostThreshold(e.target.value)}
                placeholder="e.g. 0.50"
                className="h-8 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs shrink-0"
                disabled={isSavingJobThreshold}
                onClick={saveJobCostThreshold}
              >
                {isSavingJobThreshold ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Alert when a single job in this project exceeds this amount.
            </p>
          </div>
        </CardContent>
      </Card>

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

    </div>
  )
}
