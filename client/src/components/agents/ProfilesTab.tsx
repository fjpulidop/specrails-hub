import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Save, Star } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import { Button } from '../ui/button'
import { ProfileEditor } from './ProfileEditor'
import type { Profile, ProfileListEntry, UserPreferred } from './types'

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<ProfileListEntry[]>([])
  const [preferred, setPreferred] = useState<UserPreferred | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  const createNew = useCallback(async () => {
    const name = prompt('New profile name (lowercase, kebab-case):')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
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
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const duplicate = useCallback(
    async (name: string) => {
      const newName = prompt(`Duplicate "${name}" as:`, `${name}-copy`)
      if (!newName) return
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(
          `${getApiBase()}/profiles/${encodeURIComponent(name)}/duplicate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
          },
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Duplicate failed: ${res.status}`)
        }
        await refresh()
        setSelected(newName.trim())
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

  const remove = useCallback(
    async (name: string) => {
      if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) return
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
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

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
    } catch (e) {
      setError((e as Error).message)
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
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSaving(false)
      }
    },
    [],
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
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <div className="text-sm font-medium text-foreground">No profiles yet</div>
          <div className="text-xs text-muted-foreground mt-1 mb-4">
            Profiles let you save orchestrator + agent + routing combinations and pick one per rail.
          </div>
          <Button size="sm" onClick={createNew} disabled={saving}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create first profile
          </Button>
          {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
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
            footer={
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void save(editing)} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save
                </Button>
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
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
  )
}
