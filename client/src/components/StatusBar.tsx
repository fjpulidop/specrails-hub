import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { getApiBase } from '../lib/api'

interface Stats {
  totalJobs: number
  jobsToday: number
  costToday: number
  totalCostUsd: number
}

interface StatusBarProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
}

export function StatusBar({ connectionStatus }: StatusBarProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const prevStatusRef = useRef<'connecting' | 'connected' | 'disconnected'>('connecting')
  const isFirstMount = useRef(true)

  // Detect reconnect: was previously connected/connecting-after-disconnect, now connected again
  useEffect(() => {
    const prev = prevStatusRef.current
    if (connectionStatus === 'connected' && !isFirstMount.current && prev !== 'connected') {
      toast.success('Connection restored')
      setIsSyncing(true)
      const t = setTimeout(() => setIsSyncing(false), 2000)
      return () => clearTimeout(t)
    }
    if (isFirstMount.current && connectionStatus === 'connected') {
      isFirstMount.current = false
    }
    prevStatusRef.current = connectionStatus
  }, [connectionStatus])

  // Mark first mount resolved once we hit any status change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
    }
  }, [])

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${getApiBase()}/stats`)
        if (res.ok) {
          const data = await res.json() as Stats
          setStats(data)
        }
      } catch {
        // ignore
      }
    }

    fetchStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30_000)
    return () => clearInterval(interval)
  }, [connectionStatus])

  return (
    <footer className="h-7 flex items-center justify-between px-4 border-t border-border/30 bg-background/80 backdrop-blur-sm text-[10px] text-muted-foreground">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full transition-colors',
            connectionStatus === 'connected' && !isSyncing && 'bg-dracula-green',
            connectionStatus === 'connected' && isSyncing && 'bg-dracula-cyan animate-pulse',
            connectionStatus === 'connecting' && 'bg-dracula-orange animate-[pulse_0.75s_ease-in-out_infinite]',
            connectionStatus === 'disconnected' && 'bg-dracula-red'
          )}
        />
        <span
          className={cn(
            'transition-colors',
            connectionStatus === 'connected' && !isSyncing && 'text-dracula-green',
            connectionStatus === 'connected' && isSyncing && 'text-dracula-cyan',
            connectionStatus === 'connecting' && 'text-dracula-orange',
            connectionStatus === 'disconnected' && 'text-dracula-red'
          )}
        >
          {connectionStatus === 'connected' && !isSyncing && 'connected'}
          {connectionStatus === 'connected' && isSyncing && 'syncing...'}
          {connectionStatus === 'connecting' && 'reconnecting...'}
          {connectionStatus === 'disconnected' && 'disconnected'}
        </span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4">
          <span>total: {stats.totalJobs} jobs</span>
          {stats.totalCostUsd > 0 && <span>${stats.totalCostUsd.toFixed(2)}</span>}
        </div>
      )}
    </footer>
  )
}
