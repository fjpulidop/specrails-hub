import { useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { GitBranch } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { usePipeline } from '../hooks/usePipeline'
import { useProjectCache } from '../hooks/useProjectCache'
import { useSectionPreferences, type SectionId } from '../hooks/useSectionPreferences'
import { CommandGrid } from '../components/CommandGrid'
import { RecentJobs } from '../components/RecentJobs'
import { ImplementWizard } from '../components/ImplementWizard'
import { BatchImplementWizard } from '../components/BatchImplementWizard'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { HealthIndicatorBadge } from '../components/HealthIndicatorBadge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import type { CommandInfo, JobSummary, JobTemplate } from '../types'
import { getApiBase } from '../lib/api'
import { useHub } from '../hooks/useHub'
import { ProjectHealthWidget } from '../components/ProjectHealthWidget'
import { TemplateLibrary } from '../components/TemplateLibrary'
import { ExportDropdown } from '../components/ExportDropdown'


const SECTION_TITLES: Record<SectionId, string> = {
  health: 'Project Health',
  commands: 'Commands',
  runbooks: 'Runbooks',
  jobs: 'Recent Jobs',
}

export default function DashboardPage() {
  const { activeProjectId } = useHub()
  const { recentJobs } = usePipeline(activeProjectId)
  const [wizardOpen, setWizardOpen] = useState<string | null>(null)

  // Section preferences (order, pin, expand state)
  const { order, reorder, togglePin, isPinned, toggleExpanded, isExpanded } = useSectionPreferences()

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as SectionId)
      const newIndex = order.indexOf(over.id as SectionId)
      reorder(arrayMove(order, oldIndex, newIndex))
    }
  }

  const { data: commands, isFirstLoad: isLoadingCommands } = useProjectCache<CommandInfo[]>({
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

  const { data: templates, isFirstLoad: isLoadingTemplates, refresh: refreshTemplates } = useProjectCache<JobTemplate[]>({
    namespace: 'templates',
    projectId: activeProjectId,
    initialValue: [],
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/templates`)
      if (!res.ok) return []
      const data = await res.json() as { templates: JobTemplate[] }
      return data.templates
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

  // Per-command stats derived from the recent jobs already in state
  const enrichedCommands = useMemo(() => {
    const statsMap: Record<string, { totalRuns: number; lastRunAt: string | null }> = {}
    for (const job of rawJobs) {
      const match = job.command.match(/^\/sr:([^\s]+)/)
      if (!match) continue
      const slug = match[1]
      if (!statsMap[slug]) statsMap[slug] = { totalRuns: 0, lastRunAt: null }
      statsMap[slug].totalRuns += 1
      if (!statsMap[slug].lastRunAt || job.started_at > statsMap[slug].lastRunAt!) {
        statsMap[slug].lastRunAt = job.started_at
      }
    }
    return commands.map((cmd) => ({ ...cmd, ...statsMap[cmd.slug] }))
  }, [commands, rawJobs])

  const PROPOSAL_STATUS_MAP: Record<string, JobSummary['status']> = {
    input: 'queued',
    exploring: 'running',
    review: 'running',
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

  // ─── Section renderers ───────────────────────────────────────────────────

  function renderSectionContent(sectionId: SectionId) {
    switch (sectionId) {
      case 'health':
        return <ProjectHealthWidget />
      case 'commands':
        return (
          <>
            {isLoadingCommands ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <CommandGrid
                commands={enrichedCommands}
                onOpenWizard={(slug) => setWizardOpen(slug)}
              />
            )}
            <div className="flex justify-end mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardOpen('pipeline')}
                className="text-xs"
              >
                <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                Create Pipeline
              </Button>
            </div>
          </>
        )
      case 'runbooks':
        return (
          <TemplateLibrary
            templates={templates}
            isLoading={isLoadingTemplates}
            onTemplatesChanged={refreshTemplates}
          />
        )
      case 'jobs':
        return (
          <RecentJobs
            jobs={jobs}
            isLoading={isLoadingJobs}
            onJobsCleared={refreshJobs}
            onProposalClick={handleProposalClick}
            onProposalDelete={handleProposalDelete}
          />
        )
    }
  }

  function getSectionIndicator(sectionId: SectionId) {
    if (sectionId === 'health') return <HealthIndicatorBadge />
    return undefined
  }

  function getSectionTrailing(sectionId: SectionId) {
    if (sectionId === 'jobs') {
      return (
        <ExportDropdown
          baseUrl={`${getApiBase()}/jobs/export`}
          label="Export Jobs"
        />
      )
    }
    return undefined
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((sectionId) => (
            <CollapsibleSection
              key={sectionId}
              id={sectionId}
              title={SECTION_TITLES[sectionId]}
              indicator={getSectionIndicator(sectionId)}
              expanded={isExpanded(sectionId)}
              pinned={isPinned(sectionId)}
              onToggleExpand={() => toggleExpanded(sectionId)}
              onTogglePin={() => togglePin(sectionId)}
              trailing={getSectionTrailing(sectionId)}
            >
              {renderSectionContent(sectionId)}
            </CollapsibleSection>
          ))}
        </SortableContext>
      </DndContext>

      <ImplementWizard
        open={wizardOpen === 'implement'}
        onClose={() => setWizardOpen(null)}
      />
      <BatchImplementWizard
        open={wizardOpen === 'batch-implement'}
        onClose={() => setWizardOpen(null)}
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
