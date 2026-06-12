import { useEffect, useRef, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useTranslation, Trans } from 'react-i18next'
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
  hub: string // mobile-app v1 wire compat — do not rename
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
  const { t } = useTranslation('settings')
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
    void fetch('/api/mobile/pairing-session', { method: 'DELETE' }).catch(() => {})
    setQr(null)
    setState({ status: 'none' })
    setError(null)
    onClose()
  }, [onClose, stopPolling])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    fetch('/api/mobile/pairing-session', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { qr: QrPayload }) => {
        if (cancelled) return
        setQr(data.qr)
        setState({ status: 'pending' })
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch('/api/mobile/pairing-session')
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
      const res = await fetch('/api/mobile/pairing-session/approve', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState({ status: 'approved' })
      stopPolling()
      toast.success(t('pairDevice.pairedToast'))
      onPaired()
      setTimeout(close, 1200)
    } catch (e) {
      toast.error(t('pairDevice.approveFailed', { message: (e as Error).message }))
    }
  }

  async function deny(): Promise<void> {
    await fetch('/api/mobile/pairing-session/deny', { method: 'POST' }).catch(() => {})
    close()
  }

  const deepLink = qr ? `specrails://pair?d=${base64url(JSON.stringify(qr))}` : ''

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pairDevice.title')}</DialogTitle>
          <DialogDescription>
            {t('pairDevice.description')}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{t('pairDevice.startFailed', { error })}</p>}

        {state.status === 'claimed' && state.device ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-center">
              <Trans
                ns="settings"
                i18nKey="pairDevice.wantsToPair"
                values={{ name: state.device.name, platform: state.device.platform }}
                components={{ b: <span className="font-semibold" /> }}
              />
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={deny}>{t('pairDevice.deny')}</Button>
              <Button onClick={approve}>{t('pairDevice.approve')}</Button>
            </div>
          </div>
        ) : state.status === 'approved' ? (
          <p className="py-6 text-center text-accent-success font-medium">{t('pairDevice.paired')}</p>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={deepLink} size={220} />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t('pairDevice.waiting', { host: qr.addrs[0] ?? t('pairDevice.thisDesktop'), port: qr.port })}
            </p>
            <button
              type="button"
              className="text-xs text-accent-info underline"
              onClick={() => { void navigator.clipboard?.writeText(deepLink); toast.success(t('pairDevice.codeCopied')) }}
            >
              {t('pairDevice.copyCode')}
            </button>
          </div>
        ) : (
          <div className="h-56 bg-muted/30 rounded-lg animate-pulse" />
        )}
      </DialogContent>
    </Dialog>
  )
}
