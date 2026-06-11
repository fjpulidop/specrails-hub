import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Smartphone, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { PairDeviceModal } from './PairDeviceModal'

interface MobileStatus {
  enabled: boolean
  running: boolean
  port: number
  certFingerprint: string | null
  lanAddresses: string[]
  mdnsEnabled: boolean
  hubName: string
}

interface MobileDevice {
  id: string
  name: string
  platform: 'ios' | 'android'
  createdAt: string
  lastSeenAt: string | null
  revoked: boolean
}

const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)

function shortFp(fp: string | null): string {
  if (!fp || fp.length < 16) return fp ?? '—'
  return `${fp.slice(0, 8)}…${fp.slice(-8)}`
}

/** Hub-wide "Mobile companion" settings: enable the gateway, pair/revoke devices,
 *  rotate the cert identity. Loopback + auth enforced server-side. */
export function MobileAccessSection() {
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [busy, setBusy] = useState(false)
  const [pairOpen, setPairOpen] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/hub/mobile/status')
      if (r.ok) setStatus((await r.json()) as MobileStatus)
    } catch { /* ignore */ }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const r = await fetch('/api/hub/mobile/devices')
      if (r.ok) setDevices(((await r.json()) as { devices: MobileDevice[] }).devices)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void loadStatus()
    void loadDevices()
  }, [loadStatus, loadDevices])

  async function toggleEnabled(): Promise<void> {
    if (!status) return
    setBusy(true)
    try {
      const path = status.enabled ? 'disable' : 'enable'
      const r = await fetch(`/api/hub/mobile/${path}`, { method: 'POST' })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${r.status}`)
      }
      setStatus((await r.json()) as MobileStatus)
    } catch (e) {
      toast.error(`Could not ${status.enabled ? 'disable' : 'enable'} mobile access: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string): Promise<void> {
    await fetch(`/api/hub/mobile/devices/${id}`, { method: 'DELETE' }).catch(() => {})
    void loadDevices()
  }

  async function resetIdentity(): Promise<void> {
    if (!window.confirm('Reset the mobile identity? Every paired device will be revoked and must pair again.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/hub/mobile/cert/rotate', { method: 'POST' })
      if (r.ok) setStatus((await r.json()) as MobileStatus)
      void loadDevices()
      toast.success('Mobile identity reset')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Smartphone className="h-3.5 w-3.5" /> Mobile companion
      </h3>
      <p className="text-sm text-muted-foreground">
        Control this hub from the SpecRails Companion app on your phone, 100% over your local network. Off by default.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <div className="text-sm font-medium">{status.enabled ? 'Mobile access on' : 'Mobile access off'}</div>
          <div className="text-xs text-muted-foreground">
            {status.running ? `Listening on port ${status.port}` : 'Not listening'}
          </div>
        </div>
        <Button variant={status.enabled ? 'outline' : 'default'} disabled={busy} onClick={toggleEnabled}>
          {status.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>

      {status.enabled && status.running && (
        <>
          <div className="flex items-center justify-between">
            <Button onClick={() => setPairOpen(true)} className="gap-2">
              <Smartphone className="h-4 w-4" /> Pair device
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-accent-success" />
              <span title={status.certFingerprint ?? ''}>{shortFp(status.certFingerprint)}</span>
              <button type="button" className="underline" onClick={resetIdentity} disabled={busy}>Reset</button>
            </div>
          </div>

          {isWindows && (
            <p className="text-xs text-accent-warning">
              Windows Firewall will ask to allow the SpecRails server on first enable — choose “Allow on private networks”.
            </p>
          )}

          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">Paired devices</div>
            {devices.filter((d) => !d.revoked).length === 0 ? (
              <div className="text-xs text-muted-foreground">No devices paired yet.</div>
            ) : (
              devices.filter((d) => !d.revoked).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-sm">
                    {d.name} <span className="text-xs text-muted-foreground">· {d.platform}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Revoke ${d.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => revoke(d.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <PairDeviceModal open={pairOpen} onClose={() => setPairOpen(false)} onPaired={loadDevices} />
    </div>
  )
}
