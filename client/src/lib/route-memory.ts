/**
 * Module-level singleton that lets code outside useProjectRouteMemory
 * override which route a project restores to on next switch.
 *
 * Usage:
 *   forceProjectRoute(projectId, '/') — writes into the in-memory Map before
 *   setActiveProjectId fires, so route memory navigates to '/' on switch.
 */

type RouteForcer = (projectId: string, route: string) => void

let _forcer: RouteForcer | null = null

/** Called once by useProjectRouteMemory to wire up the in-memory Map. */
export function _registerRouteForcer(fn: RouteForcer): void {
  _forcer = fn
}

/** Force a specific route for a project on its next activation. */
export function forceProjectRoute(projectId: string, route: string): void {
  _forcer?.(projectId, route)
}
