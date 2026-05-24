// Intent router — heuristic-first classification of Ask queries.
// LLM fallback exists but is OFF by default in v1.

import type { AskIntent } from './types'

// `\b` interacts poorly with accented chars (é, ó, í) in JS regex because
// those are non-word characters, so we anchor only at the start of the alt.
const STATUS_RE = /(c[oó]mo (va|vamos|ha ido|fue)|c[oó]mo va el|resumen|estado del|status|esta semana|últimos? \d+ d[ií]as|how is|how's|how did|this week|today|qu[eé] hicimos|qu[eé] pas[oó]|atascad[oa]s?|stalled|dame el estado|d[ií]me el estado|show me the status|\b(give|tell) me (a|the|an) (summary|overview|recap|status)\b|\b(summary|overview|recap)\b|qu[eé] hay|what's (new|going on|happening)|what is the (state|status)|project status)/i
const COMPARE_RE = /(\bvs\b|versus|comparado|compare|comparar|evoluci[oó]n|differ|trend|tendencia)/i
const DECISION_RE = /(por qu[eé]|why did|why do|decisi[oó]n|chose|elegim(?:os)?|optaron|optamos)/i

export function classifyIntent(query: string): AskIntent {
  const q = query.trim()
  if (q.length === 0) return 'search'
  if (STATUS_RE.test(q)) return 'status'
  if (COMPARE_RE.test(q)) return 'compare'
  if (DECISION_RE.test(q)) return 'decision'
  return 'factual'
}
