// Best-effort mDNS/DNS-SD advertising via @homebridge/ciao (pure-JS, RFC
// 6762/6763, Windows-safe). Discovery is a SECONDARY convenience — the QR is the
// primary path — so any failure here is logged and swallowed; the gateway works
// without it. TXT carries only { id, fp } (never a token or a revealing name).

interface CiaoService {
  advertise(): Promise<void>
  end(): Promise<void>
  destroy(): void
}
interface CiaoResponder {
  createService(opts: unknown): CiaoService
  shutdown(): Promise<void>
}

let responder: CiaoResponder | null = null
let service: CiaoService | null = null

export interface MdnsOptions {
  name: string
  port: number
  instanceId: string
  fingerprint: string
}

export async function advertiseMdns(opts: MdnsOptions): Promise<boolean> {
  try {
    const mod = (await import('@homebridge/ciao')) as unknown as {
      getResponder?: () => CiaoResponder
      default?: { getResponder?: () => CiaoResponder }
    }
    const getResponder = mod.getResponder ?? mod.default?.getResponder
    if (!getResponder) return false
    responder = getResponder()
    service = responder.createService({
      name: opts.name,
      type: 'specrailshub',
      port: opts.port,
      txt: { id: opts.instanceId, fp: opts.fingerprint },
    })
    await service.advertise()
    return true
  } catch (err) {
    console.warn('[mobile-mdns] advertise failed (non-fatal):', err instanceof Error ? err.message : err)
    responder = null
    service = null
    return false
  }
}

export async function withdrawMdns(): Promise<void> {
  try {
    if (service) await service.end()
  } catch { /* ignore */ }
  try {
    if (responder) await responder.shutdown()
  } catch { /* ignore */ }
  service = null
  responder = null
}
