export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'zombie_terminated' | 'skipped'

export type JobPriority = 'low' | 'normal' | 'high' | 'critical'

export interface PhaseDefinition {
  key: string
  label: string
  description: string
}

export interface JobSummary {
  id: string
  command: string
  started_at: string
  finished_at?: string | null
  status: JobStatus
  priority?: JobPriority
  total_cost_usd?: number | null
  duration_ms?: number | null
  model?: string | null
  tokens_in?: number | null
  tokens_out?: number | null
  tokens_cache_read?: number | null
  tokens_cache_create?: number | null
  num_turns?: number | null
  depends_on_job_id?: string | null
  pipeline_id?: string | null
  skip_reason?: string | null
  /** True if a telemetry blob (active or compacted) exists for this job */
  hasTelemetry?: boolean
  /** Profile the job ran under (null/undefined = legacy mode) */
  profile_name?: string | null
}

export interface EventRow {
  id: number
  job_id: string
  seq: number
  event_type: string
  source?: string | null
  payload: string
  timestamp: string
}

export interface CommandInfo {
  id: string
  name: string
  description: string
  slug: string
  totalRuns?: number
  lastRunAt?: string | null
}

export interface ProjectConfig {
  project: {
    name: string
    repo: string | null
  }
  issueTracker: {
    github: { available: boolean; authenticated: boolean }
    jira: { available: boolean; authenticated: boolean }
    active: 'github' | 'jira' | null
    labelFilter: string
  }
  commands: CommandInfo[]
  dailyBudgetUsd: number | null
}

export interface IssueItem {
  number: number
  title: string
  labels: string[]
  body: string
  url?: string
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all' | 'custom'

export interface AnalyticsResponse {
  period: {
    label: string
    from: string | null
    to: string | null
  }
  kpi: {
    totalCostUsd: number
    totalJobs: number
    successRate: number
    avgDurationMs: number | null
    totalTokens: number
    costDelta: number | null
    jobsDelta: number | null
    successRateDelta: number | null
    avgDurationDelta: number | null
    totalTokensDelta: number | null
    costDeltaPct: number | null
    jobsDeltaPct: number | null
    successRateDeltaPct: number | null
    avgDurationDeltaPct: number | null
    totalTokensDeltaPct: number | null
    previousPeriod: {
      label: string
      from: string | null
      to: string | null
      totalCostUsd: number
      totalJobs: number
      successRate: number
      avgDurationMs: number | null
      totalTokens: number
    } | null
  }
  costTimeline: Array<{ date: string; costUsd: number }>
  statusBreakdown: Array<{ status: string; count: number }>
  durationHistogram: Array<{ bucket: string; count: number }>
  durationPercentiles: { p50: number | null; p75: number | null; p95: number | null }
  tokenEfficiency: Array<{
    command: string
    tokensOut: number
    tokensCacheRead: number
    totalTokens: number
  }>
  commandPerformance: Array<{
    command: string
    totalRuns: number
    successRate: number
    avgCostUsd: number | null
    avgDurationMs: number | null
    totalCostUsd: number
  }>
  dailyThroughput: Array<{ date: string; completed: number; failed: number; canceled: number }>
  costPerCommand: Array<{ command: string; totalCostUsd: number; jobCount: number }>
  bonusMetrics: {
    costPerSuccess: number | null
    apiEfficiencyPct: number | null
    failureCostUsd: number
    modelBreakdown: Array<{ model: string; jobCount: number; totalCostUsd: number }>
  }
}

export interface HubProjectStats {
  projectId: string
  projectName: string
  totalCostUsd: number
  totalJobs: number
  successRate: number
  avgDurationMs: number | null
}

export interface HubAnalyticsResponse {
  period: {
    label: string
    from: string | null
    to: string | null
  }
  kpi: {
    totalCostUsd: number
    totalJobs: number
    successRate: number
    costToday: number
    jobsToday: number
  }
  projectBreakdown: HubProjectStats[]
  costTimeline: Array<{ date: string; costUsd: number }>
}

export interface ChatConversationSummary {
  id: string
  title: string | null
  model: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// ─── Trends ───────────────────────────────────────────────────────────────────

export type TrendsPeriod = '1d' | '7d' | '30d'

export interface TrendPoint {
  date: string
  jobCount: number
  avgDurationMs: number | null
  avgTokens: number | null
  avgCostUsd: number | null
  successRate: number
}

export interface TrendsResponse {
  period: TrendsPeriod
  points: TrendPoint[]
}

// ─── Job comparison ───────────────────────────────────────────────────────────

export interface JobCompareEntry {
  id: string
  command: string
  status: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  tokensIn: number | null
  tokensOut: number | null
  tokensCacheRead: number | null
  totalCostUsd: number | null
  model: string | null
  phasesCompleted: string[]
}

export interface JobCompareResponse {
  jobs: [JobCompareEntry, JobCompareEntry]
}

// ─── Job Templates ────────────────────────────────────────────────────────────

export interface JobTemplate {
  id: string
  name: string
  description: string | null
  commands: string[]
  created_at: string
  updated_at: string
}

// ─── Local Tickets ───────────────────────────────────────────────────────────

export type TicketStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Attachment {
  id: string
  filename: string
  storedName: string
  mimeType: string
  size: number
  addedAt: string
}

export interface LocalTicket {
  id: number
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: string | null
  prerequisites: number[]
  metadata: {
    vpc_scores?: Record<string, unknown>
    effort_level?: string
    user_story?: string
    area?: string
  }
  attachments?: Attachment[]
  created_at: string
  updated_at: string
  created_by: string
  source: 'manual' | 'product-backlog' | 'propose-spec' | 'get-backlog-specs'
}

