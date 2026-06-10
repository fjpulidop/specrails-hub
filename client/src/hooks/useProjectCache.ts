import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Per-project data cache with stale-while-revalidate pattern.
 *
 * On project switch:
 * 1. Instantly returns cached data for the new project (no flicker)
 * 2. Fetches fresh data in the background
 * 3. Silently updates when fresh data arrives
 *
 * First visit to a project shows the initial value briefly, then data.
 */

// Global cache store — survives component unmounts, shared across instances with same key
const globalCache = new Map<string, unknown>()

function cacheKey(projectId: string, namespace: string): string {
  return `${projectId}:${namespace}`
}

interface UseProjectCacheOptions<T> {
  /** Unique namespace for this cache (e.g., 'commands', 'jobs', 'analytics') */
  namespace: string
  /** Active project ID — cache switches when this changes */
  projectId: string | null
  /** Initial value when no cache exists */
  initialValue: T
  /** Fetch function — called on mount and project switch */
  fetcher: () => Promise<T>
  /** Poll interval in ms (0 = no polling) */
  pollInterval?: number
}

interface UseProjectCacheReturn<T> {
  data: T
  isLoading: boolean
  /** True only on first load (no cache exists). False when showing cached data. */
  isFirstLoad: boolean
  refresh: () => void
}

export function useProjectCache<T>({
  namespace,
  projectId,
  initialValue,
  fetcher,
  pollInterval = 0,
}: UseProjectCacheOptions<T>): UseProjectCacheReturn<T> {
  const key = projectId ? cacheKey(projectId, namespace) : null

  // Initialize from cache or initial value
  const [data, setData] = useState<T>(() => {
    if (key && globalCache.has(key)) return globalCache.get(key) as T
    return initialValue
  })

  const [isFirstLoad, setIsFirstLoad] = useState(() => {
    return key ? !globalCache.has(key) : true
  })

  const [isLoading, setIsLoading] = useState(isFirstLoad)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  // B27: track the live key so a late-resolving manual refresh can detect a
  // project switch and avoid writing the previous project's data into state.
  const keyRef = useRef(key)
  keyRef.current = key

  // On project switch: restore from cache instantly, then refresh
  useEffect(() => {
    if (!key) return

    const cached = globalCache.get(key) as T | undefined
    if (cached !== undefined) {
      setData(cached)
      setIsFirstLoad(false)
      setIsLoading(false)
    } else {
      setData(initialValue)
      setIsFirstLoad(true)
      setIsLoading(true)
    }

    let cancelled = false

    async function doFetch() {
      try {
        const fresh = await fetcherRef.current()
        if (cancelled) return
        globalCache.set(key!, fresh)
        setData(fresh)
      } catch {
        // Keep cached/initial data on error
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsFirstLoad(false)
        }
      }
    }

    doFetch()

    // Polling
    let interval: ReturnType<typeof setInterval> | undefined
    if (pollInterval > 0) {
      interval = setInterval(doFetch, pollInterval)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollInterval])

  const refresh = useCallback(() => {
    if (!key) return
    const refreshKey = key
    fetcherRef.current().then((fresh) => {
      // Always cache under the key the fetch was issued for…
      globalCache.set(refreshKey, fresh)
      // …but only push into live state if we're still on that project (B27).
      if (keyRef.current === refreshKey) setData(fresh)
    }).catch(() => {})
  }, [key])

  return { data, isLoading, isFirstLoad, refresh }
}
