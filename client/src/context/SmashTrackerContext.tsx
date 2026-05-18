/**
 * SPECs SMASH WS tracker.
 *
 * Listens for `smash.started|progress|completed|failed|undone` events and:
 *   - Exposes per-ticket "inflight" state for the modal pills via
 *     `useSmashInflight(ticketId)`.
 *   - Surfaces success toast with `Deshacer` action + failure toast with
 *     `Reintentar` action.
 *
 * Mounted at App root, sibling of `ContractRefineTrackerProvider`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { API_ORIGIN } from '../lib/origin'

export type SmashStage = 'analyzing' | 'identifying' | 'ordering'

const STAGE_LABEL: Record<SmashStage, string> = {
  analyzing: 'Analyzing spec…',
  identifying: 'Identifying subtasks…',
  ordering: 'Ordering execution…',
}

export interface SmashInflight {
  ticketId: number
  runId: string
  stage: SmashStage
  startedAt: string
  ticketTitle?: string
}

interface SmashTrackerContextValue {
  inflight: Record<number, SmashInflight>
}

const SmashTrackerContext = createContext<SmashTrackerContextValue | null>(null)

function toastIdFor(ticketId: number | string): string {
  return `smash:${ticketId}`
}

async function fireRetry(projectId: string, ticketId: number): Promise<void> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/tickets/${ticketId}/smash`, {
      method: 'POST',
    })
    if (res.ok) {
      toast.loading('Retrying SMASH…', { id: toastIdFor(ticketId) })
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string; reason?: string }
      toast.error(`Could not retry${body.reason ? `: ${body.reason}` : ''}`, { id: toastIdFor(ticketId) })
    }
  } catch (err) {
    toast.error(`Retry failed: ${(err as Error).message}`, { id: toastIdFor(ticketId) })
  }
}

async function fireUndo(
  projectId: string,
  ticketId: number,
  smashedAt: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/tickets/${ticketId}/smash/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smashedAt }),
    })
    if (res.ok) {
      toast.success('SMASH undone', { id: toastIdFor(ticketId), duration: 3000 })
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string; reason?: string }
      toast.error(`Undo failed${body.reason ? `: ${body.reason}` : ''}`, { id: toastIdFor(ticketId) })
    }
  } catch (err) {
    toast.error(`Undo failed: ${(err as Error).message}`, { id: toastIdFor(ticketId) })
  }
}

export function SmashTrackerProvider({ children }: { children: ReactNode }) {
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const [inflight, setInflight] = useState<Record<number, SmashInflight>>({})
  const projectByTicketRef = useRef<Map<number, string>>(new Map())
  const smashedAtByRunRef = useRef<Map<string, string>>(new Map())

  const handleStarted = useCallback((raw: unknown) => {
    const m = raw as Record<string, unknown>
    if (!m || m.type !== 'smash.started') return
    const ticketId = m.ticketId as number | undefined
    const runId = m.runId as string | undefined
    const projectId = m.projectId as string | undefined
    const ts = m.timestamp as string | undefined
    const ticketTitle = m.ticketTitle as string | undefined
    if (typeof ticketId !== 'number' || !runId || !projectId) return
    projectByTicketRef.current.set(ticketId, projectId)
    setInflight((s) => ({
      ...s,
      [ticketId]: { ticketId, runId, stage: 'analyzing', startedAt: ts ?? new Date().toISOString(), ticketTitle },
    }))
    toast.loading(STAGE_LABEL.analyzing, {
      id: toastIdFor(ticketId),
      description: ticketTitle ? `SMASH on “${ticketTitle}”` : 'SMASH on this spec',
    })
  }, [])

  const handleProgress = useCallback((raw: unknown) => {
    const m = raw as Record<string, unknown>
    if (!m || m.type !== 'smash.progress') return
    const ticketId = m.ticketId as number | undefined
    const stage = m.stage as SmashStage | undefined
    if (typeof ticketId !== 'number' || !stage) return
    let title: string | undefined
    setInflight((s) => {
      const cur = s[ticketId]
      if (!cur) return s
      title = cur.ticketTitle
      return { ...s, [ticketId]: { ...cur, stage } }
    })
    toast.loading(STAGE_LABEL[stage], {
      id: toastIdFor(ticketId),
      description: title ? `SMASH on “${title}”` : 'SMASH on this spec',
    })
  }, [])

  const handleCompleted = useCallback((raw: unknown) => {
    const m = raw as Record<string, unknown>
    if (!m || m.type !== 'smash.completed') return
    const ticketId = m.ticketId as number | undefined
    const runId = m.runId as string | undefined
    const projectId = m.projectId as string | undefined
    const smashedAt = m.smashedAt as string | undefined
    const childrenIds = m.childrenIds as number[] | undefined
    if (typeof ticketId !== 'number' || !runId || !projectId || !smashedAt || !childrenIds) return
    smashedAtByRunRef.current.set(runId, smashedAt)
    setInflight((s) => {
      const next = { ...s }
      delete next[ticketId]
      return next
    })
    toast.success(`Spec split into ${childrenIds.length} Sub-Specs`, {
      id: toastIdFor(ticketId),
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => void fireUndo(projectId, ticketId, smashedAt),
      },
    })
  }, [])

  const handleFailed = useCallback((raw: unknown) => {
    const m = raw as Record<string, unknown>
    if (!m || m.type !== 'smash.failed') return
    const ticketId = m.ticketId as number | undefined
    const projectId = m.projectId as string | undefined
    const reason = (m.reason as string | undefined) ?? 'unknown'
    if (typeof ticketId !== 'number' || !projectId) return
    projectByTicketRef.current.set(ticketId, projectId)
    setInflight((s) => {
      const next = { ...s }
      delete next[ticketId]
      return next
    })
    const human =
      reason === 'invalid-output' ? 'The agent returned invalid output' :
      reason === 'timeout' ? 'The agent took too long' :
      reason === 'model_error' ? 'The model returned an error' :
      reason === 'crashed' ? 'The agent process crashed' :
      `Reason: ${reason}`
    toast.error('SMASH could not complete', {
      id: toastIdFor(ticketId),
      description: human,
      action: {
        label: 'Retry',
        onClick: () => void fireRetry(projectId, ticketId),
      },
      duration: 15_000,
    })
  }, [])

  const handleUndone = useCallback((raw: unknown) => {
    const m = raw as Record<string, unknown>
    if (!m || m.type !== 'smash.undone') return
    const ticketId = m.ticketId as number | undefined
    if (typeof ticketId !== 'number') return
    toast.dismiss(toastIdFor(ticketId))
    toast.success('SMASH undone', { id: toastIdFor(ticketId), duration: 3000 })
  }, [])

  useLayoutEffect(() => {
    registerHandler('_smash_started', handleStarted)
    registerHandler('_smash_progress', handleProgress)
    registerHandler('_smash_completed', handleCompleted)
    registerHandler('_smash_failed', handleFailed)
    registerHandler('_smash_undone', handleUndone)
    return () => {
      unregisterHandler('_smash_started')
      unregisterHandler('_smash_progress')
      unregisterHandler('_smash_completed')
      unregisterHandler('_smash_failed')
      unregisterHandler('_smash_undone')
    }
  }, [registerHandler, unregisterHandler, handleStarted, handleProgress, handleCompleted, handleFailed, handleUndone])

  useEffect(() => () => {
    projectByTicketRef.current.clear()
    smashedAtByRunRef.current.clear()
  }, [])

  const value = useMemo(() => ({ inflight }), [inflight])

  return <SmashTrackerContext.Provider value={value}>{children}</SmashTrackerContext.Provider>
}

export function useSmashInflight(ticketId: number | null | undefined): SmashInflight | null {
  const ctx = useContext(SmashTrackerContext)
  if (!ctx || ticketId == null) return null
  return ctx.inflight[ticketId] ?? null
}

export function useIsSmashing(ticketId: number | null | undefined): boolean {
  return useSmashInflight(ticketId) !== null
}
