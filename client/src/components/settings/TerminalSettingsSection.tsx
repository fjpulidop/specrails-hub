import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useHub } from '../../hooks/useHub'
import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  type PartialTerminalSettings,
  type TerminalSettings,
  type TerminalRenderMode,
} from '../../lib/terminal-settings-types'

interface Props {
  /** Hub mode edits hub_settings; project mode edits a per-project override layer. */
  mode: 'hub' | 'project'
}

interface ProjectResponse {
  resolved: TerminalSettings
  override: PartialTerminalSettings
  hubDefaults: TerminalSettings
}

const RENDER_MODES: TerminalRenderMode[] = ['auto', 'canvas', 'webgl']

export function TerminalSettingsSection({ mode }: Props) {
  const { activeProjectId } = useHub()

  // Saved (last server-confirmed) state.
  const [hub, setHub] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS)
  const [override, setOverride] = useState<PartialTerminalSettings>({})
  const [savedResolved, setSavedResolved] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS)

  // Draft (in-progress edits, not yet sent).
  const [draft, setDraft] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS)
  // Per-field "cleared override" flag — when true in project mode, the field
  // will be PATCHed with null on save to remove the override.
  const [clearedFields, setClearedFields] = useState<Set<keyof TerminalSettings>>(new Set())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (mode === 'project' && !activeProjectId) {
      setLoading(false)
      return
    }
    void (async () => {
      try {
        if (mode === 'hub') {
          const res = await fetch('/api/hub/terminal-settings')
          if (!res.ok) throw new Error('hub fetch failed')
          const body = (await res.json()) as TerminalSettings
          if (!cancelled && body && typeof body === 'object' && 'fontSize' in body) {
            setHub(body); setSavedResolved(body); setDraft(body)
            setClearedFields(new Set())
          }
          if (!cancelled) setLoading(false)
        } else if (activeProjectId) {
          const res = await fetch(`/api/projects/${activeProjectId}/terminal-settings`)
          if (!res.ok) throw new Error('project fetch failed')
          const body = (await res.json()) as ProjectResponse
          if (!cancelled && body && typeof body === 'object' && body.resolved && body.hubDefaults) {
            setHub(body.hubDefaults); setOverride(body.override ?? {}); setSavedResolved(body.resolved); setDraft(body.resolved)
            setClearedFields(new Set())
          }
          if (!cancelled) setLoading(false)
        }
      } catch (err) {
        if (!cancelled) { setLoading(false); console.error(err) }
      }
    })()
    return () => { cancelled = true }
  }, [mode, activeProjectId])

  const dirty = useMemo(() => {
    if (clearedFields.size > 0) return true
    return (Object.keys(draft) as Array<keyof TerminalSettings>).some(
      (k) => draft[k] !== savedResolved[k],
    )
  }, [draft, savedResolved, clearedFields])

  function setField<K extends keyof TerminalSettings>(field: K, value: TerminalSettings[K]): void {
    setDraft((d) => ({ ...d, [field]: value }))
    // If user re-edits a previously-cleared field, drop the clear flag.
    if (clearedFields.has(field)) {
      setClearedFields((prev) => { const next = new Set(prev); next.delete(field); return next })
    }
  }

  function clearOverride(field: keyof TerminalSettings): void {
    if (mode !== 'project') return
    // Mark for null-PATCH on save and reset draft to the hub default value
    // so the user immediately sees what they'll get.
    setClearedFields((prev) => { const next = new Set(prev); next.add(field); return next })
    setDraft((d) => ({ ...d, [field]: hub[field] }))
  }

  function reset(): void {
    setDraft(savedResolved)
    setClearedFields(new Set())
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      // Build the partial PATCH body from draft vs savedResolved diff + cleared fields.
      const body: Record<string, unknown> = {}
      for (const k of Object.keys(draft) as Array<keyof TerminalSettings>) {
        if (clearedFields.has(k)) {
          body[k] = null
          continue
        }
        if (draft[k] !== savedResolved[k]) body[k] = draft[k]
      }
      if (Object.keys(body).length === 0) { toast('Nothing to save'); setSaving(false); return }

      if (mode === 'hub') {
        const res = await fetch('/api/hub/terminal-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.text()) || 'patch failed')
        const updated = (await res.json()) as TerminalSettings
        setHub(updated); setSavedResolved(updated); setDraft(updated); setClearedFields(new Set())
        toast.success('Terminal settings saved')
      } else if (activeProjectId) {
        const res = await fetch(`/api/projects/${activeProjectId}/terminal-settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.text()) || 'patch failed')
        const updated = (await res.json()) as ProjectResponse
        setHub(updated.hubDefaults); setOverride(updated.override); setSavedResolved(updated.resolved); setDraft(updated.resolved)
        setClearedFields(new Set())
        toast.success('Terminal settings saved')
      }
    } catch (err) {
      toast.error(`Failed to save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  function isOverridden(field: keyof TerminalSettings): boolean {
    if (mode !== 'project') return false
    if (clearedFields.has(field)) return false
    return override[field] !== undefined
  }

  if (loading) return <Card><CardContent>Loading…</CardContent></Card>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terminal panel</CardTitle>
        <CardDescription>
          {mode === 'hub'
            ? 'Hub-wide defaults applied to every project unless a per-project override is set.'
            : 'Per-project overrides for the terminal panel. Leave a field unchanged to inherit the hub default.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Font family" overridden={isOverridden('fontFamily')} onClear={() => clearOverride('fontFamily')} mode={mode}>
          <Input
            value={draft.fontFamily}
            onChange={(e) => setField('fontFamily', e.target.value)}
          />
        </Field>

        <Field label={`Font size (${TERMINAL_FONT_SIZE_MIN}–${TERMINAL_FONT_SIZE_MAX})`} overridden={isOverridden('fontSize')} onClear={() => clearOverride('fontSize')} mode={mode}>
          <Input
            type="number"
            min={TERMINAL_FONT_SIZE_MIN}
            max={TERMINAL_FONT_SIZE_MAX}
            value={draft.fontSize}
            onChange={(e) => setField('fontSize', parseInt(e.target.value, 10) || draft.fontSize)}
          />
        </Field>

        <Field label="Render mode" overridden={isOverridden('renderMode')} onClear={() => clearOverride('renderMode')} mode={mode}>
          <select
            value={draft.renderMode}
            onChange={(e) => setField('renderMode', e.target.value as TerminalRenderMode)}
            className="border rounded px-2 py-1 bg-transparent"
          >
            {RENDER_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <ToggleField
          label="Copy on select"
          checked={draft.copyOnSelect}
          overridden={isOverridden('copyOnSelect')}
          onClear={() => clearOverride('copyOnSelect')}
          onChange={(v) => setField('copyOnSelect', v)}
          mode={mode}
        />

        <ToggleField
          label="Shell integration (OSC 133 marks)"
          checked={draft.shellIntegrationEnabled}
          overridden={isOverridden('shellIntegrationEnabled')}
          onClear={() => clearOverride('shellIntegrationEnabled')}
          onChange={(v) => setField('shellIntegrationEnabled', v)}
          mode={mode}
        />

        <ToggleField
          label="Notify on long-running commands"
          checked={draft.notifyOnCompletion}
          overridden={isOverridden('notifyOnCompletion')}
          onClear={() => clearOverride('notifyOnCompletion')}
          onChange={(v) => setField('notifyOnCompletion', v)}
          mode={mode}
        />

        <Field label="Long-command threshold (ms)" overridden={isOverridden('longCommandThresholdMs')} onClear={() => clearOverride('longCommandThresholdMs')} mode={mode}>
          <Input
            type="number"
            min={1000}
            value={draft.longCommandThresholdMs}
            onChange={(e) => setField('longCommandThresholdMs', parseInt(e.target.value, 10) || draft.longCommandThresholdMs)}
          />
        </Field>

        <ToggleField
          label="Inline image rendering (Sixel + iTerm2)"
          checked={draft.imageRendering}
          overridden={isOverridden('imageRendering')}
          onClear={() => clearOverride('imageRendering')}
          onChange={(v) => setField('imageRendering', v)}
          mode={mode}
        />

        <Field id="terminal-browser-shortcut-url" label="Browser shortcut URL" overridden={isOverridden('browserShortcutUrl')} onClear={() => clearOverride('browserShortcutUrl')} mode={mode}>
          <Input
            type="url"
            value={draft.browserShortcutUrl}
            placeholder="https://specrails.dev"
            onChange={(e) => setField('browserShortcutUrl', e.target.value)}
          />
        </Field>

        <Field id="terminal-quick-script" label="Quick script (pasted into active terminal — Enter manually)" overridden={isOverridden('quickScript')} onClear={() => clearOverride('quickScript')} mode={mode}>
          <textarea
            value={draft.quickScript}
            placeholder='echo "Hello World!"'
            onChange={(e) => setField('quickScript', e.target.value)}
            rows={3}
            className="w-full border rounded px-2 py-1 bg-transparent font-mono text-xs"
          />
        </Field>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
            Reset
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ id, label, overridden, onClear, mode, children }: { id?: string; label: string; overridden: boolean; onClear: () => void; mode: 'hub' | 'project'; children: React.ReactNode }) {
  return (
    <div id={id} data-terminal-settings-anchor={id ? '' : undefined} className={id ? 'scroll-mt-4' : undefined}>
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium">{label}</label>
        {mode === 'project' && overridden && (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear override</Button>
        )}
      </div>
      {children}
      {mode === 'project' && !overridden && (
        <p className="text-xs text-muted-foreground mt-1">Inheriting hub default</p>
      )}
    </div>
  )
}

function ToggleField({ label, checked, overridden, onClear, onChange, mode }: { label: string; checked: boolean; overridden: boolean; onClear: () => void; onChange: (v: boolean) => void; mode: 'hub' | 'project' }) {
  return (
    <div className="flex justify-between items-center">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        {mode === 'project' && overridden && (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
      </div>
    </div>
  )
}
