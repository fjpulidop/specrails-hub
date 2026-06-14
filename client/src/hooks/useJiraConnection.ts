import { useEffect, useState } from 'react'
import { useDesktop } from './useDesktop'
import { FEATURE_JIRA } from '../lib/feature-flags'
import { jiraApi } from '../lib/jira-api'

export interface JiraConnectionInfo {
  /** True only when a connection exists AND sync is enabled. */
  connected: boolean
  jiraProjectKey: string | null
  loading: boolean
}

/**
 * Lightweight per-project Jira connection probe for Add Spec surfaces. Tells the
 * UI whether new specs will be created in Jira (so it can show the "Se creará en
 * Jira · PROJ" indicator). Re-runs on project switch. Safe when the feature is
 * off (returns { connected: false }).
 */
export function useJiraConnection(): JiraConnectionInfo {
  const { activeProjectId } = useDesktop()
  const [info, setInfo] = useState<{ connected: boolean; key: string | null }>({ connected: false, key: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!FEATURE_JIRA || !activeProjectId) {
      setInfo({ connected: false, key: null })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    jiraApi
      .getConnection()
      .then((s) => {
        if (cancelled) return
        setInfo({
          connected: !!(s.connected && s.connection?.enabled),
          key: s.connection?.jiraProjectKey ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) setInfo({ connected: false, key: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  return { connected: info.connected, jiraProjectKey: info.key, loading }
}
