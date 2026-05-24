// Shared Ask-the-Hub types.

export type AskDocKind = 'ticket' | 'explore-turn' | 'job' | 'file-summary' | 'git-commit'

export interface AskDoc {
  rowid?: number
  kind: AskDocKind
  /** Stable id within the kind (e.g. ticket id, conversation+turn, commit sha). */
  source_id: string
  ticket_id?: string | null
  job_id?: string | null
  conversation_id?: string | null
  file_path?: string | null
  title: string
  body: string
  body_hash: string
  ts: number
  model: string
  schema_version?: number
  embedding?: Buffer | null
}

export interface RankedSource {
  rowid: number
  kind: AskDocKind
  source_id: string
  title: string
  body: string
  ts: number
  ticket_id?: string | null
  job_id?: string | null
  conversation_id?: string | null
  file_path?: string | null
  score: number
}

export type AskIntent = 'factual' | 'status' | 'compare' | 'decision' | 'search'

export interface AskPipelineContext {
  question: string
  intent: AskIntent
  sources: RankedSource[]
  /** Optional structured aggregate context (status / compare). Pre-formatted. */
  aggregateContext?: string
}

export interface AskAnswerEnvelope {
  answer: string
  citations: Array<{ n: number; sourceIdx: number }>
  followups: string[]
}
