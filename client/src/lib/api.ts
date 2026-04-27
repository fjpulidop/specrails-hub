/**
 * Returns the base URL prefix for project-scoped API calls.
 *
 * The hub server is the only supported runtime; this helper always returns
 * `${API_ORIGIN}/api/projects/<activeProjectId>`. Callers must set the active
 * project via `setActiveProjectId` before using the helper. Endpoints that are
 * not project-scoped (e.g. `/api/hub/*`, `/api/health`) should reference
 * `API_ORIGIN` directly instead of going through `getApiBase`.
 */

import { API_ORIGIN } from './origin'

let _activeProjectId: string | null = null

export function setActiveProjectId(projectId: string | null): void {
  _activeProjectId = projectId
}

/** @deprecated alias kept for tests; prefer `setActiveProjectId`. */
export const setApiContext = (projectId: string | null): void => setActiveProjectId(projectId)

export function getApiBase(): string {
  if (!_activeProjectId) {
    throw new Error('getApiBase called with no active project — call setActiveProjectId first')
  }
  return `${API_ORIGIN}/api/projects/${_activeProjectId}`
}
