/**
 * Returns the base URL prefix for project-scoped API calls.
 *
 * Single-project mode: '/api'
 * Hub mode with active project: '/api/projects/<id>'
 *
 * Components and hooks call useApiBase() to get this prefix, then append
 * resource paths (e.g., `${base}/jobs`).
 */

import { API_ORIGIN } from './origin'

// Module-level store for active project ID — set by HubProvider/App
let _activeProjectId: string | null = null
let _isHubMode = false

export function setApiContext(isHub: boolean, projectId: string | null): void {
  _isHubMode = isHub
  _activeProjectId = projectId
}

/** Sets hub mode without touching the active project ID.
 * Use in the REST load to avoid racing with the WS handler that may have
 * already set _activeProjectId via setApiContext(true, projectId). */
export function setHubMode(isHub: boolean): void {
  _isHubMode = isHub
}

export function getApiBase(): string {
  if (_isHubMode && _activeProjectId) {
    return `${API_ORIGIN}/api/projects/${_activeProjectId}`
  }
  return `${API_ORIGIN}/api`
}
