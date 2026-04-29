import { isTauri, _tauriDynImport as dynImport } from './tauri-shell'

interface NotifyArgs {
  command: string | null
  exitCode: number | null
  elapsedMs: number
}

const debounce = new Map<string, number>()
const DEBOUNCE_WINDOW_MS = 5_000

export function shouldNotify(): boolean {
  return typeof document !== 'undefined' && !document.hasFocus()
}

export async function notifyCommandFinished(sessionId: string, args: NotifyArgs): Promise<void> {
  const key = `${sessionId}:${args.command ?? ''}`
  const now = Date.now()
  const last = debounce.get(key) ?? 0
  if (now - last < DEBOUNCE_WINDOW_MS) return
  debounce.set(key, now)

  const title = args.command ? `${truncate(args.command, 50)} finished` : 'Command finished'
  const body = `exit ${args.exitCode ?? '?'} in ${formatElapsed(args.elapsedMs)}`

  if (isTauri()) {
    try {
      const mod = await dynImport('@tauri-apps/plugin-notification') as null | {
        sendNotification?: (opts: { title: string; body: string }) => Promise<void>
        isPermissionGranted?: () => Promise<boolean>
        requestPermission?: () => Promise<string>
      }
      if (mod?.sendNotification) {
        let granted = (await mod.isPermissionGranted?.()) ?? true
        if (!granted) {
          const perm = await mod.requestPermission?.()
          granted = perm === 'granted'
        }
        if (granted) { await mod.sendNotification({ title, body }); return }
      }
    } catch { /* fall through */ }
  }

  // Browser fallback.
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied')
      if (perm !== 'granted') return
    }
    if (Notification.permission !== 'granted') return
    new Notification(title, { body })
  } catch { /* ignore */ }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}
