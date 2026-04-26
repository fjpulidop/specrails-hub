import { useEffect, useRef, useState } from 'react'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { toast } from 'sonner'

const DISMISSED_UPDATE_KEY = 'specrails-hub:dismissedDesktopUpdateVersion'
const UPDATE_TOAST_ID = 'specrails-hub-desktop-update'

type UpdateToastState = 'available' | 'downloading' | 'installing' | 'ready' | 'error'

type DesktopUpdate = Pick<Update, 'currentVersion' | 'version'> & {
  isMock?: boolean
  downloadAndInstall: (onEvent: (event: DownloadEvent) => void) => Promise<void>
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isMockUpdateEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.VITE_MOCK_DESKTOP_UPDATE === 'true'
}

function mockUpdateVersion(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.VITE_MOCK_DESKTOP_UPDATE_VERSION || '99.0.0-test'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createMockUpdate(): DesktopUpdate {
  return {
    currentVersion: '1.40.1',
    version: mockUpdateVersion(),
    isMock: true,
    async downloadAndInstall(onEvent) {
      const total = 18 * 1024 * 1024
      const chunks = 12

      onEvent({ event: 'Started', data: { contentLength: total } } as DownloadEvent)
      for (let i = 0; i < chunks; i += 1) {
        await delay(180)
        onEvent({ event: 'Progress', data: { chunkLength: Math.round(total / chunks) } } as DownloadEvent)
      }
      onEvent({ event: 'Finished' } as DownloadEvent)
    },
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY)
  } catch {
    return null
  }
}

function dismissVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_UPDATE_KEY, version)
  } catch {
    // non-fatal; the current toast still dismisses
  }
  toast.dismiss(UPDATE_TOAST_ID)
}

function DesktopUpdateToast({ update }: { update: DesktopUpdate }) {
  const [state, setState] = useState<UpdateToastState>('available')
  const [downloaded, setDownloaded] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function installUpdate() {
    try {
      setState('downloading')
      setDownloaded(0)
      setTotal(null)
      setError(null)

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          setTotal(event.data.contentLength ?? null)
          setDownloaded(0)
          return
        }
        if (event.event === 'Progress') {
          setDownloaded((prev) => prev + event.data.chunkLength)
          return
        }
        setState('installing')
      })

      setState('ready')
    } catch (err) {
      setError((err as Error).message || 'Could not install update')
      setState('error')
    }
  }

  const progress = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null
  const description =
    state === 'available'
      ? `Current ${update.currentVersion} -> ${update.version}`
      : state === 'downloading'
        ? progress == null
          ? `Downloading ${formatBytes(downloaded)}`
          : `Downloading ${progress}% (${formatBytes(downloaded)} of ${formatBytes(total ?? 0)})`
        : state === 'installing'
          ? 'Verifying signature and installing...'
          : state === 'ready'
            ? 'Restart to finish installing the update.'
            : error ?? 'Update failed'

  return (
    <div className="w-[372px] rounded-lg border border-dracula-purple/35 bg-dracula-current/95 p-3 shadow-2xl shadow-black/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-dracula-purple shadow-[0_0_16px_hsl(265_89%_78%)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">SpecRails Hub {update.version} is available</p>
          <p className="mt-1 text-[11px] leading-4 text-dracula-comment">{description}</p>
          {state === 'downloading' && progress != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-dracula-purple transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {state === 'ready' ? (
              <button
                type="button"
                className="rounded-md border border-dracula-purple/40 bg-dracula-purple/20 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-dracula-purple/30"
                onClick={() => {
                  if (update.isMock) {
                    toast.dismiss(UPDATE_TOAST_ID)
                    return
                  }
                  void relaunch()
                }}
              >
                Restart
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md border border-dracula-purple/40 bg-dracula-purple/20 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-dracula-purple/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={state === 'downloading' || state === 'installing'}
                onClick={() => void installUpdate()}
              >
                Update
              </button>
            )}
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[11px] font-medium text-dracula-comment hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state === 'downloading' || state === 'installing'}
              onClick={() => dismissVersion(update.version)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useDesktopUpdateNotifier() {
  const didCheck = useRef(false)

  useEffect(() => {
    const useMockUpdate = isMockUpdateEnabled()
    if (didCheck.current || (!useMockUpdate && !isTauriRuntime())) return
    didCheck.current = true

    async function checkForUpdate() {
      try {
        const update = useMockUpdate ? createMockUpdate() : await check()
        if (!update || readDismissedVersion() === update.version) return

        toast.custom(() => <DesktopUpdateToast update={update} />, {
          id: UPDATE_TOAST_ID,
          duration: Infinity,
          dismissible: false,
        })
      } catch (err) {
        console.warn('[desktop-update] update check failed:', err)
      }
    }

    void checkForUpdate()
  }, [])
}
