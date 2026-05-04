import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { isTauri } from './tauri-shell'

/**
 * Read clipboard text. In Tauri, uses the native pasteboard via the
 * clipboard-manager plugin (no WebKit "Paste" permission popup on macOS).
 * Outside Tauri, falls back to navigator.clipboard.readText() which on macOS
 * Safari/WebKit will trigger Apple's system Paste prompt.
 */
export async function readClipboardText(): Promise<string | null> {
  if (isTauri()) {
    try {
      const text = await readText()
      return typeof text === 'string' ? text : null
    } catch {
      return null
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText()
      return text || null
    }
  } catch { /* ignore */ }
  return null
}

export async function writeClipboardText(text: string): Promise<boolean> {
  if (isTauri()) {
    try { await writeText(text); return true } catch { return false }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* ignore */ }
  return false
}
