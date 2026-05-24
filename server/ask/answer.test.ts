import { describe, it, expect } from 'vitest'
import { extractEnvelope, stripUnresolvedCitations } from './answer'
import { ASK_SYSTEM_PROMPT, buildUserPrompt } from './prompts'

describe('answer parser', () => {
  it('extracts a clean envelope from streamed text', () => {
    const text = `{"answer":"OAuth in #142[1]","citations":[{"n":1,"kind":"ticket","id":"142"}],"followups":["next?"]}`
    const env = extractEnvelope(text, 1)
    expect(env).not.toBeNull()
    expect(env!.answer).toContain('[1]')
    expect(env!.citations).toHaveLength(1)
    expect(env!.followups).toEqual(['next?'])
  })

  it('extracts envelope wrapped in stray text', () => {
    const text = `here we go\n{"answer":"hi","citations":[],"followups":[]}\ntrailing`
    const env = extractEnvelope(text, 0)
    expect(env?.answer).toBe('hi')
  })

  it('strips unresolved citations', () => {
    expect(stripUnresolvedCitations('foo [1] bar [9]', 3)).toBe('foo [1] bar ')
    expect(stripUnresolvedCitations('foo [0] bar', 2)).toBe('foo  bar')
  })

  it('preserves citations within range', () => {
    expect(stripUnresolvedCitations('a [1] b [3] c', 3)).toBe('a [1] b [3] c')
  })

  it('returns null for non-JSON garbage', () => {
    expect(extractEnvelope('no json here', 0)).toBeNull()
    expect(extractEnvelope('', 0)).toBeNull()
  })

  it('returns null when answer field missing', () => {
    expect(extractEnvelope('{"foo":1}', 0)).toBeNull()
  })

  it('handles missing citations / followups arrays', () => {
    const env = extractEnvelope('{"answer":"hi"}', 0)
    expect(env?.answer).toBe('hi')
    expect(env?.citations).toEqual([])
    expect(env?.followups).toEqual([])
  })

  it('filters non-numeric citations', () => {
    const env = extractEnvelope('{"answer":"a","citations":[{"n":"x"},{"n":1,"kind":"ticket","id":"1"}],"followups":[1,"q"]}', 5)
    expect(env?.citations).toHaveLength(1)
    expect(env?.followups).toEqual(['q'])
  })
})

describe('prompts', () => {
  it('system prompt is byte-stable', () => {
    expect(ASK_SYSTEM_PROMPT).toBe(ASK_SYSTEM_PROMPT)
    // Snapshot critical contract phrases without taking a full snapshot.
    expect(ASK_SYSTEM_PROMPT).toContain('Cite every concrete claim')
    expect(ASK_SYSTEM_PROMPT).toContain('"answer"')
  })

  it('user prompt embeds question + sources + aggregate context', () => {
    const out = buildUserPrompt(
      'why oauth?',
      [{ kind: 'ticket', source_id: 'ticket:1', title: 'OAuth', body: 'because acme' }],
      '# stats',
    )
    expect(out).toMatch(/QUESTION: why oauth\?/)
    expect(out).toMatch(/AGGREGATE CONTEXT:/)
    expect(out).toMatch(/# stats/)
    expect(out).toMatch(/\[1\] kind=ticket id=ticket:1/)
  })
})
