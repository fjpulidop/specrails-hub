import { describe, it, expect } from 'vitest'
import {
  textToAdf,
  bodyForDeployment,
  commentMarker,
  bodyContainsMarker,
  adfToText,
} from './jira-adf'

describe('textToAdf', () => {
  it('wraps a single non-empty line in a paragraph with a text node', () => {
    const doc = textToAdf('hello') as any
    expect(doc.type).toBe('doc')
    expect(doc.version).toBe(1)
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    ])
  })

  it('renders an empty string as a single empty paragraph', () => {
    // ''.split('\n') === [''], so one empty-paragraph node
    const doc = textToAdf('') as any
    expect(doc.content).toEqual([{ type: 'paragraph' }])
  })

  it('renders empty lines as empty paragraphs (no content key)', () => {
    const doc = textToAdf('a\n\nb') as any
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ])
  })

  it('produces one paragraph per newline-delimited line for multi-line text', () => {
    const doc = textToAdf('line1\nline2\nline3') as any
    expect(doc.content).toHaveLength(3)
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'line1' }],
    })
    expect(doc.content[2]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'line3' }],
    })
  })

  it('treats a trailing newline as a final empty paragraph', () => {
    const doc = textToAdf('x\n') as any
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
      { type: 'paragraph' },
    ])
  })
})

describe('bodyForDeployment', () => {
  it('returns an ADF doc object for cloud deployments', () => {
    const body = bodyForDeployment('hello', 'cloud') as any
    expect(body).toEqual(textToAdf('hello'))
    expect(body.type).toBe('doc')
    expect(typeof body).toBe('object')
  })

  it('returns the raw string verbatim for dc deployments', () => {
    const body = bodyForDeployment('hello\nworld', 'dc')
    expect(body).toBe('hello\nworld')
    expect(typeof body).toBe('string')
  })

  it('passes an empty string straight through for dc', () => {
    expect(bodyForDeployment('', 'dc')).toBe('')
  })

  it('builds an empty-paragraph ADF doc for empty cloud text', () => {
    expect(bodyForDeployment('', 'cloud')).toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph' }],
    })
  })
})

describe('commentMarker', () => {
  it('formats the marker with job id and ticket id', () => {
    expect(commentMarker('job-123', 42)).toBe('[specrails:job=job-123:ticket=42]')
  })

  it('embeds the numeric ticket id literally', () => {
    expect(commentMarker('abc', 0)).toBe('[specrails:job=abc:ticket=0]')
  })

  it('handles empty job ids', () => {
    expect(commentMarker('', 7)).toBe('[specrails:job=:ticket=7]')
  })
})

describe('bodyContainsMarker', () => {
  const marker = '[specrails:job=j1:ticket=9]'

  it('detects the marker inside a plain string body', () => {
    expect(bodyContainsMarker(`prefix ${marker} suffix`, marker)).toBe(true)
  })

  it('returns false when a string body lacks the marker', () => {
    expect(bodyContainsMarker('nothing here', marker)).toBe(false)
  })

  it('detects the marker inside a serialized ADF object body', () => {
    const adf = textToAdf(`see ${marker} above`)
    expect(bodyContainsMarker(adf, marker)).toBe(true)
  })

  it('returns false when an ADF object body lacks the marker', () => {
    const adf = textToAdf('clean text')
    expect(bodyContainsMarker(adf, marker)).toBe(false)
  })

  it('returns false for null/undefined bodies (JSON.stringify yields no match)', () => {
    expect(bodyContainsMarker(null, marker)).toBe(false)
    expect(bodyContainsMarker(undefined, marker)).toBe(false)
  })

  it('returns false safely when the body is not JSON-serializable (circular)', () => {
    const circular: any = {}
    circular.self = circular
    expect(bodyContainsMarker(circular, marker)).toBe(false)
  })

  it('matches the marker against a numeric body via JSON.stringify', () => {
    // numbers stringify, so a marker that is a substring of the number works
    expect(bodyContainsMarker(12345, '234')).toBe(true)
    expect(bodyContainsMarker(12345, '999')).toBe(false)
  })
})

describe('adfToText', () => {
  it('returns empty string for null', () => {
    expect(adfToText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(adfToText(undefined)).toBe('')
  })

  it('passes a plain string body through unchanged', () => {
    expect(adfToText('wiki markup body')).toBe('wiki markup body')
  })

  it('flattens a nested ADF doc with a single paragraph', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
      ],
    }
    expect(adfToText(adf)).toBe('hello world')
  })

  it('joins multiple paragraphs with blank-line separation', () => {
    const adf = textToAdf('first\nsecond')
    // each paragraph pushes a trailing '\n'; double newline preserved, trimmed
    expect(adfToText(adf)).toBe('first\nsecond')
  })

  it('renders a hardBreak node as a newline within a paragraph', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line A' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line B' },
          ],
        },
      ],
    }
    expect(adfToText(adf)).toBe('line A\nline B')
  })

  it('treats heading nodes as block separators', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    }
    expect(adfToText(adf)).toBe('Title\nBody')
  })

  it('collapses runs of 3+ newlines to a double newline', () => {
    // Construct nodes that explicitly emit stacked newlines (hardBreaks),
    // since textToAdf's empty paragraphs carry no content array and emit none.
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'hardBreak' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    }
    expect(adfToText(adf)).toBe('a\n\nb')
  })

  it('emits only one newline per empty paragraph (no content array → no separator)', () => {
    // Documents the actual behavior: textToAdf empty paragraphs push nothing,
    // so non-empty lines are joined by a single newline.
    const adf = textToAdf('a\n\n\nb')
    expect(adfToText(adf)).toBe('a\nb')
  })

  it('ignores non-text leaf nodes and unknown node types', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'mention', attrs: { id: '123' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
      ],
    }
    expect(adfToText(adf)).toBe('kept')
  })

  it('skips a text node whose text field is not a string', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 42 }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] },
      ],
    }
    expect(adfToText(adf)).toBe('ok')
  })

  it('walks deeply nested content arrays', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'item one' }] },
              ],
            },
          ],
        },
      ],
    }
    expect(adfToText(adf)).toBe('item one')
  })

  it('returns empty string for a doc with no extractable text', () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(adfToText(adf)).toBe('')
  })

  it('returns empty string for a non-object, non-string truthy value (number)', () => {
    // body is truthy and not a string → walk() returns early on non-object
    expect(adfToText(123 as any)).toBe('')
  })

  it('returns empty string for a body whose content is not an array', () => {
    expect(adfToText({ type: 'doc', content: 'not-an-array' })).toBe('')
  })
})
