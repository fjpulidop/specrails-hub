// Tests for the invisible idempotency marker: it now rides as a Jira comment
// PROPERTY (never in the rendered body), with a legacy body-scan fallback for
// comments posted before the change.
import { describe, it, expect } from 'vitest'
import { JiraClient, type FetchImpl, type JiraClientConfig } from './jira-client'
import {
  SPECRAILS_COMMENT_PROP_KEY,
  commentHasMarker,
  commentMarker,
  discardCommentMarker,
} from './jira-adf'

interface Captured { url: string; method: string; body: any }

function makeFetch(responseBody: unknown): { fetchImpl: FetchImpl; requests: Captured[] } {
  const requests: Captured[] = []
  const fetchImpl: FetchImpl = async (url: string, init?: any) => {
    let parsed: any
    if (typeof init?.body === 'string') { try { parsed = JSON.parse(init.body) } catch { parsed = init.body } }
    requests.push({ url, method: init?.method ?? 'GET', body: parsed })
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => (responseBody === undefined ? '' : JSON.stringify(responseBody)),
      json: async () => responseBody,
    } as any
  }
  return { fetchImpl, requests }
}

function cfg(fetchImpl: FetchImpl): JiraClientConfig {
  return { baseUrl: 'https://acme.atlassian.net', deployment: 'cloud', apiVersion: '3', authScheme: 'basic', accountEmail: 'a@b.com', token: 't', fetchImpl }
}

describe('addComment marker as comment property', () => {
  it('stores the marker in an invisible comment property, NOT in the body', async () => {
    const marker = commentMarker('j1', 7)
    const { fetchImpl, requests } = makeFetch({ id: 'c1' })
    await new JiraClient(cfg(fetchImpl)).addComment('PROJ-1', 'Implementation completed.', marker)
    const sent = requests[0].body
    expect(sent.properties).toEqual([{ key: SPECRAILS_COMMENT_PROP_KEY, value: { marker } }])
    // The marker text must NOT appear anywhere in the rendered comment body.
    expect(JSON.stringify(sent.body)).not.toContain(marker)
    expect(JSON.stringify(sent.body)).not.toContain('specrails')
  })

  it('omits properties entirely when no marker is given', async () => {
    const { fetchImpl, requests } = makeFetch({ id: 'c2' })
    await new JiraClient(cfg(fetchImpl)).addComment('PROJ-1', 'hi')
    expect(requests[0].body.properties).toBeUndefined()
  })

  it('getComments requests the properties expansion', async () => {
    const { fetchImpl, requests } = makeFetch({ comments: [] })
    await new JiraClient(cfg(fetchImpl)).getComments('PROJ-1')
    expect(requests[0].url).toContain('?expand=properties')
  })
})

describe('commentHasMarker', () => {
  const marker = discardCommentMarker(78, 'abc123')

  it('matches via the invisible comment property', () => {
    const comment = { body: 'Removed from the sprint.', properties: [{ key: SPECRAILS_COMMENT_PROP_KEY, value: { marker } }] }
    expect(commentHasMarker(comment, marker)).toBe(true)
  })

  it('falls back to a legacy body-embedded marker', () => {
    expect(commentHasMarker({ body: `old comment ${marker}` }, marker)).toBe(true)
  })

  it('is false when neither property nor body carries the marker', () => {
    expect(commentHasMarker({ body: 'clean comment', properties: [{ key: SPECRAILS_COMMENT_PROP_KEY, value: { marker: 'other' } }] }, marker)).toBe(false)
    expect(commentHasMarker({ body: 'clean comment' }, marker)).toBe(false)
  })
})
