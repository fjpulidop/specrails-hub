// Global Ask-the-Hub provider: registers Cmd+K listener, owns modal open/close
// state and per-project query history.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHub } from '../../hooks/useHub'

interface AskHubContextValue {
  open: boolean
  enabled: boolean
  openModal: () => void
  closeModal: () => void
  toggleModal: () => void
  recent: string[]
  pushRecent: (q: string) => void
  clearRecent: () => void
}

const AskHubContext = createContext<AskHubContextValue | null>(null)

const HISTORY_KEY = (projectId: string | null) => `specrails-hub:ask-history:${projectId ?? '_'}`
const MAX_HISTORY = 20

function readHistory(projectId: string | null): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY(projectId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_HISTORY)
    return []
  } catch {
    return []
  }
}

function writeHistory(projectId: string | null, items: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY(projectId), JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch {
    // quota — silent
  }
}

export function AskHubProvider({ children }: { children: ReactNode }) {
  const { activeProjectId, projects } = useHub()
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const activeRef = useRef(activeProjectId)
  const hasProjects = projects.length > 0 && activeProjectId !== null

  useEffect(() => {
    activeRef.current = activeProjectId
    setRecent(readHistory(activeProjectId))
  }, [activeProjectId])

  const openModal = useCallback(() => { if (hasProjects) setOpen(true) }, [hasProjects])
  const closeModal = useCallback(() => setOpen(false), [])
  const toggleModal = useCallback(() => { setOpen((v) => v ? false : hasProjects) }, [hasProjects])

  const pushRecent = useCallback((q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_HISTORY)
      writeHistory(activeRef.current, next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecent([])
    writeHistory(activeRef.current, [])
  }, [])

  // Global hotkey: Cmd+Shift+K / Ctrl+Shift+K. Cmd+K alone is already taken
  // by the CommandPalette (slash-commands), so Ask the Hub uses the shifted
  // variant. Suppressed when any [role="dialog"] is open and when no project
  // is registered/active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta || !e.shiftKey) return
      if (e.key !== 'k' && e.key !== 'K') return
      const dialogOpen = document.querySelector('[role="dialog"]') !== null
      if (dialogOpen && !open) return
      if (!hasProjects && !open) return  // no project → hotkey is a no-op
      e.preventDefault()
      e.stopPropagation()
      setOpen((v) => v ? false : hasProjects)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hasProjects])

  const value = useMemo<AskHubContextValue>(
    () => ({ open, enabled: hasProjects, openModal, closeModal, toggleModal, recent, pushRecent, clearRecent }),
    [open, hasProjects, openModal, closeModal, toggleModal, recent, pushRecent, clearRecent],
  )

  return <AskHubContext.Provider value={value}>{children}</AskHubContext.Provider>
}

export function useAskHub(): AskHubContextValue {
  const v = useContext(AskHubContext)
  if (!v) throw new Error('useAskHub must be used within AskHubProvider')
  return v
}

/** Soft variant for UI bits (AskPill, TitleBar) that may render outside the
 *  provider tree (snapshot tests, isolated stories). Returns `null` when the
 *  provider isn't mounted — caller is expected to no-op gracefully. */
export function useAskHubOptional(): AskHubContextValue | null {
  return useContext(AskHubContext)
}
