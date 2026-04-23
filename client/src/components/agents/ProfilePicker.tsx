import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import type { ProfileListEntry, UserPreferred } from './types'

export type ProfileSelection =
  | { kind: 'profile'; name: string }
  | { kind: 'legacy' }

interface Props {
  value: ProfileSelection
  onChange: (selection: ProfileSelection) => void
  compact?: boolean
}

/**
 * Launch-time profile picker. Shows available profiles + a "legacy (no profile)"
 * option. Preselects the caller-provided value (which the caller should seed
 * from the project's preferred/default via `useDefaultProfileSelection`).
 */
export function ProfilePicker({ value, onChange, compact = false }: Props) {
  const [profiles, setProfiles] = useState<ProfileListEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${getApiBase()}/profiles`)
      .then((r) => (r.ok ? (r.json() as Promise<{ profiles: ProfileListEntry[] }>) : { profiles: [] }))
      .then((data) => {
        if (!cancelled) setProfiles(data.profiles)
      })
      .catch(() => {
        if (!cancelled) setProfiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  if (profiles.length === 0) return null // no profiles yet — rail uses legacy by default

  const currentValue = value.kind === 'legacy' ? '__legacy__' : value.name

  return (
    <label className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2 text-xs'}>
      <Bot className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      {!compact && <span className="text-muted-foreground">Profile</span>}
      <select
        value={currentValue}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '__legacy__' ? { kind: 'legacy' } : { kind: 'profile', name: v })
        }}
        className="h-7 px-2 text-xs rounded border border-border bg-background"
      >
        {profiles.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
            {p.isDefault ? ' (default)' : ''}
          </option>
        ))}
        <option value="__legacy__">Legacy (no profile)</option>
      </select>
    </label>
  )
}

/**
 * Resolve the picker's initial value: use the project's preferred profile,
 * else fall back to `default` if present in the list.
 */
export function useDefaultProfileSelection(): [ProfileSelection, (s: ProfileSelection) => void] {
  const [selection, setSelection] = useState<ProfileSelection>({ kind: 'legacy' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`${getApiBase()}/profiles`).then((r) => (r.ok ? (r.json() as Promise<{ profiles: ProfileListEntry[] }>) : { profiles: [] })),
      fetch(`${getApiBase()}/profiles/active`).then((r) => (r.ok ? (r.json() as Promise<{ preferred: UserPreferred | null }>) : { preferred: null })),
    ])
      .then(([profilesData, activeData]) => {
        if (cancelled) return
        const { profiles } = profilesData
        if (profiles.length === 0) {
          setSelection({ kind: 'legacy' })
          return
        }
        const preferredName = activeData.preferred?.profile
        if (preferredName && profiles.some((p) => p.name === preferredName)) {
          setSelection({ kind: 'profile', name: preferredName })
          return
        }
        const defaultP = profiles.find((p) => p.isDefault) ?? profiles[0]
        setSelection({ kind: 'profile', name: defaultP.name })
      })
      .catch(() => {
        if (!cancelled) setSelection({ kind: 'legacy' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return [selection, setSelection]
}

export function selectionToSpawnPayload(s: ProfileSelection): { profileName: string | null } {
  return s.kind === 'legacy' ? { profileName: null } : { profileName: s.name }
}

/** Hook: fetch the project's profile list once. Returns [] while loading or on error. */
export function useProjectProfiles(): ProfileListEntry[] {
  const [profiles, setProfiles] = useState<ProfileListEntry[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`${getApiBase()}/profiles`)
      .then((r) => (r.ok ? (r.json() as Promise<{ profiles: ProfileListEntry[] }>) : { profiles: [] }))
      .then((data) => { if (!cancelled) setProfiles(data.profiles) })
      .catch(() => { if (!cancelled) setProfiles([]) })
    return () => { cancelled = true }
  }, [])
  return profiles
}
