import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface AskHubSettings {
  provider: 'claude' | 'codex' | 'none' | null
  answerModel: { claude: string; codex: string }
  reranker: 'llm' | 'heuristic' | 'none'
  autoIndexOnFirstOpen: boolean
  hotkey: string | null
  monthlyBudgetUsd: number
}

export function AskHubSettings() {
  const [settings, setSettings] = useState<AskHubSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    let promise: Promise<Response> | undefined
    try {
      promise = fetch('/api/hub/ask-settings')
    } catch {
      return
    }
    if (!promise || typeof promise.then !== 'function') return
    promise
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return
        const parsed = data as Partial<AskHubSettings> | null
        if (!parsed || typeof parsed !== 'object' || !parsed.answerModel) return
        setSettings(parsed as AskHubSettings)
      })
      .catch(() => { if (!cancelled) setSettings(null) })
    return () => { cancelled = true }
  }, [])

  async function patch(next: Partial<AskHubSettings> & Record<string, unknown>): Promise<void> {
    if (!settings) return
    const prev = settings
    setSaving(true)
    try {
      const res = await fetch('/api/hub/ask-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = (await res.json()) as AskHubSettings
      setSettings(updated)
    } catch (err) {
      toast.error(`Failed to save: ${(err as Error).message}`)
      setSettings(prev)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ask the Hub</h3>
      <div className="rounded-md border border-border p-3 space-y-3">
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Answer provider</span>
          <select
            value={settings.provider ?? ''}
            disabled={saving}
            onChange={(e) => patch({ provider: e.target.value === '' ? null : (e.target.value as 'claude' | 'codex' | 'none') })}
            className="bg-background border border-border rounded px-2 py-1 text-xs"
          >
            <option value="">Auto (first-run picker)</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
            <option value="none">Search only (no AI)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Claude model</span>
          <input
            type="text"
            value={settings.answerModel.claude}
            disabled={saving}
            onChange={(e) => patch({ answerModelClaude: e.target.value })}
            className="bg-background border border-border rounded px-2 py-1 text-xs w-40"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Codex model</span>
          <input
            type="text"
            value={settings.answerModel.codex}
            disabled={saving}
            onChange={(e) => patch({ answerModelCodex: e.target.value })}
            className="bg-background border border-border rounded px-2 py-1 text-xs w-40"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Reranker</span>
          <select
            value={settings.reranker}
            disabled={saving}
            onChange={(e) => patch({ reranker: e.target.value as 'llm' | 'heuristic' | 'none' })}
            className="bg-background border border-border rounded px-2 py-1 text-xs"
          >
            <option value="heuristic">Heuristic (free)</option>
            <option value="llm">LLM (extra cost)</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Monthly budget (USD)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={settings.monthlyBudgetUsd}
            disabled={saving}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0) patch({ monthlyBudgetUsd: v })
            }}
            className="bg-background border border-border rounded px-2 py-1 text-xs w-24 text-right"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Auto-index on first open</span>
          <input
            type="checkbox"
            checked={settings.autoIndexOnFirstOpen}
            disabled={saving}
            onChange={(e) => patch({ autoIndexOnFirstOpen: e.target.checked })}
          />
        </label>
        <p className="text-[10px] text-muted-foreground/70">
          Embeddings run 100% locally with the bundled model. The answer LLM reuses your installed Claude or Codex CLI.{' '}
          <a
            href="https://github.com/fjpulidop/specrails-hub/blob/main/docs/ask-the-hub.md"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            How it works
          </a>
        </p>
      </div>
    </div>
  )
}
