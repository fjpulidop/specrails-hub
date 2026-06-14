import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Plug } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { FEATURE_JIRA } from '../../lib/feature-flags'
import { jiraApi, type ConnectionState } from '../../lib/jira-api'
import { JiraConnectWizard } from './JiraConnectWizard'
import { JiraConnectedCard } from './JiraConnectedCard'

/**
 * Jira integration card for the Integrations section. Shown for every project
 * (Claude and Codex — Jira is provider-agnostic). Not connected → a Connect
 * button that opens the step-by-step wizard in a modal; on success the card
 * flips to a "Connected" state with a Manage modal (toggle, sync, disconnect).
 */
export function JiraIntegrationCard({ activeProjectId }: { activeProjectId: string | null }) {
  const { t } = useTranslation('integrations')
  const [conn, setConn] = useState<ConnectionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

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

  const connected = !!(conn?.connected && conn.connection)

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3" data-testid="jira-integration-card">
      <div className="flex items-start gap-2">
        <div className="grid place-items-center w-9 h-9 rounded-md bg-accent-info/15 text-accent-info shrink-0">
          <Plug className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t('jiraCard.title')}</h3>
            {connected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-success/20 text-accent-success flex items-center gap-1" data-testid="jira-connected-badge">
                <CheckCircle2 className="w-3 h-3" /> {t('jiraCard.connected')}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{t('jiraCard.category')}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {connected && conn?.connection
          ? t('jiraCard.connectedDescription', { key: conn.connection.jiraProjectKey })
          : t('jiraCard.description')}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-1">
        {loading ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : connected ? (
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)} data-testid="jira-manage-btn">
            {t('jiraCard.manage')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setWizardOpen(true)} data-testid="jira-connect-btn">
            <Plug className="w-3.5 h-3.5 mr-1" />
            {t('jiraCard.connect')}
          </Button>
        )}
      </div>

      {/* Connect wizard modal */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('jiraCard.modalTitle')}</DialogTitle>
          </DialogHeader>
          <JiraConnectWizard
            onConnected={() => { setWizardOpen(false); void reload() }}
            onSkip={() => setWizardOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Manage (connected) modal */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('jiraCard.manageTitle')}</DialogTitle>
          </DialogHeader>
          {conn?.connected && conn.connection && (
            <JiraConnectedCard
              state={conn}
              onChanged={() => { void reload().then(() => setManageOpen(false)) }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
