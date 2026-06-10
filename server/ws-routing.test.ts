import { describe, it, expect } from 'vitest'
import { shouldDeliverToSubscriber, parseSubscribeFrame } from './ws-routing'

describe('shouldDeliverToSubscriber (H-09 project isolation)', () => {
  it('delivers hub-level messages (no projectId) to everyone', () => {
    expect(shouldDeliverToSubscriber(undefined, null)).toBe(true)
    expect(shouldDeliverToSubscriber(undefined, 'proj-a')).toBe(true)
  })

  it('delivers all project-scoped messages to an undeclared subscriber (back-compat)', () => {
    expect(shouldDeliverToSubscriber('proj-a', null)).toBe(true)
    expect(shouldDeliverToSubscriber('proj-b', null)).toBe(true)
  })

  it('delivers only the subscribed project to a declared subscriber', () => {
    expect(shouldDeliverToSubscriber('proj-a', 'proj-a')).toBe(true)
    expect(shouldDeliverToSubscriber('proj-b', 'proj-a')).toBe(false)
  })

  it('isolates two projects with colliding ids from each other', () => {
    // The core guarantee the Mobile Gateway depends on: a device scoped to A
    // never receives B's stream.
    expect(shouldDeliverToSubscriber('B', 'A')).toBe(false)
    expect(shouldDeliverToSubscriber('A', 'B')).toBe(false)
  })
})

describe('parseSubscribeFrame', () => {
  it('parses a well-formed subscribe frame', () => {
    expect(parseSubscribeFrame(JSON.stringify({ type: 'subscribe', projectId: 'proj-a' })))
      .toEqual({ subscribe: true, projectId: 'proj-a' })
  })

  it('clears the subscription when projectId is not a string', () => {
    expect(parseSubscribeFrame(JSON.stringify({ type: 'subscribe', projectId: 123 })))
      .toEqual({ subscribe: true, projectId: null })
    expect(parseSubscribeFrame(JSON.stringify({ type: 'subscribe' })))
      .toEqual({ subscribe: true, projectId: null })
  })

  it('ignores non-subscribe frames', () => {
    expect(parseSubscribeFrame(JSON.stringify({ type: 'something-else' })))
      .toEqual({ subscribe: false, projectId: null })
  })

  it('never throws on malformed JSON', () => {
    expect(parseSubscribeFrame('not json {{{')).toEqual({ subscribe: false, projectId: null })
    expect(parseSubscribeFrame('')).toEqual({ subscribe: false, projectId: null })
  })
})
