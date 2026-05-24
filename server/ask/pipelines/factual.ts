// Factual pipeline — pure retrieval. Returns top sources for an LLM answer.

import type { DbInstance } from '../../db'
import type { AskPipelineContext } from '../types'
import { hybridSearch } from '../search'

export async function runFactualPipeline(
  db: DbInstance,
  projectId: string,
  question: string,
): Promise<AskPipelineContext> {
  const sources = await hybridSearch({ db, projectId, query: question, limit: 8 })
  return {
    question,
    intent: 'factual',
    sources,
  }
}
