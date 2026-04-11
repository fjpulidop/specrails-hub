import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getApiBase } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ChevronRight, Home, RotateCcw } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import { PipelineProgress } from '../components/PipelineProgress'
import { JobCompletionSummary } from '../components/JobCompletionSummary'
import { LogViewer } from '../components/LogViewer'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import type { JobSummary, EventRow, PhaseDefinition } from '../types'
import type { PhaseMap, PhaseState } from '../hooks/usePipeline'
import { useHub } from '../hooks/useHub'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'running' | 'queued' | 'failed' | 'canceled'

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string; tooltip: string }> = {
  running: { variant: 'running', label: 'running', tooltip: 'Job is actively executing' },
  completed: { variant: 'success', label: 'completed', tooltip: 'Job completed successfully' },
  failed: { variant: 'failed', label: 'failed', tooltip: 'Job exited with a non-zero code' },
  canceled: { variant: 'canceled', label: 'canceled', tooltip: 'Job was manually canceled' },
  queued: { variant: 'queued', label: 'queued', tooltip: 'Job is waiting in the queue' },
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { activeProjectId } = useHub()
  const navigate = useNavigate()
  const [job, setJob] = useState<JobSummary | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [phaseDefinitions, setPhaseDefinitions] = useState<PhaseDefinition[]>([])
  const [phases, setPhases] = useState<PhaseMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Reset and re-fetch when project or job id changes
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setJob(null)
    setEvents([])
    setPhaseDefinitions([])
    setPhases({})
    setIsLoading(true)
    setNotFound(false)

    async function loadJob() {
      try {
        const res = await fetch(`${getApiBase()}/jobs/${id}`, { signal: controller.signal })
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (!res.ok) throw new Error('Failed to fetch job')
        const data = await res.json() as { job: JobSummary; events: EventRow[] }
        setJob(data.job)
        setEvents(data.events)
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return
        setNotFound(true)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }
    loadJob()
    return () => controller.abort()
  }, [id, activeProjectId])

  // Subscribe to live WebSocket updates for this job
  const activeProjectRef = useRef(activeProjectId)
  activeProjectRef.current = activeProjectId

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; projectId?: string } & Record<string, unknown>

    // Filter by active project
    if (activeProjectRef.current && msg.projectId && msg.projectId !== activeProjectRef.current) {
      return
    }

    if (msg.type === 'init') {
      const defs = (msg.phaseDefinitions ?? []) as PhaseDefinition[]
      setPhaseDefinitions(defs)
      const initPhases: PhaseMap = {}
      for (const def of defs) {
        initPhases[def.key] = ((msg.phases as Record<string, string>)?.[def.key] as PhaseState) ?? 'idle'
      }
      setPhases(initPhases)
    } else if (msg.type === 'log' && msg.processId === id) {
      // Live log lines — the server also emits 'event' messages for the same
      // content but those are redundant during streaming (they're useful for
      // the initial DB load where 'log' messages aren't stored separately).
      const syntheticEvent: EventRow = {
        id: Date.now(),
        job_id: id ?? '',
        seq: 0,
        event_type: 'log',
        source: msg.source as string,
        payload: JSON.stringify({ line: msg.line }),
        timestamp: msg.timestamp as string,
      }
      setEvents((prev) => {
        const next = [...prev, syntheticEvent]
        // Cap at 10,000 entries — keep the last 8,000 to avoid unbounded growth
        return next.length > 10000 ? next.slice(next.length - 8000) : next
      })
    } else if (msg.type === 'phase') {
      const phaseName = msg.phase as string
      const phaseState = msg.state as PhaseState
      setPhases((prev) => ({ ...prev, [phaseName]: phaseState }))
    } else if (msg.type === 'queue') {
      // Refresh job status from queue state
      const jobs = msg.jobs as Array<{ id: string; status: string }> | undefined
      const matchingJob = jobs?.find((j) => j.id === id)
      if (matchingJob) {
        setJob((prev) => prev ? { ...prev, status: matchingJob.status as JobSummary['status'] } : prev)
      }
    }
  }, [id])

  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  useEffect(() => {
    registerHandler(`job-detail-${id}`, handleMessage)
    return () => unregisterHandler(`job-detail-${id}`)
  }, [id, handleMessage, registerHandler, unregisterHandler])

  async function handleCancel() {
    if (!id) return
    try {
      const res = await fetch(`${getApiBase()}/jobs/${id}`, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === 'deleted') {
          toast.success('Job deleted')
          navigate('/jobs')
        } else {
          toast.success('Cancel signal sent', { description: 'Job will stop at the next safe point' })
        }
      } else {
        const data = await res.json() as { error?: string }
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    }
  }

  async function handleRerun() {
    if (!job) return
    try {
      const res = await fetch(`${getApiBase()}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: job.command }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to spawn job')
      toast.success('Job re-queued')
      navigate(`/jobs/${data.jobId}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-3">
          <div className="h-4 w-48 bg-muted/30 rounded animate-pulse" />
          <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
          <div className="h-64 bg-muted/30 rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  if (notFound || !job) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center gap-3 mt-12">
        <p className="text-lg font-semibold">Job not found</p>
        <p className="text-sm text-muted-foreground">The job ID "{id}" doesn't exist</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <Home className="w-3.5 h-3.5 mr-1.5" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    )
  }

  const statusInfo = STATUS_BADGE[job.status] ?? STATUS_BADGE.queued
  const isRunning = job.status === 'running'
  const isFinished = job.status === 'completed' || job.status === 'failed'

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Home className="w-3 h-3" />
            Dashboard
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-mono">Job #{id?.slice(0, 8)}</span>
        </div>

        {/* Job info */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{statusInfo.tooltip}</TooltipContent>
              </Tooltip>
              <code className="text-sm font-mono text-foreground/90 truncate">{job.command}</code>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>Started {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}</span>
              {job.model && <span className="text-muted-foreground/40">{job.model}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isFinished && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRerun}
                    className="h-7"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Re-execute
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Spawn a new job with the same command
                </TooltipContent>
              </Tooltip>
            )}
            {isRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="h-7 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    Cancel Job
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Send SIGTERM to the running process. The job will be marked as canceled.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Pipeline progress */}
        <PipelineProgress phases={phases} phaseDefinitions={phaseDefinitions} />
      </div>

      {/* Completion summary — only shown when job has finished */}
      {(job.status === 'completed' || job.status === 'failed') && (
        <JobCompletionSummary
          job={job}
          events={events}
          defaultOpen={job.status === 'completed'}
        />
      )}

      {/* Log viewer */}
      <div className="flex-1 overflow-hidden relative">
        <LogViewer events={events} />
      </div>
    </div>
  )
}
