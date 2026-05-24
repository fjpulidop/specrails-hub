// Mirror of `server/ask/intent-router.ts` heuristics so the modal can
// pre-classify queries client-side and decide whether to auto-trigger the AI.
// Server is the source of truth for the final routing; this is UX only.

export type ClientAskIntent = 'factual' | 'status' | 'compare' | 'decision' | 'search'

const STATUS_RE = /(c[oó]mo (va|vamos|ha ido|fue)|c[oó]mo va el|resumen|estado del|status|esta semana|últimos? \d+ d[ií]as|how is|how's|how did|this week|today|qu[eé] hicimos|qu[eé] pas[oó]|atascad[oa]s?|stalled|dame el estado|d[ií]me el estado|show me the status|\b(give|tell) me (a|the|an) (summary|overview|recap|status)\b|\b(summary|overview|recap)\b|qu[eé] hay|what's (new|going on|happening)|what is the (state|status)|project status)/i
const COMPARE_RE = /(\bvs\b|versus|comparado|compare|comparar|evoluci[oó]n|differ|trend|tendencia)/i
const DECISION_RE = /(por qu[eé]|why did|why do|decisi[oó]n|chose|elegim(?:os)?|optaron|optamos)/i

export function classifyIntentClient(query: string): ClientAskIntent {
  const q = query.trim()
  if (q.length === 0) return 'search'
  if (STATUS_RE.test(q)) return 'status'
  if (COMPARE_RE.test(q)) return 'compare'
  if (DECISION_RE.test(q)) return 'decision'
  return 'factual'
}

/** True when the query looks like the user wants an AI answer rather than a
 *  keyword lookup — used to skip the "instant matches" dance.
 *  Heuristic: anything that looks like a sentence (≥3 words OR ends with `?`
 *  OR matches a non-factual intent). Single-word and 2-word queries stay
 *  keyword-lookup style. */
export function shouldAutoAsk(query: string): boolean {
  const q = query.trim()
  if (q.length === 0) return false
  if (q.endsWith('?')) return true
  const wordCount = q.split(/\s+/).filter(Boolean).length
  if (wordCount >= 3) return true
  const intent = classifyIntentClient(q)
  return intent === 'status' || intent === 'compare' || intent === 'decision'
}
