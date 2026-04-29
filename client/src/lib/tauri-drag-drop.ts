import type { Terminal } from '@xterm/xterm'
import { isTauri } from './tauri-shell'
import { quotePathList } from './shell-quote'

export interface DragDropController {
  dispose: () => void
}

/**
 * Register a Tauri webview drag-drop listener. On drop, hit-test the drop
 * coordinates against the active viewport's bounding rect; if inside, pass the
 * shell-quoted paths to the active terminal via `term.paste`. Outside Tauri,
 * this function is a silent no-op.
 *
 * `getActive` returns the active session's `{ term, viewportEl }` or null when
 * no session is active.
 */
export async function registerTauriDragDrop(
  getActive: () => { term: Terminal; viewportEl: HTMLElement } | null,
): Promise<DragDropController> {
  if (!isTauri()) return { dispose: () => {} }
  let unlisten: (() => void) | null = null
  try {
    // Use indirected dynamic import so Vite's static analyser doesn't try to
    // resolve a path that may not exist in plain-browser dev bundles.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const mod = await ((new Function('s', 'return import(s)') as (s: string) => Promise<unknown>)('@tauri-apps/api/webview').catch(() => null))
    const getCurrentWebview = (mod as unknown as { getCurrentWebview?: () => unknown })?.getCurrentWebview
    const wv = getCurrentWebview ? getCurrentWebview() : null
    if (!wv) return { dispose: () => {} }
    const onDragDropEvent = (wv as unknown as {
      onDragDropEvent?: (cb: (ev: { payload: { type: string; paths?: string[]; position?: { x: number; y: number } } }) => void) => Promise<() => void>
    }).onDragDropEvent
    if (typeof onDragDropEvent !== 'function') return { dispose: () => {} }

    const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')

    const cb = (ev: { payload: { type: string; paths?: string[]; position?: { x: number; y: number } } }) => {
      const payload = ev.payload
      if (!payload || payload.type !== 'drop') return
      const paths = payload.paths
      if (!paths || paths.length === 0) return
      const active = getActive()
      if (!active) return
      const rect = active.viewportEl.getBoundingClientRect()
      const pos = payload.position
      if (!pos) return
      // Tauri reports positions in physical pixels; convert assuming the same
      // device pixel ratio as the rect (which is in CSS px).
      const x = pos.x / window.devicePixelRatio
      const y = pos.y / window.devicePixelRatio
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return
      const text = quotePathList(paths, isWindows)
      try { active.term.paste(text) } catch { /* ignore */ }
    }
    unlisten = await onDragDropEvent(cb)
    return { dispose: () => { try { unlisten?.() } catch { /* ignore */ } } }
  } catch {
    return { dispose: () => {} }
  }
}
