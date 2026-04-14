import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import type { ProjectConfig } from '../types'

export default function SettingsPage() {
  const { activeProjectId } = useHub()
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [labelFilter, setLabelFilter] = useState('')
  const [activeTracker, setActiveTracker] = useState<'github' | 'jira' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [dailyBudget, setDailyBudget] = useState('')
  const [isSavingBudget, setIsSavingBudget] = useState(false)
  const [jobCostThreshold, setJobCostThreshold] = useState('')
  const [isSavingJobThreshold, setIsSavingJobThreshold] = useState(false)

  // Track saved values to detect unsaved changes
  const savedLabelFilter = useRef('')
  const savedActiveTracker = useRef<'github' | 'jira' | null>(null)
  const hasChanges =
    labelFilter !== savedLabelFilter.current || activeTracker !== savedActiveTracker.current

  const cacheRef = useRef<Map<string, ProjectConfig>>(new Map())

  // Warn on browser-level navigation (refresh/close) when there are unsaved changes
  useEffect(() => {
    if (!hasChanges) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  useEffect(() => {
    // Restore cache instantly on project switch
    if (activeProjectId) {
      const cached = cacheRef.current.get(activeProjectId)
      if (cached) {
        setConfig(cached)
        setLabelFilter(cached.issueTracker.labelFilter)
        setActiveTracker(cached.issueTracker.active)
        setDailyBudget(cached.dailyBudgetUsd != null ? String(cached.dailyBudgetUsd) : '')
        savedLabelFilter.current = cached.issueTracker.labelFilter
        savedActiveTracker.current = cached.issueTracker.active
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
        setLabelFilter(data.issueTracker.labelFilter)
        setActiveTracker(data.issueTracker.active)
        setDailyBudget(data.dailyBudgetUsd != null ? String(data.dailyBudgetUsd) : '')
        savedLabelFilter.current = data.issueTracker.labelFilter
        savedActiveTracker.current = data.issueTracker.active
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

  async function saveSettings() {
    setIsSaving(true)
    try {
      const res = await fetch(`${getApiBase()}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: activeTracker, labelFilter }),
      })
      if (!res.ok) throw new Error('Failed to save')
      savedLabelFilter.current = labelFilter
      savedActiveTracker.current = activeTracker
      toast.success('Settings saved')
    } catch (err) {
      toast.error('Failed to save settings', { description: (err as Error).message })
    } finally {
      setIsSaving(false)
    }
  }

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

      {/* Issue Tracker Section */}
      <Card>
        <CardHeader>
          <CardTitle>Issue Tracker</CardTitle>
          <CardDescription>
            Configure which issue tracker to use for the "From Issues" wizard path
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Detection status */}
          <div className="space-y-2">
            <TrackerStatus
              name="GitHub"
              available={config?.issueTracker.github.available ?? false}
              authenticated={config?.issueTracker.github.authenticated ?? false}
              setupUrl="https://cli.github.com"
              isActive={activeTracker === 'github'}
              onSelect={() => setActiveTracker('github')}
              canSelect={config?.issueTracker.github.authenticated ?? false}
            />
            <TrackerStatus
              name="Jira"
              available={config?.issueTracker.jira.available ?? false}
              authenticated={config?.issueTracker.jira.authenticated ?? false}
              setupUrl="https://github.com/ankitpokhrel/jira-cli"
              isActive={activeTracker === 'jira'}
              onSelect={() => setActiveTracker('jira')}
              canSelect={config?.issueTracker.jira.authenticated ?? false}
            />
          </div>

          <Separator />

          {/* Label filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Label filter</label>
            <Input
              placeholder="e.g. backlog, feature, good-first-issue"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Filter issues by label when browsing in the Implement wizard
            </p>
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

      {/* Queue Section */}
      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>Queue configuration — coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Queue settings (inactivity timeout, auto-pause) will be available in a future update
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Display Section */}
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>Display preferences — coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Display preferences (log line limit, theme) will be available in a future update
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end gap-2">
        {hasChanges && (
          <span className="text-xs text-amber-400">Unsaved changes</span>
        )}
        <Button size="sm" onClick={saveSettings} disabled={isSaving} className="relative">
          {hasChanges && !isSaving && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
          )}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

    </div>
  )
}

interface TrackerStatusProps {
  name: string
  available: boolean
  authenticated: boolean
  setupUrl: string
  isActive: boolean
  onSelect: () => void
  canSelect: boolean
}

function TrackerStatus({
  name,
  available,
  authenticated,
  setupUrl,
  isActive,
  onSelect,
  canSelect,
}: TrackerStatusProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-border">
      <div className="flex items-center gap-2 flex-1">
        {authenticated ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : available ? (
          <AlertCircle className="w-4 h-4 text-amber-400" />
        ) : (
          <XCircle className="w-4 h-4 text-muted-foreground/40" />
        )}
        <div>
          <p className="text-xs font-medium">{name}</p>
          <p className="text-[10px] text-muted-foreground">
            {!available && (
              <>
                Not installed.{' '}
                <a href={setupUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Install CLI
                </a>
              </>
            )}
            {available && !authenticated && 'CLI found but not authenticated. Run the auth command.'}
            {authenticated && 'Connected and authenticated'}
          </p>
        </div>
      </div>

      {canSelect && (
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-1.5 text-[10px] font-medium"
        >
          <div
            className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
              isActive ? 'border-blue-500' : 'border-border'
            }`}
          >
            {isActive && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
          </div>
          <span className={isActive ? 'text-blue-400' : 'text-muted-foreground'}>
            {isActive ? 'Active' : 'Use this'}
          </span>
        </button>
      )}
    </div>
  )
}
