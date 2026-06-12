// Pure, testable WebSocket routing decisions (H-09). Kept out of index.ts (which
// is excluded from coverage and not unit-tested) so the project-isolation logic
// that the Mobile Gateway will depend on is covered and verifiable.

/**
 * Decide whether a broadcast message should be delivered to a given connection.
 *
 * - App-level messages (no projectId) go to everyone.
 * - A connection that has NOT declared a subscription (`subscribedProjectId`
 *   null) receives everything — back-compat with the current web client, whose
 *   own client-side filter remains as a redundant second layer.
 * - A connection subscribed to project P receives only P's project-scoped
 *   messages (plus all app-level ones).
 *
 * The Mobile Gateway turns this into a hard authorization boundary by always
 * subscribing each device connection to exactly the project(s) it may see.
 */
export function shouldDeliverToSubscriber(
  msgProjectId: string | undefined,
  subscribedProjectId: string | null,
): boolean {
  if (msgProjectId === undefined) return true
  if (subscribedProjectId === null) return true
  return subscribedProjectId === msgProjectId
}

/**
 * Parse an inbound WS control frame and return the projectId to subscribe to.
 *
 * Returns `{ subscribe: true, projectId }` for a well-formed
 * `{ type: 'subscribe', projectId: <string|null> }` frame (a non-string
 * projectId clears the subscription → null), or `{ subscribe: false }` for
 * anything else / malformed input. Never throws.
 */
export function parseSubscribeFrame(raw: string): { subscribe: boolean; projectId: string | null } {
  try {
    const parsed = JSON.parse(raw) as { type?: string; projectId?: unknown }
    if (parsed?.type === 'subscribe') {
      return { subscribe: true, projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null }
    }
  } catch {
    // Malformed control frame — ignore.
  }
  return { subscribe: false, projectId: null }
}
