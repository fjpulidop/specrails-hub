import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
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
  const queryToken = req.query.token

  let provided: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim()
  } else if (typeof hubTokenHeader === 'string') {
    provided = hubTokenHeader.trim()
  } else if (typeof queryToken === 'string') {
    // Query-string token for URLs that cannot set headers (e.g. <a href>, <img src>).
    // Acceptable here because the server binds to 127.0.0.1 only.
    provided = queryToken.trim()
  }

  if (!provided || provided !== token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
