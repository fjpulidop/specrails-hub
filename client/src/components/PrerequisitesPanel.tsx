import { CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { SetupPrerequisite, SetupPrerequisitesStatus } from '../hooks/usePrerequisites'

interface Props {
  status: SetupPrerequisitesStatus | null
  isLoading: boolean
  error: Error | null
  onRefresh?: () => void
  onMoreInfo?: () => void
}

function formatVersionLabel(item: SetupPrerequisite): string {
  if (!item.installed) return 'not installed'
  if (item.executable === false) {
    const where = item.resolvedPath ? ` at ${item.resolvedPath}` : ''
    const why = item.executionError ? ` (${item.executionError})` : ''
    return `found${where} but failed to execute${why}`
  }
  if (!item.meetsMinimum && item.minVersion) {
    return `${item.version ?? 'unknown'} found — needs ${item.minVersion}+`
  }
  return item.version ?? 'installed'
}

export function PrerequisitesPanel({ status, isLoading, error, onRefresh, onMoreInfo }: Props) {
  if (isLoading && !status) {
    return (
      <div
        data-testid="prerequisites-panel"
        data-state="loading"
        className="rounded-lg border border-border/30 bg-background/30 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-muted-foreground/20 animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted-foreground/15 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error && !status) {
    return (
      <div
        data-testid="prerequisites-panel"
        data-state="error"
        className="rounded-lg border border-border/40 bg-background/40 px-3 py-2"
      >
        <p className="text-[11px] text-muted-foreground">
          Could not verify developer tools locally — install will validate.
        </p>
      </div>
    )
  }

  if (!status) return null

  if (status.ok) {
    return (
      <div
        data-testid="prerequisites-panel"
        data-state="ok"
        className="rounded-lg border border-accent-success/25 bg-accent-success/5 px-3 py-2"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-accent-success flex-shrink-0" />
            <p className="text-xs font-medium text-foreground">All required tools detected</p>
          </div>
          {onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 px-2 gap-1.5 text-[11px] flex-shrink-0"
            >
              <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>
      </div>
    )
  }

  // status.ok === false
  const missingCount = status.missingRequired?.length ?? 0

  return (
    <div
      data-testid="prerequisites-panel"
      data-state="missing"
      className="rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-accent-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              {missingCount} developer tool{missingCount === 1 ? '' : 's'} required
            </p>
            <p className="text-[11px] text-muted-foreground">
              Install the missing tools to continue.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onMoreInfo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoreInfo}
              className="h-7 px-2 gap-1.5 text-[11px]"
              data-testid="prerequisites-more-info"
            >
              More info
            </Button>
          )}
          {onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 px-2 gap-1.5 text-[11px]"
            >
              <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {status.prerequisites.map((item) => {
          const ok = item.installed && item.meetsMinimum
          return (
            <li
              key={item.key}
              data-testid={`prereq-row-${item.key}`}
              data-ok={ok ? 'true' : 'false'}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]',
                ok
                  ? 'border-border/30 bg-background/30 text-muted-foreground'
                  : 'border-accent-primary/30 bg-background/50 text-foreground',
              )}
            >
              {ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-accent-success flex-shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
              )}
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground">— {formatVersionLabel(item)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
