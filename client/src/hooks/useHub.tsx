import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from 'react'
import { API_ORIGIN } from '../lib/origin'
import { toast } from 'sonner'
import { useSharedWebSocket } from './useSharedWebSocket'
import { setApiContext, setHubMode } from '../lib/api'

export interface HubProject {
  id: string
  slug: string
  name: string
  path: string
  db_path: string
  provider: 'claude' | 'codex'
  added_at: string
  last_seen_at: string
}

export interface AddProjectResult {
  project: HubProject
  has_specrails: boolean
}

interface HubContextValue {
  projects: HubProject[]
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  addProject: (path: string, name?: string, provider?: 'claude') => Promise<AddProjectResult | null>
  removeProject: (id: string) => Promise<void>
  isLoading: boolean
  /** True briefly after switching active project — triggers the loading bar */
  isSwitchingProject: boolean
  /** IDs of projects currently in the setup wizard */
  setupProjectIds: Set<string>
  startSetupWizard: (projectId: string) => void
  completeSetupWizard: (projectId: string) => void
}

const HubContext = createContext<HubContextValue | null>(null)

const ACTIVE_PROJECT_KEY = 'specrails-hub:activeProjectId'

function writeSavedProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id)
    else localStorage.removeItem(ACTIVE_PROJECT_KEY)
  } catch { /* ignore */ }
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<HubProject[]>([])
  const [activeProjectId, setActiveProjectIdRaw] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitchingProject, setIsSwitchingProject] = useState(false)
  const [setupProjectIds, setSetupProjectIds] = useState<Set<string>>(new Set())
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setActiveProjectId = useCallback((id: string | null): void => {
    writeSavedProjectId(id)
    setApiContext(true, id)
    setActiveProjectIdRaw((prev) => {
      if (prev !== null && prev !== id) {
        // Briefly flag project switching for the progress bar
        if (switchTimerRef.current) clearTimeout(switchTimerRef.current)
        setIsSwitchingProject(true)
        switchTimerRef.current = setTimeout(() => setIsSwitchingProject(false), 400)
      }
      return id
    })
  }, [])
  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  // Load projects from REST on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_ORIGIN}/api/hub/projects`)
        if (!res.ok) return
        const data = await res.json() as { projects: HubProject[]; setupProjectIds?: string[] }
        setProjects(data.projects)
        // Restore setup wizard state from server (survives page refresh)
        if (data.setupProjectIds && data.setupProjectIds.length > 0) {
          setSetupProjectIds(new Set(data.setupProjectIds))
        }
        // Mark hub mode without overwriting any project already set by the WS
        // handler (hub.projects fires concurrently and may have already called
        // setApiContext(true, projectId) — resetting it here would break API calls).
        setHubMode(true)
      } catch {
        // Hub may not be running in hub mode — treat as empty
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  // Handle hub-level WebSocket messages
  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (typeof msg.type !== 'string') return

    if (msg.type === 'hub.projects') {
      const incoming = msg.projects as HubProject[]
      setProjects(incoming)
      setActiveProjectIdRaw((prev) => {
        const next = (prev && incoming.find((p) => p.id === prev)) ? prev : (incoming.length > 0 ? incoming[0].id : null)
        writeSavedProjectId(next)
        setApiContext(true, next)
        return next
      })
      setIsLoading(false)
    } else if (msg.type === 'hub.project_added') {
      const project = msg.project as HubProject
      setProjects((prev) => {
        if (prev.find((p) => p.id === project.id)) return prev
        return [...prev, project]
      })
      toast.success(`Project added: ${project.name}`)
      // Activate the newly added project
      setActiveProjectId(project.id)
    } else if (msg.type === 'hub.project_removed') {
      const projectId = msg.projectId as string
      toast.success('Project removed')
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
      setActiveProjectIdRaw((prev) => {
        if (prev !== projectId) return prev
        writeSavedProjectId(null)
        setApiContext(true, null)
        return null
      })
    }
  }, [])

  useLayoutEffect(() => {
    registerHandler('hub', handleMessage)
    return () => unregisterHandler('hub')
  }, [handleMessage, registerHandler, unregisterHandler])

  const addProject = useCallback(async (projectPath: string, name?: string, provider: 'claude' = 'claude'): Promise<AddProjectResult | null> => {
    try {
      const body: Record<string, string> = { path: projectPath }
      if (name) body.name = name
      if (provider) body.provider = provider

      const res = await fetch('/api/hub/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json() as AddProjectResult
      setProjects((prev) => {
        if (prev.find((p) => p.id === data.project.id)) return prev
        return [...prev, data.project]
      })
      setActiveProjectId(data.project.id)
      return data
    } catch (err) {
      console.error('[useHub] addProject error:', err)
      throw err
    }
  }, [setActiveProjectId])

  const removeProject = useCallback(async (id: string): Promise<void> => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/hub/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      setProjects((prev) => prev.filter((p) => p.id !== id))
      setSetupProjectIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setActiveProjectIdRaw((prev) => {
        if (prev !== id) return prev
        writeSavedProjectId(null)
        setApiContext(true, null)
        return null
      })
    } catch (err) {
      console.error('[useHub] removeProject error:', err)
      throw err
    }
  }, [])

  const startSetupWizard = useCallback((projectId: string) => {
    setSetupProjectIds((prev) => new Set([...prev, projectId]))
  }, [])

  const completeSetupWizard = useCallback((projectId: string) => {
    setSetupProjectIds((prev) => {
      const next = new Set(prev)
      next.delete(projectId)
      return next
    })
  }, [])

  const contextValue = useMemo(() => ({
    projects,
    activeProjectId,
    setActiveProjectId,
    addProject,
    removeProject,
    isLoading,
    isSwitchingProject,
    setupProjectIds,
    startSetupWizard,
    completeSetupWizard,
  }), [projects, activeProjectId, setActiveProjectId, addProject, removeProject, isLoading, isSwitchingProject, setupProjectIds, startSetupWizard, completeSetupWizard])

  return (
    <HubContext.Provider value={contextValue}>
      {children}
    </HubContext.Provider>
  )
}

const LEGACY_FALLBACK: HubContextValue = {
  projects: [],
  activeProjectId: null,
  setActiveProjectId: () => {},
  addProject: async () => null,
  removeProject: async () => {},
  isLoading: false,
  isSwitchingProject: false,
  setupProjectIds: new Set(),
  startSetupWizard: () => {},
  completeSetupWizard: () => {},
}

export function useHub(): HubContextValue {
  const ctx = useContext(HubContext)
  // In legacy (non-hub) mode there is no HubProvider — return safe defaults
  return ctx ?? LEGACY_FALLBACK
}
