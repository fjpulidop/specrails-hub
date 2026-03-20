/**
 * Client-side auth bootstrap.
 *
 * The hub server generates a static API token and exposes it via the public
 * `/api/hub/token` endpoint (safe because the server binds to 127.0.0.1 only).
 * This module fetches that token once and installs a fetch interceptor that
 * automatically attaches `X-Hub-Token` to every request targeting localhost.
 */

let _token: string | null = null

/** Fetches the server token and caches it in memory. */
export async function initAuth(): Promise<void> {
  try {
    const res = await fetch('/api/hub/token')
    if (res.ok) {
      const data = await res.json() as { token: string }
      _token = data.token ?? null
    }
  } catch {
    // Non-fatal — if auth isn't available the app will receive 401s and
    // the user can reload once the server is ready.
  }
}

/** Returns the cached hub token, or null if not yet initialized. */
export function getHubToken(): string | null {
  return _token
}

/**
 * Patches `window.fetch` so that all requests to relative paths or localhost
 * automatically include `X-Hub-Token`.
 *
 * Call this once after `initAuth()` succeeds.
 */
export function installFetchInterceptor(): void {
  const origFetch = window.fetch.bind(window)

  window.fetch = function (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    const isLocal =
      url.startsWith('/') ||
      url.includes('localhost') ||
      url.includes('127.0.0.1')

    if (isLocal && _token) {
      const headers = new Headers(init.headers)
      if (!headers.has('X-Hub-Token')) {
        headers.set('X-Hub-Token', _token)
      }
      return origFetch(input, { ...init, headers })
    }

    return origFetch(input, init)
  }
}
