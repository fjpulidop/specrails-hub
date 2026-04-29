/**
 * Thin Tauri shell helpers. All functions are no-ops outside the Tauri webview.
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
}

// Indirected so Vite's static analyser doesn't try to resolve these at build time.
// The plugins may not be installed in plain-browser bundles; we want a runtime no-op there.
function dynImport(spec: string): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>)(spec).catch(() => null)
}

export async function revealItemInDir(p: string): Promise<void> {
  if (!isTauri()) return
  try {
    const opener = await dynImport('@tauri-apps/plugin-opener') as { revealItemInDir?: (p: string) => Promise<void> } | null
    if (opener?.revealItemInDir) {
      await opener.revealItemInDir(p)
      return
    }
  } catch { /* ignore */ }
  try {
    const shell = await dynImport('@tauri-apps/api/shell') as { open?: (p: string) => Promise<void> } | null
    await shell?.open?.(p)
  } catch { /* ignore */ }
}

export { dynImport as _tauriDynImport }

/** Open a URL in the user's default external browser. In Tauri this goes
 *  through the shell plugin so it leaves the WebView; in plain browsers it
 *  falls back to window.open which opens a new tab in the same browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      if (typeof shell.open === 'function') {
        await shell.open(url)
        return
      }
    } catch (err) {
      console.warn('[openExternalUrl] tauri shell open failed:', err)
    }
  }
  try { window.open(url, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
}
