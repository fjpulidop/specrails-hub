import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCircle2, XCircle, Ban, Zap } from 'lucide-react'
import { cn } from '../lib/utils'
import { useActivity } from '../hooks/useActivity'
import type { ActivityItem } from '../hooks/useActivity'

interface NotificationCenterProps {
  activeProjectId: string | null
}

function getStorageKey(projectId: string): string {
  return `specrails:notifications:${projectId}`
}

function getLastReadAt(projectId: string): string | null {
  try {
    return localStorage.getItem(getStorageKey(projectId))
  } catch {
    return null
  }
}

function setLastReadAt(projectId: string, timestamp: string): void {
  try {
    localStorage.setItem(getStorageKey(projectId), timestamp)
  } catch {
    // ignore
  }
}

function NotifIcon({ type }: { type: ActivityItem['type'] }) {
  switch (type) {
    case 'job_completed':
      return <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
    case 'job_failed':
      return <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
    case 'job_canceled':
      return <Ban className="w-3 h-3 text-muted-foreground flex-shrink-0" />
    default:
      return <Zap className="w-3 h-3 text-blue-500 flex-shrink-0" />
  }
}

function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationCenter({ activeProjectId }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [lastReadAt, setLastReadAtState] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { items } = useActivity({ activeProjectId, limit: 10 })

  useEffect(() => {
    if (!activeProjectId) { setLastReadAtState(null); return }
    setLastReadAtState(getLastReadAt(activeProjectId))
  }, [activeProjectId])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const unreadCount = lastReadAt == null
    ? items.length
    : items.filter((item) => item.timestamp > lastReadAt).length

  function handleOpen() {
    if (!open && activeProjectId) {
      const now = new Date().toISOString()
      setLastReadAt(activeProjectId, now)
      setLastReadAtState(now)
    }
    setOpen((v) => !v)
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Upward dropdown */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-72 rounded-lg border border-border bg-card shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground">Notifications</span>
            {items.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{items.length} recent</span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Bell className="w-4 h-4 opacity-40 mb-1" />
              <p className="text-xs">No recent activity</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={`${item.type}:${item.jobId}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors"
                >
                  <NotifIcon type={item.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-foreground truncate" title={item.jobCommand}>
                      {item.jobCommand}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Inline footer button */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-1 h-5 px-1.5 rounded transition-colors relative',
          open
            ? 'text-foreground bg-accent'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-3 h-3" />
        {unreadCount > 0 && (
          <span className="min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-blue-500 text-white text-[8px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
