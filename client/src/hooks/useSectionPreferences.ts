import { useState, useCallback, useRef } from 'react'

const STORAGE_KEY = 'specrails.dashboard.sectionPrefs'

export type SectionId = 'health' | 'commands' | 'rails' | 'jobs'

export const DEFAULT_ORDER: SectionId[] = ['commands', 'rails', 'jobs', 'health']

export interface SectionPrefs {
  /** Order of sections on the dashboard */
  order: SectionId[]
  /** Sections the user has pinned open (expanded) */
  pinned: Set<SectionId>
}

interface StoredPrefs {
  order: SectionId[]
  pinned: SectionId[]
}

function loadPrefs(): SectionPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { order: DEFAULT_ORDER, pinned: new Set() }
    const parsed = JSON.parse(raw) as StoredPrefs
    const validIds = new Set<string>(DEFAULT_ORDER)
    const order = Array.isArray(parsed.order)
      && parsed.order.length === DEFAULT_ORDER.length
      && parsed.order.every((id: string) => validIds.has(id))
      ? parsed.order
      : DEFAULT_ORDER
    const pinned = new Set<SectionId>(
      Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: string) => validIds.has(id)) : []
    )
    return { order, pinned }
  } catch {
    return { order: DEFAULT_ORDER, pinned: new Set() }
  }
}

function savePrefs(prefs: SectionPrefs): void {
  const stored: StoredPrefs = {
    order: prefs.order,
    pinned: Array.from(prefs.pinned),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function useSectionPreferences() {
  const [prefs, setPrefs] = useState<SectionPrefs>(loadPrefs)

  // Track which sections are currently expanded (transient UI state)
  // Pinned sections start expanded; unpinned start collapsed
  const [expanded, setExpanded] = useState<Set<SectionId>>(() => {
    const initial = loadPrefs()
    return new Set(initial.pinned)
  })

  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const updatePrefs = useCallback((updater: (prev: SectionPrefs) => SectionPrefs) => {
    setPrefs((prev) => {
      const next = updater(prev)
      savePrefs(next)
      prefsRef.current = next
      return next
    })
  }, [])

  const reorder = useCallback((newOrder: SectionId[]) => {
    updatePrefs((prev) => ({ ...prev, order: newOrder }))
  }, [updatePrefs])

  const togglePin = useCallback((id: SectionId) => {
    updatePrefs((prev) => {
      const next = new Set(prev.pinned)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { ...prev, pinned: next }
    })
  }, [updatePrefs])

  const toggleExpanded = useCallback((id: SectionId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isPinned = useCallback((id: SectionId) => prefs.pinned.has(id), [prefs.pinned])
  const isExpanded = useCallback((id: SectionId) => expanded.has(id), [expanded])

  return {
    order: prefs.order,
    reorder,
    togglePin,
    isPinned,
    toggleExpanded,
    isExpanded,
  }
}
