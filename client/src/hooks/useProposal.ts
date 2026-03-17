import { useReducer, useEffect, useRef, useCallback } from 'react'
import { useSharedWebSocket } from './useSharedWebSocket'
import { getApiBase } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProposalStatus =
  | 'idle'
  | 'exploring'
  | 'review'
  | 'refining'
  | 'creating_issue'
  | 'created'
  | 'cancelled'
  | 'error'

export interface ProposalState {
  proposalId: string | null
  status: ProposalStatus
  streamingText: string
  resultMarkdown: string
  issueUrl: string | null
  errorMessage: string | null
}

type ProposalAction =
  | { type: 'START_EXPLORING'; proposalId: string }
  | { type: 'APPEND_STREAM'; delta: string }
  | { type: 'PROPOSAL_READY'; markdown: string }
  | { type: 'PROPOSAL_REFINED'; markdown: string }
  | { type: 'CREATING_ISSUE' }
  | { type: 'ISSUE_CREATED'; issueUrl: string }
  | { type: 'ERROR'; errorMessage: string }
  | { type: 'CANCELLED' }
  | { type: 'RESET' }

function stripToolMarkers(text: string): string {
  return text.replace(/<!--tool:\w+-->/g, '').trim()
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: ProposalState = {
  proposalId: null,
  status: 'idle',
  streamingText: '',
  resultMarkdown: '',
  issueUrl: null,
  errorMessage: null,
}

function proposalReducer(state: ProposalState, action: ProposalAction): ProposalState {
  switch (action.type) {
    case 'START_EXPLORING':
      return { ...state, proposalId: action.proposalId, status: 'exploring', streamingText: '', errorMessage: null }
    case 'APPEND_STREAM':
      return { ...state, streamingText: state.streamingText + action.delta }
    case 'PROPOSAL_READY':
      return { ...state, status: 'review', resultMarkdown: stripToolMarkers(action.markdown), streamingText: '' }
    case 'PROPOSAL_REFINED':
      return { ...state, status: 'review', resultMarkdown: stripToolMarkers(action.markdown), streamingText: '' }
    case 'CREATING_ISSUE':
      return { ...state, status: 'creating_issue', streamingText: '', errorMessage: null }
    case 'ISSUE_CREATED':
      return { ...state, status: 'created', issueUrl: action.issueUrl, streamingText: '' }
    case 'ERROR':
      return { ...state, status: 'error', errorMessage: action.errorMessage }
    case 'CANCELLED':
      return { ...state, status: 'cancelled' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProposal(projectId: string | null): {
  state: ProposalState
  startProposal: (idea: string) => Promise<void>
  sendRefinement: (feedback: string) => Promise<void>
  createIssue: () => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
} {
  const [state, dispatch] = useReducer(proposalReducer, initialState)
  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // Ref tracks current proposalId so the WS closure always sees the latest value
  const proposalIdRef = useRef<string | null>(null)
  proposalIdRef.current = state.proposalId

  // Subscribe to WebSocket messages for this proposal
  useEffect(() => {
    const handlerId = 'proposal-hook'

    registerHandler(handlerId, (raw) => {
      const msg = raw as Record<string, unknown>
      if (typeof msg.type !== 'string') return
      if (msg.projectId !== projectId) return
      if (msg.proposalId !== proposalIdRef.current) return

      switch (msg.type) {
        case 'proposal_stream':
          dispatch({ type: 'APPEND_STREAM', delta: msg.delta as string })
          break
        case 'proposal_ready':
          dispatch({ type: 'PROPOSAL_READY', markdown: msg.markdown as string })
          break
        case 'proposal_refined':
          dispatch({ type: 'PROPOSAL_REFINED', markdown: msg.markdown as string })
          break
        case 'proposal_issue_created':
          dispatch({ type: 'ISSUE_CREATED', issueUrl: msg.issueUrl as string })
          break
        case 'proposal_error': {
          const error = msg.error as string
          if (error === 'cancelled') {
            dispatch({ type: 'CANCELLED' })
          } else {
            dispatch({ type: 'ERROR', errorMessage: error })
          }
          break
        }
      }
    })

    return () => unregisterHandler(handlerId)
  }, [projectId, registerHandler, unregisterHandler])

  const startProposal = useCallback(async (idea: string): Promise<void> => {
    try {
      const res = await fetch(`${getApiBase()}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        dispatch({ type: 'ERROR', errorMessage: data.error ?? `Server error (${res.status})` })
        return
      }
      const data = await res.json() as { proposalId: string }
      // Set proposalId immediately so WS messages arriving before re-render are filtered correctly
      proposalIdRef.current = data.proposalId
      dispatch({ type: 'START_EXPLORING', proposalId: data.proposalId })
    } catch (err) {
      dispatch({ type: 'ERROR', errorMessage: `Connection failed: ${(err as Error).message}` })
    }
  }, [])

  const sendRefinement = useCallback(async (feedback: string): Promise<void> => {
    if (!state.proposalId) return
    try {
      const res = await fetch(`${getApiBase()}/propose/${state.proposalId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        dispatch({ type: 'ERROR', errorMessage: data.error ?? 'Failed to send refinement' })
        return
      }
      dispatch({ type: 'APPEND_STREAM', delta: '' })  // clear streaming indicator implicitly via status
      // Status will transition via WS: refining -> review
    } catch (err) {
      dispatch({ type: 'ERROR', errorMessage: `Connection failed: ${(err as Error).message}` })
    }
  }, [state.proposalId])

  const createIssue = useCallback(async (): Promise<void> => {
    if (!state.proposalId) return
    dispatch({ type: 'CREATING_ISSUE' })
    try {
      const res = await fetch(`${getApiBase()}/propose/${state.proposalId}/create-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        dispatch({ type: 'ERROR', errorMessage: data.error ?? 'Failed to create issue' })
      }
      // Success transitions via WS: proposal_issue_created
    } catch (err) {
      dispatch({ type: 'ERROR', errorMessage: `Connection failed: ${(err as Error).message}` })
    }
  }, [state.proposalId])

  const cancel = useCallback(async (): Promise<void> => {
    if (!state.proposalId) return
    dispatch({ type: 'CANCELLED' })
    try {
      await fetch(`${getApiBase()}/propose/${state.proposalId}`, {
        method: 'DELETE',
      })
    } catch { /* best-effort */ }
  }, [state.proposalId])

  const reset = useCallback((): void => {
    proposalIdRef.current = null
    dispatch({ type: 'RESET' })
  }, [])

  return { state, startProposal, sendRefinement, createIssue, cancel, reset }
}
