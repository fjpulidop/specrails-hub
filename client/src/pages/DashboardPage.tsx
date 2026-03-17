import { useState, useCallback } from 'react'
import { Lightbulb } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { usePipeline } from '../hooks/usePipeline'
import { useProjectCache } from '../hooks/useProjectCache'
import { CommandGrid } from '../components/CommandGrid'
import { RecentJobs } from '../components/RecentJobs'
import { ImplementWizard } from '../components/ImplementWizard'
import { BatchImplementWizard } from '../components/BatchImplementWizard'
import { FeatureProposalModal } from '../components/FeatureProposalModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import type { CommandInfo, JobSummary } from '../types'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { cn } from '../lib/utils'

export default function DashboardPage() {
  const { activeProjectId } = useHub()
  const { recentJobs } = usePipeline(activeProjectId)
  const [wizardOpen, setWizardOpen] = useState<string | null>(null)
  const [proposalOpen, setProposalOpen] = useState(false)

  const { data: commands } = useProjectCache<CommandInfo[]>({
    namespace: 'commands',
    projectId: activeProjectId,
    initialValue: [],
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/config`)
      if (!res.ok) return []
      const data = await res.json() as { commands: CommandInfo[] }
      return data.commands
    },
  })

  const { data: rawJobs, isFirstLoad: isLoadingJobs, refresh: refreshJobs } = useProjectCache<JobSummary[]>({
    namespace: 'jobs',
    projectId: activeProjectId,
    initialValue: recentJobs,
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/jobs?limit=10`)
      if (!res.ok) return []
      const data = await res.json() as { jobs: JobSummary[] }
      return data.jobs
    },
    pollInterval: 10_000,
  })

  // Fetch proposals and merge into jobs list
  const { data: proposals } = useProjectCache<Array<{ id: string; idea: string; status: string; created_at: string; issue_url: string | null }>>({
    namespace: 'proposals',
    projectId: activeProjectId,
    initialValue: [],
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/propose?limit=10`)
      if (!res.ok) return []
      const data = await res.json() as { proposals: Array<{ id: string; idea: string; status: string; created_at: string; issue_url: string | null }> }
      return data.proposals
    },
    pollInterval: 10_000,
  })

  const PROPOSAL_STATUS_MAP: Record<string, JobSummary['status']> = {
    input: 'queued',
    exploring: 'running',
    review: 'completed',
    refining: 'running',
    creating_issue: 'running',
    created: 'completed',
    cancelled: 'canceled',
  }

  const proposalJobs: JobSummary[] = proposals.map((p) => ({
    id: `proposal:${p.id}`,
    command: `/sr:propose-feature ${p.idea.length > 60 ? p.idea.slice(0, 57) + '...' : p.idea}`,
    started_at: p.created_at,
    status: PROPOSAL_STATUS_MAP[p.status] ?? 'queued',
  }))

  const jobs = [...rawJobs, ...proposalJobs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )

  // ─── Proposal detail dialog ──────────────────────────────────────────────
  const [detailProposal, setDetailProposal] = useState<{
    id: string; idea: string; status: string; result_markdown: string | null; issue_url: string | null; created_at: string
  } | null>(null)

  const handleProposalClick = useCallback(async (proposalId: string) => {
    try {
      const res = await fetch(`${getApiBase()}/propose/${proposalId}`)
      if (!res.ok) return
      const data = await res.json() as { proposal: typeof detailProposal }
      setDetailProposal(data.proposal)
    } catch { /* ignore */ }
  }, [])

  const handleProposalDelete = useCallback(async (proposalId: string) => {
    try {
      const res = await fetch(`${getApiBase()}/propose/${proposalId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Proposal deleted')
        refreshJobs()
      }
    } catch { /* ignore */ }
  }, [refreshJobs])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Feature Discovery
        </h2>
        <button
          type="button"
          onClick={() => setProposalOpen(true)}
          className={cn(
            'w-full flex items-center gap-3 p-4 rounded-lg border border-border/30 text-left glass-card',
            'hover:border-dracula-purple/40 hover:bg-dracula-current/30 transition-all active:scale-[0.98]'
          )}
        >
          <div className="w-8 h-8 rounded-md bg-dracula-purple/20 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-dracula-purple" />
          </div>
          <div>
            <p className="text-sm font-medium">Propose a Feature</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Describe an idea — Claude will structure it into a GitHub Issue
            </p>
          </div>
        </button>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Commands
        </h2>
        <CommandGrid
          commands={commands}
          onOpenWizard={(slug) => setWizardOpen(slug)}
        />
      </section>

      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recent Jobs
        </h2>
        <RecentJobs
          jobs={jobs}
          isLoading={isLoadingJobs}
          onJobsCleared={refreshJobs}
          onProposalClick={handleProposalClick}
          onProposalDelete={handleProposalDelete}
        />
      </section>

      <ImplementWizard
        open={wizardOpen === 'implement'}
        onClose={() => setWizardOpen(null)}
      />
      <BatchImplementWizard
        open={wizardOpen === 'batch-implement'}
        onClose={() => setWizardOpen(null)}
      />
      <FeatureProposalModal
        open={proposalOpen}
        onClose={() => setProposalOpen(false)}
      />

      {/* Proposal detail dialog */}
      <Dialog open={detailProposal !== null} onOpenChange={(o) => !o && setDetailProposal(null)}>
        <DialogContent className="max-w-3xl glass-card">
          {detailProposal && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle className="flex-1 min-w-0">Proposal</DialogTitle>
                  <Badge variant={detailProposal.status === 'created' ? 'success' : detailProposal.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {detailProposal.status}
                  </Badge>
                </div>
              </DialogHeader>
              <div className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1 italic">
                {detailProposal.idea}
              </div>
              {detailProposal.result_markdown ? (
                <div className="max-h-[400px] overflow-y-auto rounded-lg px-3 py-2 text-xs bg-muted/40">
                  <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:text-cyan-300 prose-code:text-[10px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded text-foreground/80">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailProposal.result_markdown}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No proposal content yet.</p>
              )}
              {detailProposal.issue_url && (
                <div className="text-xs">
                  GitHub Issue:{' '}
                  <a href={detailProposal.issue_url} target="_blank" rel="noopener noreferrer" className="text-dracula-purple hover:underline">
                    {detailProposal.issue_url}
                  </a>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { handleProposalDelete(detailProposal.id); setDetailProposal(null) }}
                >
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDetailProposal(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
