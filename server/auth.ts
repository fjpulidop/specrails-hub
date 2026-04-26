import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
import type { Request, Response, NextFunction } from 'express'

const TOKEN_DIR = path.join(os.homedir(), '.specrails')
const TOKEN_PATH = path.join(TOKEN_DIR, 'hub.token')

let _token: string | null = null

/**
 * Loads an existing API token from disk, or generates and persists a new one.
 * Returns the same token for the lifetime of the process.
 */
export function loadOrGenerateToken(): string {
  if (_token) return _token

  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const t = fs.readFileSync(TOKEN_PATH, 'utf-8').trim()
      if (t && t.length >= 32) {
        _token = t
        return _token
      }
    }
  } catch {
    // Fall through to generate a new token
  }

  _token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')

  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true })
    fs.writeFileSync(TOKEN_PATH, _token, { encoding: 'utf-8', mode: 0o600 })
  } catch (err) {
    console.warn('[auth] could not persist token to disk:', err)
  }

  return _token
}

/** Returns the server token (for use in tests or the CLI). */
export function getServerToken(): string {
  return loadOrGenerateToken()
}

/**
 * Resets the in-memory token cache (for tests only).
 * @internal
 */
export function _resetTokenForTest(): void {
  _token = null
}

/**
 * Express middleware that requires a valid Bearer or X-Hub-Token header.
 * Returns 401 for missing or invalid tokens.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = loadOrGenerateToken()

  const authHeader = req.headers['authorization']
  const hubTokenHeader = req.headers['x-hub-token']

  let provided: string | null = null

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim()
  } else if (typeof hubTokenHeader === 'string') {
    provided = hubTokenHeader.trim()
  }

  if (!provided || provided !== token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}

/**
 * Extracts the hub token from a WebSocket upgrade request.
 *
 * Browsers cannot set custom headers for WebSocket upgrades, so the frontend
 * sends the token as a subprotocol: `hub-token.<token>`. The CLI can use the
 * standard Authorization header.
 */
export function tokenFromUpgradeRequest(request: IncomingMessage): string | null {
  const authHeader = request.headers.authorization
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const protocolHeader = request.headers['sec-websocket-protocol']
  if (typeof protocolHeader !== 'string') return null

  for (const part of protocolHeader.split(',')) {
    const protocol = part.trim()
    if (protocol.startsWith('hub-token.')) {
      return protocol.slice('hub-token.'.length).trim()
    }
  }
  return null
}
