/**
 * Client-side auth bootstrap.
 *
 * The hub server generates a static API token and exposes it via the public
 * `/api/hub/token` endpoint (safe because the server binds to 127.0.0.1 only).
 * This module fetches that token once and installs a fetch interceptor that
 * automatically attaches `X-Hub-Token` to every request targeting localhost.
 */

import { API_ORIGIN } from './origin'

let _token: string | null = null

/** Fetches the server token, retrying until the server is reachable (Tauri sidecar startup). */
export async function initAuth(): Promise<void> {
  const ATTEMPTS = 20
  const DELAY_MS = 300

  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const res = await fetch(`${API_ORIGIN}/api/hub/token`)
      if (res.ok) {
        const data = await res.json() as { token: string }
        _token = data.token ?? null
        return
      }
    } catch {
      // Server not ready yet — retry
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }
  // Non-fatal — app will handle 401s gracefully
}

/** Returns the cached hub token, or null if not yet initialized. */
export function getHubToken(): string | null {
  return _token
}

/**
 * Patches `window.fetch` so that:
 * 1. In Tauri: relative /api/* paths are rewritten to http://localhost:4200/api/*
 * 2. All requests to relative paths or localhost get X-Hub-Token header attached.
 *
 * Call this once after `initAuth()` succeeds.
 */
export function installFetchInterceptor(): void {
  const origFetch = window.fetch.bind(window)
  // __TAURI_INTERNALS__ may not be present at install time under WebView2 on
  // Windows ARM64; the tauri:// protocol is a reliable fallback signal.
  const proto = typeof window !== 'undefined' ? window.location.protocol : ''
  const isTauri =
    (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) ||
    (proto !== '' && proto !== 'http:' && proto !== 'https:')

  window.fetch = function (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    let url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    // In Tauri, rewrite relative API paths to the absolute Express origin.
    if (isTauri && url.startsWith('/')) {
      url = `http://localhost:4200${url}`
      input = url
    }

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
