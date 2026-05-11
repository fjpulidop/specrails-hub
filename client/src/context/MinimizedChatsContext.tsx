import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useHub } from '../hooks/useHub'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import { isSpecDraftUpdate } from '../lib/spec-draft'
import { MinimizedChatChip } from '../components/minimized-chats/MinimizedChatChip'

// ─── Types ────────────────────────────────────────────────────────────────

export type MinimizedChatKind = 'explore-spec' | 'ai-edit'

export interface ExploreSpecParams {
  initialIdea: string
  pendingSpecId: string
  initialAttachmentIds: string[]
  /** Server-side conversation id captured when the shell minimized — used on
   *  restore to rehydrate via existing chat APIs instead of bootstrapping a
   *  fresh `/specrails:explore-spec` turn. */
  resumeConversationId?: string
  /** In-progress composer text the user was typing when they minimized.
   *  Replayed into the editor on restore so a half-typed reply isn't lost. */
  composerText?: string
  /** Manual draft field overrides (title/description/labels/priority/criteria)
   *  the user applied before minimize. Replayed via `setField` on restore so
   *  edits survive the cycle. */
  draftOverrides?: {
    title?: string
    description?: string
    priority?: 'low' | 'medium' | 'high' | 'critical'
    labels?: string[]
    acceptanceCriteria?: string[]
  }
  /** When set, the shell is launched in edit-existing-ticket mode. The shell
   *  pre-seeds the draft from this payload, uses it as the Review baseline,
   *  and commits via PATCH /tickets/:id. See
   *  openspec/changes/replace-ai-edit-with-continue-editing/design.md D2. */
  editTicket?: {
    id: number
    title: string
    description: string
    labels: string[]
    priority: 'low' | 'medium' | 'high' | 'critical' | null
    acceptanceCriteria: string[]
  }
}

export interface AiEditParams {
  agentId: string
  baseBody: string
  /** Server-side refine session id — drives `useAgentRefine.rehydrate()` on
   *  restore so the draft, history and diff state come back from the server. */
  resumeRefineId?: string
}

interface MinimizedChatBase {
  id: string
  projectId: string
  label: string
  restoreRoute: string
  createdAt: number
}

export type MinimizedChat =
  | (MinimizedChatBase & { kind: 'explore-spec'; params: ExploreSpecParams })
  | (MinimizedChatBase & { kind: 'ai-edit'; params: AiEditParams })

interface MinimizedChatsContextValue {
  chats: MinimizedChat[]
  /** Pending restores — exposed so `usePendingRestore` can react to changes.
   *  Triggers MUST consume via `takePendingRestore`, not by reading this. */
  pendingRestores: MinimizedChat[]
  /** Park a new minimized session and add it to the dock. Returns its id. */
  minimize: (input: Omit<MinimizedChat, 'id' | 'createdAt'>) => string
  /** Update a parked chat's display label live (e.g. when the underlying
   *  conversation gets a fresh draft title from Claude). No-op if id
   *  is not in the minimized list. */
  updateLabel: (id: string, label: string) => void
  /** Merge live spec-draft fields (description, labels, priority,
   *  acceptanceCriteria) into a parked explore-spec chat's params so that
   *  values Claude pushes WHILE the shell is minimized survive even if
   *  the server's in-memory `_specDraftStates` is later wiped (e.g. dev
   *  server restart). No-op for non-explore-spec chats. */
  patchExploreSpecDraft: (
    id: string,
    patch: Partial<NonNullable<ExploreSpecParams['draftOverrides']>>,
  ) => void
  /** Drop a chip silently. */
  close: (id: string) => void
  /** Switch project, navigate to restore route, and queue a pending-restore
   *  the matching trigger picks up via `usePendingRestore`. */
  restore: (id: string) => void
  /** Trigger-side: returns the next pending restore matching (kind,
   *  projectId), or null. Internally consumes on call. */
  takePendingRestore: (
    kind: MinimizedChatKind,
    projectId: string,
  ) => MinimizedChat | null
  /** Push a session into the pending-restore queue WITHOUT first parking it as
   *  a minimized toast. Used by surfaces that want to open a shell from a
   *  durable record (e.g. a draft ticket's Continue Explore button). */
  triggerResume: (input: Omit<MinimizedChat, 'id' | 'createdAt'>) => void
}

const MinimizedChatsContext = createContext<MinimizedChatsContextValue | null>(
  null,
)

// ─── Persistence ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'specrails-hub:minimized-chats'
const MAX_PERSISTED = 50

export function loadFromStorage(): MinimizedChat[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidChat)
  } catch {
    return []
  }
}

export function saveToStorage(chats: MinimizedChat[]): void {
  if (typeof window === 'undefined') return
  try {
    // Cap at MAX_PERSISTED — drop oldest first so the dock can never grow
    // into a localStorage quota issue after a long session.
    const capped =
      chats.length <= MAX_PERSISTED
        ? chats
        : [...chats]
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(chats.length - MAX_PERSISTED)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
  } catch {
    /* quota or storage unavailable — silent */
  }
}

function isValidChat(value: unknown): value is MinimizedChat {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (typeof c.id !== 'string') return false
  if (typeof c.projectId !== 'string') return false
  if (typeof c.label !== 'string') return false
  if (typeof c.restoreRoute !== 'string') return false
  if (typeof c.createdAt !== 'number') return false
  if (c.kind !== 'explore-spec' && c.kind !== 'ai-edit') return false
  if (!c.params || typeof c.params !== 'object') return false
  return true
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ─── Provider ─────────────────────────────────────────────────────────────

export function MinimizedChatsProvider({ children }: { children: ReactNode }) {
  const { projects, activeProjectId, setActiveProjectId, setupProjectIds } = useHub()
  const navigate = useNavigate()
  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  const [chats, setChats] = useState<MinimizedChat[]>(() => loadFromStorage())
  // Pending restores live separately from `chats` so the chip is removed
  // from the dock immediately on click, but the trigger can still pick the
  // entry up after a project switch + remount.
  const [pendingRestores, setPendingRestores] = useState<MinimizedChat[]>([])
  // Track which chats already have a sonner toast on screen so re-renders
  // don't re-fire (sonner ignores duplicate ids but we also use this to
  // dismiss on close/restore).
  const toastedRef = useRef<Set<string>>(new Set())
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  // Persist whenever chats list changes.
  useEffect(() => {
    saveToStorage(chats)
  }, [chats])

  // Live-update parked explore-spec chats when Claude pushes
  // `spec_draft.update` — title hits the chip's label, the rest of the
  // fields land in the chip's `params.draftOverrides`. The latter matters
  // because it survives a server-restart-while-minimized: the restored
  // shell can fall back on the chip's own draft snapshot when the
  // server's in-memory `_specDraftStates` has been wiped. We use chatsRef
  // so the handler always reads the latest list without re-registering.
  const updateLabelRef = useRef<(id: string, label: string) => void>(() => {})
  const patchExploreSpecDraftRef = useRef<
    (id: string, patch: Partial<NonNullable<ExploreSpecParams['draftOverrides']>>) => void
  >(() => {})
  useEffect(() => {
    const handlerId = 'minimized-chats:spec-draft'
    registerHandler(handlerId, (msg) => {
      if (!isSpecDraftUpdate(msg)) return
      const conversationId = msg.conversationId
      const match = chatsRef.current.find(
        (c) =>
          c.kind === 'explore-spec' &&
          c.params.resumeConversationId === conversationId,
      )
      if (!match) return
      const incoming = msg.draft as Partial<{
        title: string
        description: string
        priority: 'low' | 'medium' | 'high' | 'critical'
        labels: string[]
        acceptanceCriteria: string[]
      }>
      if (incoming.title?.trim()) {
        updateLabelRef.current(match.id, incoming.title)
      }
      const patch: Partial<NonNullable<ExploreSpecParams['draftOverrides']>> = {}
      if (incoming.title !== undefined) patch.title = incoming.title
      if (incoming.description !== undefined) patch.description = incoming.description
      if (incoming.priority !== undefined) patch.priority = incoming.priority
      if (incoming.labels !== undefined) patch.labels = incoming.labels
      if (incoming.acceptanceCriteria !== undefined) patch.acceptanceCriteria = incoming.acceptanceCriteria
      if (Object.keys(patch).length > 0) {
        patchExploreSpecDraftRef.current(match.id, patch)
      }
    })
    return () => unregisterHandler(handlerId)
  }, [registerHandler, unregisterHandler])

  // Sync chats → sonner toasts. Each chat shows as a long-lived toast
  // (`duration: Infinity`) keyed by chat id so it stacks alongside the
  // project-level toasts. Re-firing `toast.custom` with the same id
  // replaces the existing toast in place — used here to live-update the
  // chip's label when Claude pushes a new draft title.
  // Setup-wizard takeover hides chips to keep that flow clean.
  // restore/close are referenced via refs because they're declared after
  // this effect (TS hoisting rule for `const`).
  const restoreRef = useRef<(id: string) => void>(() => {})
  const closeRef = useRef<(id: string) => void>(() => {})
  // Track the label we last rendered per chat so we only re-fire the toast
  // when the label actually changes.
  const lastRenderedLabelRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const isSetupActive =
      activeProjectId !== null && setupProjectIds.has(activeProjectId)
    if (isSetupActive) {
      for (const id of toastedRef.current) {
        toast.dismiss(id)
      }
      toastedRef.current.clear()
      lastRenderedLabelRef.current.clear()
      return
    }
    const aliveIds = new Set(chats.map((c) => c.id))
    for (const id of toastedRef.current) {
      if (!aliveIds.has(id)) {
        toast.dismiss(id)
        toastedRef.current.delete(id)
        lastRenderedLabelRef.current.delete(id)
      }
    }
    for (const chat of chats) {
      const lastLabel = lastRenderedLabelRef.current.get(chat.id)
      if (toastedRef.current.has(chat.id) && lastLabel === chat.label) continue
      toastedRef.current.add(chat.id)
      lastRenderedLabelRef.current.set(chat.id, chat.label)
      const projectName =
        projectsRef.current.find((p) => p.id === chat.projectId)?.name ??
        'Unknown project'
      toast.custom(
        () => (
          <MinimizedChatChip
            chat={chat}
            projectName={projectName}
            onRestore={() => restoreRef.current(chat.id)}
            onClose={() => closeRef.current(chat.id)}
          />
        ),
        { id: chat.id, duration: Infinity },
      )
    }
  }, [chats, activeProjectId, setupProjectIds])

  // Drop chips for projects that no longer exist (silent cleanup).
  useEffect(() => {
    if (projects.length === 0) return
    const existing = new Set(projects.map((p) => p.id))
    setChats((prev) => {
      const filtered = prev.filter((c) => existing.has(c.projectId))
      return filtered.length === prev.length ? prev : filtered
    })
    setPendingRestores((prev) => prev.filter((c) => existing.has(c.projectId)))
  }, [projects])

  const minimize = useCallback(
    (input: Omit<MinimizedChat, 'id' | 'createdAt'>): string => {
      const id = genId()
      const chat = { ...input, id, createdAt: Date.now() } as MinimizedChat
      setChats((prev) => [...prev, chat])
      // Notify the server for Explore Spec lifecycle (idle-kill timer).
      // Best-effort; no UX dependency on success.
      if (input.kind === 'explore-spec') {
        const params = input.params as ExploreSpecParams
        const convId = params.resumeConversationId
        if (convId) {
          void fetch(
            `/api/projects/${input.projectId}/chat/conversations/${convId}/minimize`,
            { method: 'POST' },
          ).catch(() => { /* ignore */ })
        }
      }
      return id
    },
    [],
  )

  const close = useCallback((id: string) => {
    toast.dismiss(id)
    toastedRef.current.delete(id)
    setChats((prev) => prev.filter((c) => c.id !== id))
    setPendingRestores((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateLabel = useCallback((id: string, label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    setChats((prev) =>
      prev.map((c) => (c.id === id && c.label !== trimmed ? { ...c, label: trimmed } : c)),
    )
  }, [])

  const patchExploreSpecDraft = useCallback(
    (id: string, patch: Partial<NonNullable<ExploreSpecParams['draftOverrides']>>) => {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== id || c.kind !== 'explore-spec') return c
          const merged: NonNullable<ExploreSpecParams['draftOverrides']> = {
            ...(c.params.draftOverrides ?? {}),
            ...patch,
          }
          return { ...c, params: { ...c.params, draftOverrides: merged } }
        }),
      )
    },
    [],
  )

  // Synchronous snapshots — setState updaters can run asynchronously, so
  // we read latest state via refs when consumers need a synchronous answer.
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const pendingRestoresRef = useRef(pendingRestores)
  pendingRestoresRef.current = pendingRestores

  const restore = useCallback(
    (id: string) => {
      const target = chatsRef.current.find((c) => c.id === id)
      if (!target) return
      toast.dismiss(id)
      toastedRef.current.delete(id)
      // Cancel the server-side idle-kill timer for Explore conversations.
      if (target.kind === 'explore-spec') {
        const params = target.params as ExploreSpecParams
        const convId = params.resumeConversationId
        if (convId) {
          void fetch(
            `/api/projects/${target.projectId}/chat/conversations/${convId}/restore`,
            { method: 'POST' },
          ).catch(() => { /* ignore */ })
        }
      }
      if (activeProjectId !== target.projectId) {
        setActiveProjectId(target.projectId)
      }
      navigate(target.restoreRoute)
      setPendingRestores((q) => [...q, target])
      setChats((prev) => prev.filter((c) => c.id !== id))
    },
    [activeProjectId, setActiveProjectId, navigate],
  )

  restoreRef.current = restore
  closeRef.current = close
  updateLabelRef.current = updateLabel
  patchExploreSpecDraftRef.current = patchExploreSpecDraft

  const takePendingRestore = useCallback(
    (kind: MinimizedChatKind, projectId: string): MinimizedChat | null => {
      const current = pendingRestoresRef.current
      const idx = current.findIndex(
        (c) => c.kind === kind && c.projectId === projectId,
      )
      if (idx === -1) return null
      const taken = current[idx]
      const next = [...current.slice(0, idx), ...current.slice(idx + 1)]
      pendingRestoresRef.current = next
      setPendingRestores(next)
      return taken
    },
    [],
  )

  const triggerResume = useCallback(
    (input: Omit<MinimizedChat, 'id' | 'createdAt'>) => {
      const id = genId()
      const chat = { ...input, id, createdAt: Date.now() } as MinimizedChat
      if (activeProjectId !== input.projectId) {
        setActiveProjectId(input.projectId)
      }
      navigate(input.restoreRoute)
      setPendingRestores((q) => [...q, chat])
    },
    [activeProjectId, setActiveProjectId, navigate],
  )

  const value = useMemo<MinimizedChatsContextValue>(
    () => ({
      chats,
      pendingRestores,
      minimize,
      updateLabel,
      patchExploreSpecDraft,
      close,
      restore,
      takePendingRestore,
      triggerResume,
    }),
    [chats, pendingRestores, minimize, updateLabel, patchExploreSpecDraft, close, restore, takePendingRestore, triggerResume],
  )

  return (
    <MinimizedChatsContext.Provider value={value}>
      {children}
    </MinimizedChatsContext.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────

export function useMinimizedChats(): MinimizedChatsContextValue {
  const ctx = useContext(MinimizedChatsContext)
  if (!ctx) {
    return {
      chats: [],
      pendingRestores: [],
      minimize: () => '',
      updateLabel: () => {},
      patchExploreSpecDraft: () => {},
      close: () => {},
      restore: () => {},
      takePendingRestore: () => null,
      triggerResume: () => {},
    }
  }
  return ctx
}

/** Trigger-side: subscribe to pending restores for a (kind, projectId) pair.
 *  The callback fires once per pending restore and the entry is consumed. */
export function usePendingRestore(
  kind: MinimizedChatKind,
  projectId: string | null,
  onRestore: (chat: MinimizedChat) => void,
): void {
  const { pendingRestores, takePendingRestore } = useMinimizedChats()
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  useEffect(() => {
    if (!projectId) return
    const pending = takePendingRestore(kind, projectId)
    if (pending) onRestoreRef.current(pending)
    // pendingRestores dep makes us re-check after any restore is queued so
    // a trigger remounting after a project switch still consumes its entry.
  }, [pendingRestores, kind, projectId, takePendingRestore])
}
