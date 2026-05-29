// Byte-stable prompts. Do NOT include timestamps, costs, or per-request data
// here — these strings must be identical across requests to benefit from the
// Anthropic prompt-cache 5-minute TTL.

export const ASK_SYSTEM_PROMPT = `You are the project memory of a specrails-hub project.

Rules:
- Answer using ONLY the provided sources. Do not invent facts.
- Cite every concrete claim with [N] where N is the source index from the SOURCES list.
- If sources do not cover the question, say so plainly and suggest one rephrase.
- Match the user's language. Default to English if ambiguous.
- No filler ("Great question!", "Sure!", "Here's…"). Get straight to the point.

Formatting (the answer renders as GitHub-flavored Markdown):
- Prefer **bold section headers** + bullet lists when the answer has multiple groups (e.g. shipped / stalled / in-progress).
- Inline citations inside list items: \`- Add OAuth login [3]\` — not a separate "sources" sentence.
- Keep prose short, but use structure when it earns its keep. One-line answers stay one line.
- Code identifiers in \`backticks\`. File paths in \`backticks\`. Costs as \`$X.YY\`.

Output format (JSON only — no other text):
{
  "answer": "markdown string with [N] citations inline",
  "citations": [{"n": 1, "kind": "ticket", "id": "..."}],
  "followups": ["...", "...", "..."]
}

Followup rules:
- Each followup MUST drill into a source you already cited in "answer" (a ticket, job, conversation, file, or commit referenced via [N]).
- Never invent a topic that does not appear in the cited sources.
- Prefer questions that ask for *more depth* on a cited item ("Why is #142 stalled?", "What changed in \`server/db.ts\` for #87?") over jumping to unrelated areas.
- If the answer cites fewer than 2 sources, return fewer followups (or an empty array). Quality over quantity.

If you cannot answer:
{ "answer": "I don't have enough context to answer this.", "citations": [], "followups": [] }`

export interface PreviousTurn {
  question: string
  answer: string
}

/** Truncate the conversational history to a sane size before injecting it
 *  into the prompt. Keeps the last 2 turns, caps each answer to 500 chars. */
export function trimPreviousTurns(turns: PreviousTurn[] | undefined): PreviousTurn[] {
  if (!turns || turns.length === 0) return []
  const recent = turns.slice(-2)
  return recent.map((t) => ({
    question: t.question.length > 200 ? t.question.slice(0, 200) + '…' : t.question,
    answer: t.answer.length > 500 ? t.answer.slice(0, 500) + '…' : t.answer,
  }))
}

export function buildUserPrompt(
  question: string,
  sources: Array<{ kind: string; source_id: string; title: string; body: string }>,
  aggregateContext?: string,
  previousTurns?: PreviousTurn[],
): string {
  const lines: string[] = []
  const history = trimPreviousTurns(previousTurns)
  if (history.length > 0) {
    lines.push(`PREVIOUS CONVERSATION (latest first — use only as context, do not re-cite):`)
    history.forEach((t, i) => {
      lines.push(`Turn ${history.length - i}:`)
      lines.push(`  Q: ${t.question}`)
      lines.push(`  A: ${t.answer}`)
      lines.push('')
    })
    lines.push(`The NEW question below builds on the conversation above. Resolve pronouns ("it", "that", "instead") against it.`)
    lines.push('')
  }
  lines.push(`QUESTION: ${question}`)
  lines.push('')
  if (aggregateContext && aggregateContext.length > 0) {
    lines.push(`AGGREGATE CONTEXT:`)
    lines.push(aggregateContext)
    lines.push('')
  }
  if (sources.length > 0) {
    lines.push(`SOURCES (cite as [N]):`)
    sources.forEach((s, i) => {
      lines.push(`[${i + 1}] kind=${s.kind} id=${s.source_id} title="${s.title.replace(/"/g, "'")}"`)
      lines.push(s.body.length > 800 ? s.body.slice(0, 800) + '…' : s.body)
      lines.push('')
    })
  }
  lines.push('Respond with JSON only.')
  return lines.join('\n')
}
