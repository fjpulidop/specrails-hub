// Decision pipeline — retrieval boosted toward explore-turn + git-commit
// sources (where rationale tends to live).

import type { DbInstance } from '../../db'
import type { AskPipelineContext, RankedSource } from '../types'
import { hybridSearch } from '../search'

const DECISION_BOOST: Record<string, number> = {
  'explore-turn': 1.5,
  'git-commit': 1.2,
  ticket: 1.0,
  'file-summary': 0.8,
  job: 0.8,
}

export async function runDecisionPipeline(
  db: DbInstance,
  projectId: string,
  question: string,
): Promise<AskPipelineContext> {
  const sources = await hybridSearch({ db, projectId, query: question, limit: 12 })
  const boosted: RankedSource[] = sources
    .map((s) => ({ ...s, score: s.score * (DECISION_BOOST[s.kind] ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
  return { question, intent: 'decision', sources: boosted }
}
