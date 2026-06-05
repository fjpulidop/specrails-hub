import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type SidebarMode = 'pinned-open' | 'pinned-collapsed' | 'unpinned'

const VALID_MODES: readonly SidebarMode[] = ['pinned-open', 'pinned-collapsed', 'unpinned']
const STORAGE_KEY_LEFT = 'specrails-hub:sidebar-mode:left'
const STORAGE_KEY_RIGHT = 'specrails-hub:sidebar-mode:right'

function isSidebarMode(value: unknown): value is SidebarMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value)
}

function readMode(key: string): SidebarMode {
  try {
    const raw = window.localStorage.getItem(key)
    if (isSidebarMode(raw)) return raw
  } catch {
    // localStorage unavailable (private mode, SSR, etc.) — fall through
  }
  return 'unpinned'
}

function writeMode(key: string, mode: SidebarMode): void {
  try {
    window.localStorage.setItem(key, mode)
  } catch {
    // best-effort: ignore quota / private-mode failures
  }
}

function nextMode(mode: SidebarMode): SidebarMode {
  switch (mode) {
    case 'pinned-open':
      return 'pinned-collapsed'
    case 'pinned-collapsed':
      return 'unpinned'
    case 'unpinned':
      return 'pinned-open'
  }
}

interface SidebarPinContextValue {
  leftMode: SidebarMode
  rightMode: SidebarMode
  setLeftMode: (mode: SidebarMode) => void
  setRightMode: (mode: SidebarMode) => void
  cycleLeftMode: () => void
  cycleRightMode: () => void
}

const SidebarPinContext = createContext<SidebarPinContextValue>({
  leftMode: 'unpinned',
  rightMode: 'unpinned',
  setLeftMode: () => {},
  setRightMode: () => {},
  cycleLeftMode: () => {},
  cycleRightMode: () => {},
})

export function SidebarPinProvider({ children }: { children: ReactNode }) {
  const [leftMode, setLeftModeState] = useState<SidebarMode>(() => readMode(STORAGE_KEY_LEFT))
  const [rightMode, setRightModeState] = useState<SidebarMode>(() => readMode(STORAGE_KEY_RIGHT))

  useEffect(() => {
    writeMode(STORAGE_KEY_LEFT, leftMode)
  }, [leftMode])

  useEffect(() => {
    writeMode(STORAGE_KEY_RIGHT, rightMode)
  }, [rightMode])

  const setLeftMode = useCallback((mode: SidebarMode) => setLeftModeState(mode), [])
  const setRightMode = useCallback((mode: SidebarMode) => setRightModeState(mode), [])
  const cycleLeftMode = useCallback(() => setLeftModeState((m) => nextMode(m)), [])
  const cycleRightMode = useCallback(() => setRightModeState((m) => nextMode(m)), [])

  // Memoise so consumers don't re-render unless leftMode/rightMode actually change
  // (the setters are stable). An inline object would re-render every consumer on
  // every parent render.
  const value = useMemo(
    () => ({ leftMode, rightMode, setLeftMode, setRightMode, cycleLeftMode, cycleRightMode }),
    [leftMode, rightMode, setLeftMode, setRightMode, cycleLeftMode, cycleRightMode],
  )

  return (
    <SidebarPinContext.Provider value={value}>
      {children}
    </SidebarPinContext.Provider>
  )
}

export function useSidebarPin() {
  return useContext(SidebarPinContext)
}
