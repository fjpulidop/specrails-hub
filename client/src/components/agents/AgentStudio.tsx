import { useCallback, useEffect, useState } from 'react'
import { Save, Trash2, History, ArrowLeft, AlertCircle, FlaskConical, Loader2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiBase } from '../../lib/api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ConfirmDialog } from './PromptDialog'

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
  /**
   * When set in edit mode, hydrate the editor from the matching AI Refine
   * session's draft body instead of the on-disk file. Renders a "Resume AI
   * Edit" pill in the header so the user can hand the draft back to the
   * overlay.
   */
  draftFromRefine?: string
  onClose: () => void
  onSaved?: (id: string) => void
  /**
   * Called when the user clicks the "Resume AI Edit" pill. Receives
   * (refineId, agentId, baseBody) so the parent can re-open the overlay.
   */
  onResumeRefine?: (refineId: string, agentId: string, baseBody: string) => void
}

// Template catalog lives in agentTemplates.ts (45+ entries across 13
// categories). Re-exported here for backward compatibility with callers
// that import AGENT_TEMPLATES from AgentStudio.
export { AGENT_TEMPLATES, type AgentTemplate } from './agentTemplates'

const SAMPLE_TASKS: Array<{ label: string; prompt: string }> = [
  {
    label: '— pick a sample task —',
    prompt: '',
  },
  {
    label: 'Terraform: public S3 bucket',
    prompt: 'Review this Terraform diff:\n+ resource "aws_s3_bucket" "logs" {\n+   bucket = "app-logs"\n+   acl    = "public-read"\n+ }',
  },
  {
    label: 'Code review: SQL injection',
    prompt: 'Review this Node.js snippet for security issues:\n\n```js\napp.get("/user/:id", async (req, res) => {\n  const row = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)\n  res.json(row)\n})\n```',
  },
  {
    label: 'Frontend: accessibility',
    prompt: 'Review this React component for accessibility issues:\n\n```tsx\nfunction ProductCard({ product, onAddToCart }) {\n  return (\n    <div onClick={onAddToCart} className="card">\n      <img src={product.image} />\n      <h3>{product.name}</h3>\n      <div className="price">${product.price}</div>\n    </div>\n  )\n}\n```',
  },
  {
    label: 'Data: schema change',
    prompt: 'Evaluate this migration plan:\n- Add NOT NULL column `email_verified_at` (timestamp) to a 50M-row `users` table\n- Backfill with `NOW()` for existing rows\n- Deploy without downtime\n\nIs this safe? What would you change?',
  },
  {
    label: 'Performance: slow query',
    prompt: 'Explain why this Postgres query is slow on a 10M-row `orders` table and propose an index:\n\n```sql\nSELECT * FROM orders\nWHERE customer_id = $1\n  AND status IN (\'pending\', \'paid\')\n  AND created_at > NOW() - INTERVAL \'30 days\'\nORDER BY created_at DESC\nLIMIT 50;\n```',
  },
]

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

export function AgentStudio({
  agentId,
  initialBody,
  initialName,
  draftFromRefine,
  onClose,
  onSaved,
  onResumeRefine,
}: Props) {
  const isCreate = !agentId
  const [id, setId] = useState(agentId ?? initialName ?? '')
  const [body, setBody] = useState(initialBody ?? BLANK_TEMPLATE)
  const [loading, setLoading] = useState(!isCreate && !initialBody && !draftFromRefine)
  const [refineDraftLoading, setRefineDraftLoading] = useState(!!draftFromRefine && !isCreate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [dirty, setDirty] = useState(!!initialBody && isCreate)
  const [testPaneOpen, setTestPaneOpen] = useState(false)
  const [sampleTask, setSampleTask] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { output: string; tokens: number; durationMs: number } | null
  >(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (isCreate || initialBody !== undefined) return
    // Refine handoff path: load draft body from the in-flight session.
    if (draftFromRefine) {
      let cancelled = false
      fetch(`${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId!)}/refine/${draftFromRefine}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Load draft failed: ${r.status}`)
          return r.json() as Promise<{ draftBody: string | null }>
        })
        .then((data) => {
          if (!cancelled && data.draftBody) {
            setBody(data.draftBody)
            setDirty(true)
          }
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message)
        })
        .finally(() => {
          if (!cancelled) setRefineDraftLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
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
  }, [agentId, isCreate, initialBody, draftFromRefine])

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
      toast.success(isCreate ? 'Agent created' : 'Agent saved', {
        description: isCreate ? id : agentId,
      })
      if (onSaved) onSaved(isCreate ? id : agentId!)
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      toast.error(isCreate ? 'Failed to create agent' : 'Failed to save agent', {
        description: message,
      })
    } finally {
      setSaving(false)
    }
  }, [agentId, body, id, isCreate, onSaved])

  const remove = useCallback(async () => {
    if (isCreate) return
    setConfirmDelete(false)
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
      toast.success('Agent deleted', { description: agentId })
      if (onSaved) onSaved(agentId!)
      onClose()
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      toast.error('Failed to delete agent', { description: message })
    } finally {
      setSaving(false)
    }
  }, [agentId, isCreate, onClose, onSaved])

  const restore = useCallback((v: AgentVersion) => {
    setBody(v.body)
    setDirty(true)
    setShowVersions(false)
  }, [])

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const res = await fetch(`${getApiBase()}/profiles/catalog/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: isCreate ? id || 'draft' : agentId,
          draftBody: body,
          sampleTask,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Test failed: ${res.status}`)
      }
      const data = (await res.json()) as { output: string; tokens: number; durationMs: number }
      setTestResult(data)
    } catch (e) {
      setTestError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }, [agentId, body, id, isCreate, sampleTask])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading agent…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {!isCreate && (
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete agent "${agentId}"?`}
          description="This removes the .md from disk. Version history stays in the DB — use a fresh custom agent if you want to recover the body later."
          confirmLabel="Delete"
          destructive
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
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
            <div className="flex items-center gap-2">
              <div className="text-sm font-mono">{agentId}</div>
              {draftFromRefine && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!onResumeRefine || !agentId) return
                    try {
                      const r = await fetch(
                        `${getApiBase()}/profiles/catalog/${encodeURIComponent(agentId)}`,
                      )
                      if (!r.ok) return
                      const data = (await r.json()) as { body: string }
                      onResumeRefine(draftFromRefine, agentId, data.body)
                    } catch { /* ignore */ }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-dracula-purple/40 bg-dracula-purple/15 text-dracula-purple hover:bg-dracula-purple/25 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  title="Hand this draft back to the AI Edit overlay"
                >
                  <Wand2 className="w-3 h-3" /> Resume AI Edit
                </button>
              )}
              {refineDraftLoading && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> loading AI draft…
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTestPaneOpen((v) => !v)
              if (!testPaneOpen) setShowVersions(false)
            }}
            title="Test this agent against a sample task"
          >
            <FlaskConical className="w-3.5 h-3.5 mr-1" />
            Test
          </Button>
          {!isCreate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowVersions((v) => !v)
                if (!showVersions) setTestPaneOpen(false)
              }}
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
              onClick={() => setConfirmDelete(true)}
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

        {testPaneOpen && (
          <aside className="w-96 flex-shrink-0 border-l border-border flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5" /> Test agent
            </div>
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">Sample task</label>
                <select
                  className="h-6 text-[11px] rounded border border-border bg-background px-1"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value, 10)
                    if (!isNaN(idx) && idx > 0) setSampleTask(SAMPLE_TASKS[idx].prompt)
                  }}
                  disabled={testing}
                >
                  {SAMPLE_TASKS.map((s, i) => (
                    <option key={i} value={i}>{s.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={sampleTask}
                onChange={(e) => setSampleTask(e.target.value)}
                placeholder={'Describe what the agent should do, or pick a sample above.'}
                className="w-full text-xs p-2 rounded border border-border bg-background min-h-[80px] resize-y font-mono"
                disabled={testing}
              />
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={runTest}
                  disabled={testing || !sampleTask.trim() || !body.trim()}
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running…
                    </>
                  ) : (
                    <>
                      <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Run
                    </>
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Sandboxed; no files written.
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 min-h-0">
              {testError && (
                <div className="px-3 py-2 text-xs rounded border border-red-500/30 bg-red-500/10 text-red-400 mb-2">
                  {testError}
                </div>
              )}
              {testResult && (
                <>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
                    <span>
                      <span className="text-foreground font-mono">{testResult.tokens}</span> tokens
                    </span>
                    <span>
                      <span className="text-foreground font-mono">
                        {(testResult.durationMs / 1000).toFixed(1)}s
                      </span>
                    </span>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed rounded border border-border bg-background p-3">
                    {testResult.output}
                  </pre>
                </>
              )}
              {!testing && !testResult && !testError && (
                <p className="text-[11px] text-muted-foreground italic">
                  Run a sample task against the current draft. Output appears here.
                </p>
              )}
            </div>
          </aside>
        )}
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
