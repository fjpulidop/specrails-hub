// Compare pipeline — SQL group-bys over ai_invocations and jobs for queries
// like "Opus vs Sonnet" or "this month vs last month".

import type { DbInstance } from '../../db'
import type { AskPipelineContext } from '../types'

export function runComparePipeline(
  db: DbInstance,
  _projectId: string,
  question: string,
): AskPipelineContext {
  const byModel = (() => {
    try {
      return db
        .prepare(
          `SELECT model, COUNT(*) AS runs,
                  ROUND(AVG(total_cost_usd), 4) AS avg_cost,
                  ROUND(AVG(num_turns), 2) AS avg_turns,
                  ROUND(AVG(duration_ms), 0) AS avg_duration_ms
           FROM ai_invocations
           WHERE status = 'success' AND model IS NOT NULL
           GROUP BY model
           ORDER BY runs DESC
           LIMIT 10`,
        )
        .all() as Array<{ model: string; runs: number; avg_cost: number; avg_turns: number; avg_duration_ms: number }>
    } catch {
      return []
    }
  })()

  const lines: string[] = []
  lines.push(`# Model comparison (all-time successful runs)`)
  lines.push('')
  if (byModel.length === 0) {
    lines.push('No invocation history available yet.')
  } else {
    lines.push(`| Model | Runs | Avg cost | Avg turns | Avg duration |`)
    lines.push(`|-------|-----:|---------:|----------:|-------------:|`)
    for (const r of byModel) {
      lines.push(`| ${r.model} | ${r.runs} | $${(r.avg_cost ?? 0).toFixed(4)} | ${r.avg_turns ?? 0} | ${Math.round(r.avg_duration_ms ?? 0)}ms |`)
    }
  }

  return {
    question,
    intent: 'compare',
    sources: [],
    aggregateContext: lines.join('\n'),
  }
}
