import type { Terminal } from '@xterm/xterm'
import { isTauri, _tauriDynImport as dynImport } from './tauri-shell'

export async function saveScrollbackToFile(term: Terminal, suggestedName = 'terminal-scrollback.txt'): Promise<void> {
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  const blob = lines.join('\n')

  if (isTauri()) {
    try {
      const dialog = await import('@tauri-apps/plugin-dialog')
      const path = await dialog.save({ defaultPath: suggestedName })
      if (!path) return
      // fs writeTextFile via the official plugin if available; fall back to the @tauri-apps/api fs.
      try {
        const fs = await dynImport('@tauri-apps/plugin-fs') as { writeTextFile?: (p: string, c: string) => Promise<void> } | null
        if (fs?.writeTextFile) { await fs.writeTextFile(path, blob); return }
      } catch { /* ignore */ }
      try {
        const fs = await dynImport('@tauri-apps/api/fs') as { writeTextFile?: (opts: { path: string; contents: string }) => Promise<void> } | null
        await fs?.writeTextFile?.({ path, contents: blob })
      } catch { /* ignore */ }
      return
    } catch { /* fall through to browser path */ }
  }

  // Browser fallback: trigger an anchor download.
  try {
    const file = new Blob([blob], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch { /* ignore */ }
}
