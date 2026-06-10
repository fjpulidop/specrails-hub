import { useEffect, useRef, useState, useCallback } from 'react'
import { getHubTokenProtocol } from '../lib/auth'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000]

export function useWebSocket(
  url: string,
  onMessage: (data: unknown) => void
): { connectionStatus: ConnectionStatus } {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = getHubTokenProtocol()
    const ws = protocol ? new WebSocket(url, ['specrails-hub', protocol]) : new WebSocket(url)
    wsRef.current = ws
    setConnectionStatus('connecting')

    ws.onopen = () => {
      retryCountRef.current = 0
      setConnectionStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string)
        onMessageRef.current(parsed)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      const attempt = retryCountRef.current
      if (attempt >= BACKOFF_DELAYS.length) {
        setConnectionStatus('disconnected')
        return
      }
      const delay = BACKOFF_DELAYS[attempt]
      retryCountRef.current += 1
      retryTimeoutRef.current = setTimeout(connect, delay)
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      const ws = wsRef.current
      if (ws) {
        // B24: detach handlers BEFORE close(). Otherwise this intentional close
        // fires ws.onclose, which schedules a setTimeout(connect) reconnect after
        // the component has unmounted — a leaked ghost socket. StrictMode's
        // mount→unmount→mount double-invoke triggers this on every mount.
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
      wsRef.current = null
    }
  }, [connect])

  return { connectionStatus }
}
