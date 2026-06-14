import { useEffect } from 'react'

/**
 * Surfaces where the user legitimately expects the NATIVE right-click menu
 * (Cut/Copy/Paste/Select-All/spellcheck, or a library's own menu) and which are
 * therefore EXEMPT from suppression:
 *   - form fields: input / textarea / select
 *   - rich-text editors: [contenteditable]
 *   - Monaco editor (.monaco-editor — applied by Monaco itself)
 *   - xterm.js terminal (.xterm — applied by xterm itself; also has its own menu)
 *   - any future opt-out: [data-native-menu]
 * Library-applied classes (.monaco-editor / .xterm) are used on purpose so the
 * allow-list does not depend on our own (changeable) container class names.
 */
const EXEMPT_SELECTOR =
  'input, textarea, select, ' +
  '[contenteditable="true"], [contenteditable=""], ' +
  '.monaco-editor, .xterm, ' +
  '[data-native-menu]'

/** True when a right-click target should keep the native context menu. */
export function isExemptFromContextMenuSuppression(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest(EXEMPT_SELECTOR) !== null
}

/**
 * Cancel the native context menu unless the target is an exempt surface. Our own
 * custom menus (TicketContextMenu, terminal, rails…) already preventDefault on
 * their element in the bubble phase before this document-level handler runs, so
 * they are unaffected.
 */
export function suppressNativeContextMenu(e: MouseEvent): void {
  if (isExemptFromContextMenuSuppression(e.target)) return
  e.preventDefault()
}

/**
 * Mount once near the App root. Suppresses the native/WebView right-click menu
 * app-wide (the "embedded web page" smell) EXCEPT on exempt surfaces. No-op in
 * dev so Inspect Element stays available while developing; active in production.
 */
export function useSuppressNativeContextMenu(): void {
  useEffect(() => {
    if (import.meta.env.DEV) return
    document.addEventListener('contextmenu', suppressNativeContextMenu)
    return () => document.removeEventListener('contextmenu', suppressNativeContextMenu)
  }, [])
}
