import { useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSharedWebSocket } from './useSharedWebSocket'

interface WsJob {
  id: string
  status: string
  command?: string
}

export type OsNotificationFilter = 'all' | 'completed' | 'failed'

export interface OsNotificationPrefs {
  enabled: boolean
  filter: OsNotificationFilter
}

const STORAGE_KEY = 'specrails-os-notifications'

const DEFAULT_PREFS: OsNotificationPrefs = { enabled: true, filter: 'all' }

export function getOsNotificationPrefs(): OsNotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<OsNotificationPrefs>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFS.enabled,
      filter: parsed.filter === 'completed' || parsed.filter === 'failed' ? parsed.filter : DEFAULT_PREFS.filter,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function setOsNotificationPrefs(prefs: OsNotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

interface UseOsNotificationsOpts {
  /** Called on notification click to switch to the job's project (hub mode) */
  setActiveProjectId?: (id: string) => void
  /** projectId → projectName map for notification body text */
  projectsById?: Map<string, string>
}

/**
 * Sends OS notifications (Browser Notification API) when jobs transition
 * from running → completed or running → failed. Clicking a notification
 * focuses the window, optionally switches the active project, and navigates
 * to the job detail page.
 *
 * Only fires when the tab does NOT have focus (document.hidden === true).
 * Respects user preferences stored in localStorage (enabled, filter).
 */
export function useOsNotifications({
  setActiveProjectId,
  projectsById,
}: UseOsNotificationsOpts = {}): void {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const setActiveProjectIdRef = useRef(setActiveProjectId)
  useEffect(() => { setActiveProjectIdRef.current = setActiveProjectId }, [setActiveProjectId])

  const projectsByIdRef = useRef(projectsById)
  useEffect(() => { projectsByIdRef.current = projectsById }, [projectsById])

  // jobId → last known status (to detect running → terminal transitions)
  const jobStatesRef = useRef(new Map<string, string>())
  // jobId → projectId (for cross-project navigation)
  const jobProjectsRef = useRef(new Map<string, string>())

  const { registerHandler, unregisterHandler } = useSharedWebSocket()

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; projectId?: string; jobs?: WsJob[] }
    if (!msg || msg.type !== 'queue' || !Array.isArray(msg.jobs)) return

    const projectId = msg.projectId ?? null

    for (const job of msg.jobs) {
      const prevStatus = jobStatesRef.current.get(job.id)
      const newStatus = job.status

      if (projectId) jobProjectsRef.current.set(job.id, projectId)

      // Only notify on transition from running → completed/failed
      if (prevStatus === 'running' && (newStatus === 'completed' || newStatus === 'failed')) {
        fireOsNotification(job, projectId)
      }

      jobStatesRef.current.set(job.id, newStatus)
    }
  }, [])

  function fireOsNotification(job: WsJob, projectId: string | null): void {
    if (typeof Notification === 'undefined') return

    // Only notify when the tab does NOT have focus
    if (typeof document !== 'undefined' && !document.hidden) return

    // Check user preferences
    const prefs = getOsNotificationPrefs()
    if (!prefs.enabled) return
    if (prefs.filter === 'completed' && job.status !== 'completed') return
    if (prefs.filter === 'failed' && job.status !== 'failed') return

    function show(): void {
      const title = job.status === 'completed' ? 'Job completed' : 'Job failed'
      const projectName = projectId ? (projectsByIdRef.current?.get(projectId) ?? '') : ''
      const commandSnippet = job.command ? job.command.slice(0, 80) : 'Unknown command'
      const body = projectName ? `[${projectName}] ${commandSnippet}` : commandSnippet

      const notification = new Notification(title, {
        body,
        tag: `specrails-job:${job.id}:${job.status}`,
      })

      const jobId = job.id
      const targetProjectId = projectId

      notification.onclick = () => {
        window.focus()
        if (targetProjectId && setActiveProjectIdRef.current) {
          setActiveProjectIdRef.current(targetProjectId)
          setTimeout(() => {
            navigateRef.current(`/jobs/${jobId}`)
          }, 100)
        } else {
          navigateRef.current(`/jobs/${jobId}`)
        }
        notification.close()
      }
    }

    if (Notification.permission === 'granted') {
      show()
    } else if (Notification.permission === 'default') {
      void Notification.requestPermission().then((perm) => {
        if (perm === 'granted') show()
      })
    }
    // 'denied' → do nothing
  }

  useLayoutEffect(() => {
    registerHandler('os-notifications', handleMessage)
    return () => unregisterHandler('os-notifications')
  }, [handleMessage, registerHandler, unregisterHandler])
}
