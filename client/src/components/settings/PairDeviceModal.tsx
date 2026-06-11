import { useEffect, useRef, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'

interface QrPayload {
  v: number
  hub: string
  name: string
  addrs: string[]
  port: number
  fp: string
  secret: string
  claimId: string
  exp: number
}

interface PairState {
  status: 'pending' | 'claimed' | 'approved' | 'denied' | 'expired' | 'none'
  device?: { name: string; platform: 'ios' | 'android' }
}

function base64url(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Renders the pairing QR + live claim/approve flow. Polls the loopback admin
 *  API (no WS needed for a short-lived modal). */
export function PairDeviceModal({ open, onClose, onPaired }: { open: boolean; onClose: () => void; onPaired: () => void }) {
  const [qr, setQr] = useState<QrPayload | null>(null)
  const [state, setState] = useState<PairState>({ status: 'none' })
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    stopPolling()
    void fetch('/api/hub/mobile/pairing-session', { method: 'DELETE' }).catch(() => {})
    setQr(null)
    setState({ status: 'none' })
    setError(null)
    onClose()
  }, [onClose, stopPolling])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    fetch('/api/hub/mobile/pairing-session', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { qr: QrPayload }) => {
        if (cancelled) return
        setQr(data.qr)
        setState({ status: 'pending' })
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch('/api/hub/mobile/pairing-session')
            if (!res.ok) return
            const s = (await res.json()) as PairState
            setState(s)
            if (s.status === 'expired' || s.status === 'denied') stopPolling()
          } catch {
            /* transient */
          }
        }, 2000)
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [open, stopPolling])

  async function approve(): Promise<void> {
    try {
      const res = await fetch('/api/hub/mobile/pairing-session/approve', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState({ status: 'approved' })
      stopPolling()
      toast.success('Device paired')
      onPaired()
      setTimeout(close, 1200)
    } catch (e) {
      toast.error(`Approve failed: ${(e as Error).message}`)
    }
  }

  async function deny(): Promise<void> {
    await fetch('/api/hub/mobile/pairing-session/deny', { method: 'POST' }).catch(() => {})
    close()
  }

  const deepLink = qr ? `specrails://pair?d=${base64url(JSON.stringify(qr))}` : ''

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pair a device</DialogTitle>
          <DialogDescription>
            Open SpecRails Companion on your phone and scan this code. It only works while this dialog is open.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">Could not start pairing: {error}</p>}

        {state.status === 'claimed' && state.device ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-center">
              <span className="font-semibold">{state.device.name}</span> ({state.device.platform}) wants to pair.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={deny}>Deny</Button>
              <Button onClick={approve}>Approve</Button>
            </div>
          </div>
        ) : state.status === 'approved' ? (
          <p className="py-6 text-center text-accent-success font-medium">✓ Paired</p>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={deepLink} size={220} />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Waiting for a device… (on {qr.addrs[0] ?? 'this hub'}:{qr.port})
            </p>
            <button
              type="button"
              className="text-xs text-accent-info underline"
              onClick={() => { void navigator.clipboard?.writeText(deepLink); toast.success('Pairing code copied') }}
            >
              Copy code (for "Enter manually")
            </button>
          </div>
        ) : (
          <div className="h-56 bg-muted/30 rounded-lg animate-pulse" />
        )}
      </DialogContent>
    </Dialog>
  )
}
