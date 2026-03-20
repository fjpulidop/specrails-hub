import { useReducer, useEffect, useRef, useCallback } from 'react'
import { useSharedWebSocket } from './useSharedWebSocket'
import { getApiBase } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpecLauncherStatus = 'idle' | 'launching' | 'done' | 'error'

export interface SpecLauncherState {
  status: SpecLauncherStatus
  launchId: string | null
  streamText: string
  changeId: string | null
  error: string | null
}

type Action =
  | { type: 'START'; launchId: string }
  | { type: 'APPEND'; delta: string }
  | { type: 'DONE'; changeId: string | null }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: SpecLauncherState = {
  status: 'idle',
  launchId: null,
  streamText: '',
  changeId: null,
  error: null,
}

function reducer(state: SpecLauncherState, action: Action): SpecLauncherState {
  switch (action.type) {
    case 'START':
      return { status: 'launching', launchId: action.launchId, streamText: '', changeId: null, error: null }
    case 'APPEND':
      return { ...state, streamText: state.streamText + action.delta }
    case 'DONE':
      return { ...state, status: 'done', changeId: action.changeId }
    case 'ERROR':
      return { ...state, status: 'error', error: action.error }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpecLauncher(activeProjectId: string | null): {
  state: SpecLauncherState
  launch: (description: string) => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
} {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // Ref tracks current launchId so the WS closure always sees the latest value
  const launchIdRef = useRef<string | null>(null)
  launchIdRef.current = state.launchId

  // Reset state when switching projects
  const prevProjectId = useRef(activeProjectId)
  useEffect(() => {
    if (activeProjectId !== prevProjectId.current) {
      prevProjectId.current = activeProjectId
      launchIdRef.current = null
      dispatch({ type: 'RESET' })
    }
  }, [activeProjectId])

  // Subscribe to WebSocket messages for this launch
  useEffect(() => {
    const handlerId = 'spec-launcher-hook'

    registerHandler(handlerId, (raw) => {
      const msg = raw as Record<string, unknown>
      if (typeof msg.type !== 'string') return
      if (msg.launchId !== launchIdRef.current) return

      switch (msg.type) {
        case 'spec_launcher_stream': {
          const delta = msg.delta as string
          // Skip tool annotations in stream display
          if (delta.startsWith('<!--tool:')) return
          dispatch({ type: 'APPEND', delta })
          break
        }
        case 'spec_launcher_done':
          dispatch({ type: 'DONE', changeId: (msg.changeId as string | null) ?? null })
          break
        case 'spec_launcher_error': {
          const error = msg.error as string
          dispatch({ type: 'ERROR', error })
          break
        }
      }
    })

    return () => unregisterHandler(handlerId)
  }, [registerHandler, unregisterHandler])

  const launch = useCallback(async (description: string): Promise<void> => {
    try {
      const res = await fetch(`${getApiBase()}/spec-launcher/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        dispatch({ type: 'ERROR', error: data.error ?? `Server error (${res.status})` })
        return
      }
      const data = await res.json() as { launchId: string }
      // Set launchId immediately so WS messages arriving before re-render are filtered correctly
      launchIdRef.current = data.launchId
      dispatch({ type: 'START', launchId: data.launchId })
    } catch (err) {
      dispatch({ type: 'ERROR', error: `Connection failed: ${(err as Error).message}` })
    }
  }, [])

  const cancel = useCallback(async (): Promise<void> => {
    const currentLaunchId = launchIdRef.current
    if (!currentLaunchId) return
    dispatch({ type: 'RESET' })
    try {
      await fetch(`${getApiBase()}/spec-launcher/${currentLaunchId}`, { method: 'DELETE' })
    } catch { /* best-effort */ }
  }, [])

  const reset = useCallback((): void => {
    launchIdRef.current = null
    dispatch({ type: 'RESET' })
  }, [])

  return { state, launch, cancel, reset }
}
