/**
 * In the Tauri desktop app the frontend is served by Tauri's internal file
 * server, so relative URLs (/api/...) resolve to the wrong origin.
 * All network calls must use this prefix to hit the Express server.
 */
export const API_ORIGIN =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? 'http://localhost:4200'
    : ''
