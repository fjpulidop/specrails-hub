export type PhaseName = string
export type PhaseState = 'idle' | 'running' | 'done' | 'error'

export interface PhaseDefinition {
  key: string
  label: string
  description: string
}

// ─── ProjectRow (hub-level) — re-exported from hub-db for WS message use ─────

import type { ProjectRow } from './hub-db'
export type { ProjectRow }

// ─── ProposalRow re-export ────────────────────────────────────────────────────

export type { ProposalRow } from './db'

export interface LogMessage {
  type: 'log'
  source: 'stdout' | 'stderr'
  line: string
  timestamp: string
  processId: string
  projectId?: string
}

export interface PhaseMessage {
  type: 'phase'
  phase: PhaseName
  state: PhaseState
  timestamp: string
  projectId?: string
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'zombie_terminated' | 'skipped'

export type JobPriority = 'low' | 'normal' | 'high' | 'critical'

export const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
}

export const VALID_PRIORITIES = new Set<string>(['low', 'normal', 'high', 'critical'])

export interface JobRow {
  id: string
  command: string
  started_at: string
  finished_at: string | null
  status: JobStatus
  exit_code: number | null
  queue_position: number | null
  priority: JobPriority
  tokens_in: number | null
  tokens_out: number | null
  tokens_cache_read: number | null
  tokens_cache_create: number | null
  total_cost_usd: number | null
  num_turns: number | null
  model: string | null
  duration_ms: number | null
  duration_api_ms: number | null
  session_id: string | null
  depends_on_job_id: string | null
  pipeline_id: string | null
  skip_reason: string | null
}

export interface EventRow {
  id: number
  job_id: string
  seq: number
  event_type: string
  source: string | null
  payload: string
  timestamp: string
}

export interface StatsRow {
  totalJobs: number
  failedJobs: number
  jobsToday: number
  totalCostUsd: number
  costToday: number
  avgDurationMs: number | null
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all' | 'custom'

export interface AnalyticsOpts {
  period: AnalyticsPeriod
  from?: string
  to?: string
}

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

// ─── Trends ──────────────────────────────────────────────────────────────────

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
  status: JobStatus
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

export interface ChatConversationRow {
  id: string
  title: string | null
  model: string
  session_id: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessageRow {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ActivityItem {
  id: string
  type: 'job_started' | 'job_completed' | 'job_failed' | 'job_canceled'
  jobId: string
  jobCommand: string
  timestamp: string
  summary: string
  costUsd: number | null
}

export interface JobSummary {
  id: string
  command: string
  started_at: string
  status: JobStatus
  total_cost_usd: number | null
}

export interface Job {
  id: string
  command: string
  status: JobStatus
  queuePosition: number | null
  priority: JobPriority
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  dependsOnJobId: string | null
  pipelineId: string | null
  skipReason: string | null
  resultText: string | null
}

export interface QueueMessage {
  type: 'queue'
  jobs: Job[]
  activeJobId: string | null
  paused: boolean
  timestamp: string
  projectId?: string
}

export interface InitMessage {
  type: 'init'
  projectName: string
  phases: Record<PhaseName, PhaseState>
  phaseDefinitions: PhaseDefinition[]
  logBuffer: LogMessage[]
  recentJobs: JobSummary[]
  queue: {
    jobs: Job[]
    activeJobId: string | null
    paused: boolean
  }
  projectId?: string
}

export interface EventMessage {
  type: 'event'
  jobId: string
  event_type: string
  source: string
  payload: string
  timestamp: string
  seq: number
  projectId?: string
}

export interface ChatStreamMessage {
  type: 'chat_stream'
  conversationId: string
  delta: string
  timestamp: string
  projectId?: string
}

export interface ChatDoneMessage {
  type: 'chat_done'
  conversationId: string
  fullText: string
  timestamp: string
  projectId?: string
}

export interface ChatErrorMessage {
  type: 'chat_error'
  conversationId: string
  error: string
  timestamp: string
  projectId?: string
}

export interface ChatCommandProposalMessage {
  type: 'chat_command_proposal'
  conversationId: string
  command: string
  timestamp: string
  projectId?: string
}

export interface ChatTitleUpdateMessage {
  type: 'chat_title_update'
  conversationId: string
  title: string
  timestamp: string
  projectId?: string
}

// ─── Hub-level message types ──────────────────────────────────────────────────

export interface HubProjectsMessage {
  type: 'hub.projects'
  projects: ProjectRow[]
  timestamp: string
}

export interface HubProjectAddedMessage {
  type: 'hub.project_added'
  project: ProjectRow
  timestamp: string
}

export interface HubProjectRemovedMessage {
  type: 'hub.project_removed'
  projectId: string
  timestamp: string
}

// ─── Setup message types ──────────────────────────────────────────────────────

export interface SetupLogMessage {
  type: 'setup_log'
  projectId: string
  line: string
  stream: 'stdout' | 'stderr'
}

export interface SetupCheckpointMessage {
  type: 'setup_checkpoint'
  projectId: string
  checkpoint: string
  status: 'running' | 'done'
  detail?: string
  duration_ms?: number
}

export interface SetupChatMessage {
  type: 'setup_chat'
  projectId: string
  text: string
  role: 'assistant' | 'user'
}

export interface SetupSummaryPayload {
  agents: number
  specrailsCommands: number
  opsxCommands: number
  personas: number
  legacySrRemoved: number
  tier: 'quick' | 'full'
}

export interface SetupInstallDoneMessage {
  type: 'setup_install_done'
  projectId: string
  timestamp: string
  summary?: SetupSummaryPayload
}

export interface SetupCompleteMessage {
  type: 'setup_complete'
  projectId: string
  sessionId?: string
  summary: SetupSummaryPayload
}

export interface SetupErrorMessage {
  type: 'setup_error'
  projectId: string
  error: string
}

export interface SetupTurnDoneMessage {
  type: 'setup_turn_done'
  projectId: string
  sessionId?: string
}

// ─── Proposal message types ───────────────────────────────────────────────────

export interface ProposalStreamMessage {
  type: 'proposal_stream'
  projectId: string
  proposalId: string
  delta: string
  timestamp: string
}

export interface ProposalReadyMessage {
  type: 'proposal_ready'
  projectId: string
  proposalId: string
  markdown: string
  timestamp: string
}

export interface ProposalRefinedMessage {
  type: 'proposal_refined'
  projectId: string
  proposalId: string
  markdown: string
  timestamp: string
}

export interface ProposalIssueCreatedMessage {
  type: 'proposal_issue_created'
  projectId: string
  proposalId: string
  issueUrl: string
  timestamp: string
}

export interface ProposalErrorMessage {
  type: 'proposal_error'
  projectId: string
  proposalId: string
  error: string
  timestamp: string
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

// ─── Spec Launcher message types ─────────────────────────────────────────────

export interface SpecLauncherStreamMessage {
  type: 'spec_launcher_stream'
  projectId: string
  launchId: string
  delta: string
  timestamp: string
}

export interface SpecLauncherDoneMessage {
  type: 'spec_launcher_done'
  projectId: string
  launchId: string
  changeId: string | null
  timestamp: string
}

export interface SpecLauncherErrorMessage {
  type: 'spec_launcher_error'
  projectId: string
  launchId: string
  error: string
  timestamp: string
}

// ─── Ticket message types ────────────────────────────────────────────────────

export interface LocalTicket {
  id: number
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  labels: string[]
  assignee: string | null
  prerequisites: number[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  created_by: string
  source: string
}

export interface TicketCreatedMessage {
  type: 'ticket_created'
  projectId: string
  ticket: LocalTicket
  timestamp: string
}

export interface TicketUpdatedMessage {
  type: 'ticket_updated'
  projectId: string
  ticket: LocalTicket
  timestamp: string
}

export interface TicketDeletedMessage {
  type: 'ticket_deleted'
  projectId: string
  ticketId: number
  timestamp: string
}

export interface TicketAiEditStreamMessage {
  type: 'ticket_ai_edit_stream'
  projectId: string
  ticketId: number
  requestId: string
  delta: string
  timestamp: string
}

export interface TicketAiEditDoneMessage {
  type: 'ticket_ai_edit_done'
  projectId: string
  ticketId: number
  requestId: string
  fullText: string
  timestamp: string
}

export interface TicketAiEditErrorMessage {
  type: 'ticket_ai_edit_error'
  projectId: string
  ticketId: number
  requestId: string
  error: string
  timestamp: string
}

export interface SpecGenStreamMessage {
  type: 'spec_gen_stream'
  projectId: string
  requestId: string
  delta: string
  timestamp: string
}

export interface SpecGenDoneMessage {
  type: 'spec_gen_done'
  projectId: string
  requestId: string
  ticket: LocalTicket
  timestamp: string
}

export interface SpecGenErrorMessage {
  type: 'spec_gen_error'
  projectId: string
  requestId: string
  error: string
  timestamp: string
}

// ─── Cost alert message types ─────────────────────────────────────────────────

export interface CostAlertMessage {
  type: 'cost_alert'
  projectId: string
  jobId: string
  cost: number
  threshold: number
}

export interface DailyBudgetExceededMessage {
  type: 'daily_budget_exceeded'
  projectId: string
  dailySpend: number
  budget: number
  queuePaused: boolean
}

export interface HubDailyBudgetExceededMessage {
  type: 'hub_daily_budget_exceeded'
  projectId: string
  hubDailySpend: number
  hubBudget: number
  queuePaused: boolean
}

export interface PipelineStatusMessage {
  type: 'pipeline_status'
  pipelineId: string
  status: 'running' | 'completed' | 'failed'
  projectId?: string
}

export interface RailJobStartedMessage {
  type: 'rail.job_started'
  projectId: string
  railIndex: number
  jobId: string
  mode: string
}

export interface RailJobStoppedMessage {
  type: 'rail.job_stopped'
  projectId: string
  railIndex: number
  jobId: string
}

export interface RailJobCompletedMessage {
  type: 'rail.job_completed'
  projectId: string
  railIndex: number
  jobId: string
  status: string
  ticketIds: number[]
}

export type WsMessage =
  | LogMessage | PhaseMessage | InitMessage | QueueMessage | EventMessage
  | ChatStreamMessage | ChatDoneMessage | ChatErrorMessage
  | ChatCommandProposalMessage | ChatTitleUpdateMessage
  | HubProjectsMessage | HubProjectAddedMessage | HubProjectRemovedMessage
  | SetupLogMessage | SetupCheckpointMessage | SetupChatMessage
  | SetupInstallDoneMessage | SetupCompleteMessage | SetupErrorMessage
  | SetupTurnDoneMessage
  | ProposalStreamMessage | ProposalReadyMessage | ProposalRefinedMessage
  | ProposalIssueCreatedMessage | ProposalErrorMessage
  | SpecLauncherStreamMessage | SpecLauncherDoneMessage | SpecLauncherErrorMessage
  | CostAlertMessage | DailyBudgetExceededMessage | HubDailyBudgetExceededMessage
  | PipelineStatusMessage
  | TicketCreatedMessage | TicketUpdatedMessage | TicketDeletedMessage
  | TicketAiEditStreamMessage | TicketAiEditDoneMessage | TicketAiEditErrorMessage
  | SpecGenStreamMessage | SpecGenDoneMessage | SpecGenErrorMessage
  | RailJobStartedMessage | RailJobStoppedMessage | RailJobCompletedMessage

