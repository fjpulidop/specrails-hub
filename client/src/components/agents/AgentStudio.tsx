import { useCallback, useEffect, useState } from 'react'
import { Save, Trash2, History, ArrowLeft, AlertCircle } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface AgentVersion {
  version: number
  body: string
  createdAt: number
}

interface Props {
  /** Existing agent id (e.g. `custom-qa`) when editing; omit for create mode. */
  agentId?: string
  /** Optional initial body (used by "Duplicate" / "Generate" to prefill). */
  initialBody?: string
  /** Optional initial name for create mode (used by Generate flow). */
  initialName?: string
  onClose: () => void
  onSaved?: (id: string) => void
}

const BLANK_TEMPLATE = `---
name: custom-<name>
description: "Short description of when to use this agent."
model: sonnet
color: blue
memory: project
---

# Identity

You are ...

# Mission

...

# Workflow protocol

...

# Personality

- **tone**: terse
- **risk_tolerance**: conservative
- **detail_level**: full
- **focus_areas**: ...
`

export function AgentStudio({ agentId, initialBody, initialName, onClose, onSaved }: Props) {
  const isCreate = !agentId
  const [id, setId] = useState(agentId ?? initialName ?? '')
  const [body, setBody] = useState(initialBody ?? BLANK_TEMPLATE)
  const [loading, setLoading] = useState(!isCreate && !initialBody)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [dirty, setDirty] = useState(!!initialBody && isCreate)

  useEffect(() => {
    if (isCreate || initialBody !== undefined) return
    let cancelled = false
    fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId!)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Load failed: ${r.status}`)
        return r.json() as Promise<{ id: string; body: string }>
      })
      .then((data) => {
        if (!cancelled) setBody(data.body)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId, isCreate, initialBody])

  const loadVersions = useCallback(() => {
    if (isCreate) return
    fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId!)}/versions`)
      .then((r) => (r.ok ? (r.json() as Promise<{ versions: AgentVersion[] }>) : { versions: [] }))
      .then((d) => setVersions(d.versions))
      .catch(() => setVersions([]))
  }, [agentId, isCreate])

  useEffect(() => {
    if (showVersions) loadVersions()
  }, [showVersions, loadVersions])

  // Local validation
  const nameValid = /^custom-[a-z0-9][a-z0-9-]*$/.test(id)
  const bodyValid = body.trim().length > 0
  const hasFrontmatter = /^---\s*\n[\s\S]*?\n---/.test(body)
  const canSave = bodyValid && hasFrontmatter && (isCreate ? nameValid : true) && dirty

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (isCreate) {
        res = await fetch(`${getApiBase()}/profiles/catalog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, body }),
        })
      } else {
        res = await fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId!)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Save failed: ${res.status}`)
      }
      setDirty(false)
      if (onSaved) onSaved(isCreate ? id : agentId!)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [agentId, body, id, isCreate, onSaved])

  const remove = useCallback(async () => {
    if (isCreate) return
    if (!confirm(`Delete agent "${agentId}"? This cannot be undone (but version history survives in the DB).`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId!)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Delete failed: ${res.status}`)
      }
      if (onSaved) onSaved(agentId!)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [agentId, isCreate, onClose, onSaved])

  const restore = useCallback((v: AgentVersion) => {
    setBody(v.body)
    setDirty(true)
    setShowVersions(false)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading agent…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {isCreate ? 'New custom agent' : 'Edit custom agent'}
          </div>
          {isCreate ? (
            <Input
              value={id}
              onChange={(e) => {
                setId(e.target.value)
                setDirty(true)
              }}
              placeholder="custom-my-agent"
              className="text-sm font-mono mt-1 max-w-sm"
            />
          ) : (
            <div className="text-sm font-mono">{agentId}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isCreate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowVersions((v) => !v)}
              title="Version history"
            >
              <History className="w-3.5 h-3.5 mr-1" />
              History
            </Button>
          )}
          {!isCreate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={remove}
              disabled={saving}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!canSave || saving}>
            <Save className="w-3.5 h-3.5 mr-1" />
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Error strip */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs border-b border-red-500/30 bg-red-500/10 text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Validation hints */}
      {isCreate && id.length > 0 && !nameValid && (
        <div className="px-4 py-1.5 text-[11px] border-b border-yellow-500/30 bg-yellow-500/10 text-yellow-500">
          Name must start with <code>custom-</code> and contain only lowercase letters, digits, and hyphens.
        </div>
      )}
      {!hasFrontmatter && (
        <div className="px-4 py-1.5 text-[11px] border-b border-yellow-500/30 bg-yellow-500/10 text-yellow-500">
          Missing YAML frontmatter (needs opening <code>---</code> on the first line).
        </div>
      )}

      {/* Body + versions */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-1.5 border-b border-border text-[11px] font-mono text-muted-foreground flex items-center justify-between">
            <span>.claude/agents/{isCreate ? id || 'custom-…' : agentId}.md</span>
            {dirty && <span className="text-yellow-500">● unsaved</span>}
          </div>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setDirty(true)
            }}
            spellCheck={false}
            className="flex-1 w-full p-4 text-xs font-mono bg-background text-foreground outline-none resize-none leading-relaxed"
          />
        </div>

        {showVersions && !isCreate && (
          <aside className="w-72 flex-shrink-0 border-l border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Version history
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {versions.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic px-2 py-2">
                  No prior versions recorded for this agent.
                </div>
              ) : (
                versions.map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    onClick={() => restore(v)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-accent/50 transition-colors"
                  >
                    <div className="text-xs font-mono text-foreground">v{v.version}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
              Click a version to restore its body into the editor (you still need to Save).
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
