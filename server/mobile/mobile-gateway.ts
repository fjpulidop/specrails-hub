import os from 'os'
import https from 'https'
import { randomUUID } from 'crypto'
import express from 'express'
import type { Express } from 'express'
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { DbInstance } from '../db'
import type { WsMessage } from '../types'
import { getHubSetting, setHubSetting } from '../hub-db'
import { loadOrCreateCert, rotateCert, mobileDir, type GatewayCert } from './mobile-tls'
import { PairingManager } from './mobile-pairing'
import { createMobileRouter } from './mobile-router'
import { MobileWsBridge } from './mobile-ws'
import { advertiseMdns, withdrawMdns } from './mobile-mdns'
import { createDevice, hashToken, revokeAllDevices, sweepExpiredDevices } from './mobile-devices'
import { resolveDevice, extractBearer } from './mobile-auth'
import type { MobilePlatform } from './mobile-types'

// Lifecycle owner of the second HTTPS+WSS listener (default :4202), hard-isolated
// from the main hub server. Off by default; started on enable or boot-if-enabled.

const DEFAULT_PORT = 4202
const SETTING = {
  enabled: 'mobile.enabled',
  port: 'mobile.port',
  instanceId: 'mobile.hub_instance_id',
  name: 'mobile.hub_name',
  mdns: 'mobile.mdns_enabled',
  fingerprint: 'mobile.cert_fingerprint',
} as const

export interface MobileGatewayDeps {
  hubDb: DbInstance
  hubPort: number
  broadcast: (msg: WsMessage) => void
  /** Test seams. */
  bindHost?: string
  /** Overrides the `mobile.port` setting (use 0 for an ephemeral test port). */
  port?: number
}

export interface MobileGatewayStatus {
  enabled: boolean
  running: boolean
  port: number
  certFingerprint: string | null
  lanAddresses: string[]
  mdnsEnabled: boolean
  hubName: string
}

function lanAddresses(): string[] {
  const out: string[] = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

export class MobileGateway {
  private readonly _db: DbInstance
  private readonly _hubPort: number
  private readonly _broadcast: (msg: WsMessage) => void
  private readonly _bindHost: string
  private _cert: GatewayCert | null = null
  private _server: https.Server | null = null
  private _wss: WebSocketServer | null = null
  private _bridge: MobileWsBridge | null = null
  private _pairing: PairingManager | null = null
  private _running = false
  private _boundPort = DEFAULT_PORT
  private readonly _portOverride?: number

  constructor(deps: MobileGatewayDeps) {
    this._db = deps.hubDb
    this._hubPort = deps.hubPort
    this._broadcast = deps.broadcast
    this._bindHost = deps.bindHost ?? '0.0.0.0'
    this._portOverride = deps.port
  }

  get pairing(): PairingManager | null {
    return this._pairing
  }
  get bridge(): MobileWsBridge | null {
    return this._bridge
  }
  get running(): boolean {
    return this._running
  }

  private configuredPort(): number {
    if (this._portOverride !== undefined) return this._portOverride
    const raw = getHubSetting(this._db, SETTING.port)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT
  }

  private hubName(): string {
    const v = getHubSetting(this._db, SETTING.name)
    if (v && v.trim()) return v
    try { return os.hostname() } catch { return 'SpecRails Hub' }
  }

  private instanceId(): string {
    let id = getHubSetting(this._db, SETTING.instanceId)
    if (!id) {
      id = randomUUID()
      setHubSetting(this._db, SETTING.instanceId, id)
    }
    return id
  }

  private mdnsEnabled(): boolean {
    return getHubSetting(this._db, SETTING.mdns) !== 'false'
  }

  isEnabledSetting(): boolean {
    return getHubSetting(this._db, SETTING.enabled) === 'true'
  }

  status(): MobileGatewayStatus {
    return {
      enabled: this.isEnabledSetting(),
      running: this._running,
      port: this._running ? this._boundPort : this.configuredPort(),
      certFingerprint: this._cert?.fingerprint ?? getHubSetting(this._db, SETTING.fingerprint) ?? null,
      lanAddresses: lanAddresses(),
      mdnsEnabled: this.mdnsEnabled(),
      hubName: this.hubName(),
    }
  }

  /** Flip the persisted enable flag + (start|stop). */
  async setEnabled(enabled: boolean): Promise<MobileGatewayStatus> {
    setHubSetting(this._db, SETTING.enabled, enabled ? 'true' : 'false')
    if (enabled) await this.start()
    else await this.stop()
    this._broadcast({ type: 'mobile.gateway_state', running: this._running, port: this._boundPort, timestamp: new Date().toISOString() })
    return this.status()
  }

  /** Idempotent. Loads/creates cert, binds the listener, starts the WS bridge. */
  async start(): Promise<void> {
    if (this._running) return
    // Sliding-expiry sweep on each (re)start.
    try { sweepExpiredDevices(this._db) } catch { /* non-fatal */ }

    this._cert = await loadOrCreateCert(mobileDir())
    setHubSetting(this._db, SETTING.fingerprint, this._cert.fingerprint)

    this._pairing = new PairingManager({
      certFingerprint: () => this._cert!.fingerprint,
      hubInstanceId: () => this.instanceId(),
      hubName: () => this.hubName(),
      port: () => this._boundPort,
      lanAddresses,
      createDevice: ({ name, platform, token, certFingerprint }) => {
        const row = createDevice(this._db, { name, platform, tokenHash: hashToken(token), certFingerprint })
        this._broadcast({ type: 'mobile.device_paired', deviceId: row.id, name: row.name, timestamp: new Date().toISOString() })
        return row.id
      },
      onClaimed: (device) => {
        this._broadcast({ type: 'mobile.pair_requested', deviceName: device.name, platform: device.platform, timestamp: new Date().toISOString() })
      },
    })

    const app: Express = express()
    app.use(express.json({ limit: '256kb' }))
    app.use(createMobileRouter({
      db: this._db,
      hubPort: this._hubPort,
      currentFingerprint: () => this._cert!.fingerprint,
      pairing: this._pairing,
    }))

    const server = https.createServer({ cert: this._cert.certPem, key: this._cert.keyPem }, app)
    const wss = new WebSocketServer({ noServer: true })
    const bridge = new MobileWsBridge()
    bridge.start()

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      if ((request.url ?? '').split('?')[0] !== '/mws') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      const token = tokenFromUpgrade(request)
      const device = resolveDevice(this._db, token, this._cert!.fingerprint)
      if (!device) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        bridge.attach(ws as unknown as Parameters<MobileWsBridge['attach']>[0], device.id)
      })
    })

    const port = this.configuredPort()
    await new Promise<void>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException): void => {
        server.removeListener('listening', onListening)
        // EADDRINUSE (or any bind error) must NOT crash the sidecar — surface it.
        reject(new Error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use` : (err.message || 'listen failed')))
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        const addr = server.address()
        this._boundPort = typeof addr === 'object' && addr ? addr.port : port
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, this._bindHost)
    })

    this._server = server
    this._wss = wss
    this._bridge = bridge
    this._running = true

    if (this.mdnsEnabled()) {
      void advertiseMdns({
        name: this.hubName(),
        port: this._boundPort,
        instanceId: this.instanceId(),
        fingerprint: this._cert.fingerprint,
      })
    }
  }

  /** Idempotent teardown. */
  async stop(): Promise<void> {
    await withdrawMdns()
    if (this._bridge) { this._bridge.stop(); this._bridge = null }
    if (this._wss) { try { this._wss.close() } catch { /* ignore */ } this._wss = null }
    if (this._server) {
      await new Promise<void>((resolve) => this._server!.close(() => resolve()))
      this._server = null
    }
    this._running = false
  }

  /** "Reset mobile identity": new cert + revoke every device + relisten. */
  async rotateCert(): Promise<MobileGatewayStatus> {
    await rotateCert(mobileDir())
    revokeAllDevices(this._db)
    const wasRunning = this._running
    if (wasRunning) {
      await this.stop()
      await this.start()
    } else {
      this._cert = await loadOrCreateCert(mobileDir())
      setHubSetting(this._db, SETTING.fingerprint, this._cert.fingerprint)
    }
    this._broadcast({ type: 'mobile.gateway_state', running: this._running, port: this._boundPort, timestamp: new Date().toISOString() })
    return this.status()
  }
}

/** Extract a device token from a /mws upgrade: Authorization header (native
 *  clients can set it) or the `hub-token.<token>` subprotocol carrier. */
function tokenFromUpgrade(request: IncomingMessage): string | null {
  const fake = { headers: request.headers } as unknown as import('express').Request
  const bearer = extractBearer(fake)
  if (bearer) return bearer
  const proto = request.headers['sec-websocket-protocol']
  if (typeof proto === 'string') {
    for (const part of proto.split(',')) {
      const p = part.trim()
      if (p.startsWith('hub-token.')) return p.slice('hub-token.'.length).trim()
    }
  }
  return null
}

export type { MobilePlatform }
