declare const __WS_URL__: string

function getWsUrl(): string {
  // In dev mode, Vite injects the backend WS URL directly (bypasses Vite's own WS)
  if (typeof __WS_URL__ !== 'undefined' && __WS_URL__) {
    return __WS_URL__
  }
  // In Tauri, window.location is tauri://localhost — must use explicit port 4200
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'ws://localhost:4200'
  }
  // In production browser, derive from page origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export const WS_URL = getWsUrl()
