import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Save, Star, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiBase } from '../../lib/api'
import { Button } from '../ui/button'
import { ProfileEditor } from './ProfileEditor'
import { ProfileAnalyticsCard } from './ProfileAnalyticsCard'
import { ConfirmDialog, PromptDialog } from './PromptDialog'
import type { Profile, ProfileListEntry, UserPreferred } from './types'

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<ProfileListEntry[]>([])
  const [preferred, setPreferred] = useState<UserPreferred | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [validationIssues, setValidationIssues] = useState<string[]>([])
  const [createDialog, setCreateDialog] = useState(false)
  const [duplicateDialog, setDuplicateDialog] = useState<{ from: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ name: string } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profilesRes, activeRes] = await Promise.all([
        fetch(`${getApiBase()}/profiles`),
        fetch(`${getApiBase()}/profiles/active`),
      ])
      if (!profilesRes.ok) throw new Error(`List failed: ${profilesRes.status}`)
      const profilesData = (await profilesRes.json()) as { profiles: ProfileListEntry[] }
      setProfiles(profilesData.profiles)
      if (activeRes.ok) {
        const activeData = (await activeRes.json()) as { preferred: UserPreferred | null }
        setPreferred(activeData.preferred)
      }
      if (profilesData.profiles.length > 0 && !selected) {
        setSelected(profilesData.profiles[0].name)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selected) {
      setEditing(null)
      return
    }
    let cancelled = false
    fetch(`${getApiBase()}/profiles/${encodeURIComponent(selected)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Load failed: ${r.status}`)
        return r.json() as Promise<{ profile: Profile }>
      })
      .then((data) => {
        if (!cancelled) setEditing(data.profile)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const migrateFromSettings = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/profiles/migrate-from-settings`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Migration failed: ${res.status}`)
      }
      await refresh()
      setSelected('default')
      toast.success('Profile migrated', {
        description: 'default profile created from your current agents',
      })
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      toast.error('Migration failed', { description: message })
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const doCreate = useCallback(
    async (trimmed: string) => {
      setCreateDialog(false)
      setSaving(true)
      setError(null)
      try {
        const body: Profile = {
          schemaVersion: 1,
          name: trimmed,
          description: '',
          orchestrator: { model: 'sonnet' },
          agents: [
            { id: 'sr-architect', model: 'sonnet', required: true },
            { id: 'sr-developer', model: 'sonnet', required: true },
            { id: 'sr-reviewer', model: 'sonnet', required: true },
            { id: 'sr-merge-resolver', model: 'sonnet', required: true },
          ],
          routing: [{ default: true, agent: 'sr-developer' }],
        }
        const res = await fetch(`${getApiBase()}/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Create failed: ${res.status}`)
        }
        await refresh()
        setSelected(trimmed)
        toast.success('Profile created', { description: trimmed })
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        toast.error('Failed to create profile', { description: message })
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

  const doDuplicate = useCallback(
    async (from: string, newName: string) => {
      setDuplicateDialog(null)
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(
          `${getApiBase()}/profiles/${encodeURIComponent(from)}/duplicate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
          },
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Duplicate failed: ${res.status}`)
        }
        await refresh()
        setSelected(newName)
        toast.success('Profile duplicated', { description: `${from} → ${newName}` })
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        toast.error('Failed to duplicate profile', { description: message })
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

  const doRemove = useCallback(
    async (name: string) => {
      setDeleteDialog(null)
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`${getApiBase()}/profiles/${encodeURIComponent(name)}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Delete failed: ${res.status}`)
        }
        setSelected((prev) => (prev === name ? null : prev))
        await refresh()
        toast.success('Profile deleted', { description: name })
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        toast.error('Failed to delete profile', { description: message })
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

  const createNew = useCallback(() => setCreateDialog(true), [])
  const duplicate = useCallback((name: string) => setDuplicateDialog({ from: name }), [])
  const remove = useCallback((name: string) => setDeleteDialog({ name }), [])

  const save = useCallback(async (profile: Profile) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/profiles/${encodeURIComponent(profile.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Save failed: ${res.status}`)
      }
      setEditing(profile)
      toast.success('Profile saved', { description: profile.name })
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      toast.error('Failed to save profile', { description: message })
    } finally {
      setSaving(false)
    }
  }, [])

  const markPreferred = useCallback(
    async (name: string) => {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`${getApiBase()}/profiles/active`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: name }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Set preferred failed: ${res.status}`)
        }
        setPreferred({ profile: name })
        toast.success('Preferred profile set', { description: name })
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        toast.error('Failed to set preferred profile', { description: message })
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const dialogs = (
    <>
      <PromptDialog
        open={createDialog}
        title="New profile"
        description="Pick a lowercase kebab-case name (letters, digits, and hyphens)."
        placeholder="my-profile"
        confirmLabel="Create"
        inputPattern={/^[a-z0-9][a-z0-9-]*$/}
        inputInvalidHint="Must start with a letter or digit and contain only lowercase letters, digits, and hyphens."
        onConfirm={(v) => void doCreate(v)}
        onCancel={() => setCreateDialog(false)}
      />
      {duplicateDialog && (
        <PromptDialog
          open={true}
          title={`Duplicate "${duplicateDialog.from}"`}
          description="Name for the new profile."
          placeholder={`${duplicateDialog.from}-copy`}
          initialValue={`${duplicateDialog.from}-copy`}
          confirmLabel="Duplicate"
          inputPattern={/^[a-z0-9][a-z0-9-]*$/}
          inputInvalidHint="Lowercase kebab-case only."
          onConfirm={(v) => void doDuplicate(duplicateDialog.from, v)}
          onCancel={() => setDuplicateDialog(null)}
        />
      )}
      {deleteDialog && (
        <ConfirmDialog
          open={true}
          title={`Delete profile "${deleteDialog.name}"?`}
          description="This cannot be undone. Jobs already launched with this profile keep their snapshot; future launches will fall back to the resolution order."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void doRemove(deleteDialog.name)}
          onCancel={() => setDeleteDialog(null)}
        />
      )}
    </>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading profiles…</p>
      </div>
    )
  }

  if (profiles.length === 0) {
    return (
      <>
      {dialogs}
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-sm font-medium text-foreground">No profiles yet</div>
          <div className="text-xs text-muted-foreground mt-1 mb-4">
            Profiles let you save orchestrator + agent + routing combinations and pick one per rail.
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Button size="sm" onClick={migrateFromSettings} disabled={saving}>
              <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Migrate from current agents
            </Button>
            <Button size="sm" variant="ghost" onClick={createNew} disabled={saving}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Blank profile
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground/70 mt-3">
            "Migrate" reads your existing <code className="text-foreground">.claude/agents/</code>{' '}
            frontmatter models and creates a <code className="text-foreground">default</code> profile
            mirroring today's behavior — zero-loss.
          </div>
          {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
        </div>
      </div>
      </>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {dialogs}
      <ProfileAnalyticsCard />
      <div className="flex flex-1 min-h-0">
      {/* Left: profile list */}
      <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-3 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Profiles
          </div>
          <Button size="sm" variant="ghost" onClick={createNew} disabled={saving}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {profiles.map((p) => {
            const isSelected = p.name === selected
            const isPreferred = preferred?.profile === p.name
            return (
              <div
                key={p.name}
                className={
                  'group mb-1 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors flex items-center justify-between ' +
                  (isSelected
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')
                }
                onClick={() => setSelected(p.name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(p.name)
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.isDefault && (
                    <span className="text-[10px] text-muted-foreground">(default)</span>
                  )}
                  {isPreferred && (
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 hover:bg-accent rounded"
                    title="Set as my preferred"
                    onClick={(e) => {
                      e.stopPropagation()
                      void markPreferred(p.name)
                    }}
                  >
                    <Star className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-accent rounded"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation()
                      void duplicate(p.name)
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {!p.isDefault && (
                    <button
                      type="button"
                      className="p-1 hover:bg-red-500/20 text-red-400 rounded"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        void remove(p.name)
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Right: editor */}
      <main className="flex-1 overflow-auto">
        {error && (
          <div className="mx-4 mt-4 px-3 py-2 text-xs rounded border border-red-500/30 bg-red-500/10 text-red-400">
            {error}
          </div>
        )}
        {editing ? (
          <ProfileEditor
            key={editing.name}
            profile={editing}
            onChange={setEditing}
            onValidityChange={setValidationIssues}
            footer={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void save(editing)}
                  disabled={saving || validationIssues.length > 0}
                  title={validationIssues.length > 0 ? 'Fix validation issues before saving' : undefined}
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save
                </Button>
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
                {validationIssues.length > 0 && (
                  <span className="text-xs text-yellow-500">
                    {validationIssues.length} {validationIssues.length === 1 ? 'issue' : 'issues'} to resolve
                  </span>
                )}
              </div>
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Select a profile to edit</p>
          </div>
        )}
      </main>
      </div>
    </div>
  )
}
