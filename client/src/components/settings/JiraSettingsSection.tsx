import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { useDesktop } from '../../hooks/useDesktop'
import { FEATURE_JIRA } from '../../lib/feature-flags'
import { JiraConnectWizard } from '../jira/JiraConnectWizard'
import { jiraApi, type ConnectionState, type OutboxOp } from '../../lib/jira-api'

/**
 * Per-project Jira setup + status surface in the project SettingsPage. Renders
 * the shared step-by-step `JiraConnectWizard` when not connected, and a status
 * card (hot-swap toggle, sync, dead-letter list, disconnect) once connected.
 */
export function JiraSettingsSection() {
  const { t } = useTranslation('jira')
  const { activeProjectId } = useDesktop()

  const [conn, setConn] = useState<ConnectionState | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setConn(await jiraApi.getConnection())
    } catch {
      setConn({ connected: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!FEATURE_JIRA || !activeProjectId) return
    setLoading(true)
    void reload()
  }, [activeProjectId, reload])

  if (!FEATURE_JIRA) return null

  return (
    <Card className="mt-6" data-testid="jira-settings">
      <CardHeader>
        <CardTitle>{t('section.title')}</CardTitle>
        <CardDescription>{t('section.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : conn?.connected && conn.connection ? (
          <JiraConnected state={conn} onChanged={reload} />
        ) : (
          <JiraConnectWizard onConnected={reload} />
        )}
      </CardContent>
    </Card>
  )
}

function JiraConnected({ state, onChanged }: { state: ConnectionState; onChanged: () => void }) {
  const { t } = useTranslation('jira')
  const connection = state.connection!
  const [enabled, setEnabled] = useState(connection.enabled)
  const [syncing, setSyncing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deadOps, setDeadOps] = useState<OutboxOp[]>([])
  const counts = state.outbox ?? { pending: 0, inflight: 0, done: 0, dead: 0 }

  const loadDead = useCallback(async () => {
    try {
      const { ops } = await jiraApi.listOutbox('dead')
      setDeadOps(ops)
    } catch {
      setDeadOps([])
    }
  }, [])

  useEffect(() => {
    void loadDead()
  }, [loadDead])

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    setBusy(true)
    try {
      await jiraApi.setEnabled(next)
    } catch (e) {
      setEnabled(!next)
      toast.error(errMsg(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    try {
      const r = await jiraApi.syncNow()
      toast.success(t('status.syncedToast', { count: r.upserted }))
    } catch (e) {
      toast.error(errMsg(e, t))
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    if (!window.confirm(t('status.disconnectConfirm'))) return
    setBusy(true)
    try {
      await jiraApi.disconnect()
      toast.success(t('status.disconnectedToast'))
      onChanged()
    } catch (e) {
      toast.error(errMsg(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function retry(id: number) {
    try {
      await jiraApi.retryOutbox(id)
      await loadDead()
    } catch (e) {
      toast.error(errMsg(e, t))
    }
  }

  const pending = counts.pending + counts.inflight

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('status.connected', { key: connection.jiraProjectKey })}</p>
          <p className="text-xs text-muted-foreground">
            {connection.baseUrl} · {connection.deployment === 'cloud' ? t('review.cloud') : t('review.dc')}
          </p>
        </div>
        <a href={`${connection.baseUrl}/browse/${connection.jiraProjectKey}`} target="_blank" rel="noreferrer" className="text-xs text-accent-primary hover:underline">
          {t('badge.openInJira')}
        </a>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium">{t('status.enabledLabel')}</p>
          <p className="text-xs text-muted-foreground">{enabled ? t('status.enabledHelp') : t('status.pausedHelp')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('status.enabledLabel')}
          disabled={busy}
          onClick={toggle}
          className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-accent-success' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
          {syncing ? t('status.syncing') : t('status.syncNow')}
        </Button>
        <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy} className="text-destructive">
          {t('status.disconnect')}
        </Button>
      </div>

      <div className="rounded-md border border-border p-3" data-testid="jira-outbox">
        <p className="text-sm font-medium">{t('outbox.title')}</p>
        {counts.dead > 0 ? (
          <p className="mt-1 text-xs text-accent-warning">{t('outbox.dead', { count: counts.dead })}</p>
        ) : pending > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('outbox.pending', { count: pending })}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t('outbox.allSynced')}</p>
        )}
        {deadOps.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">{t('outbox.deadHelp')}</p>
            {deadOps.map((op) => (
              <div key={op.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
                <span className="truncate text-xs">
                  {opLabel(op, t)} · {op.deadReason ?? op.lastError ?? ''}
                </span>
                <Button variant="outline" size="sm" onClick={() => retry(op.id)}>
                  {t('outbox.retry')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function opLabel(op: OutboxOp, t: (k: string) => string): string {
  if (op.opType === 'transition') return t('outbox.opTransition')
  if (op.opType === 'comment') return t('outbox.opComment')
  return t('outbox.opCreate')
}

function errMsg(e: unknown, t: (k: string) => string): string {
  return e instanceof Error ? e.message : t('errors.generic')
}
