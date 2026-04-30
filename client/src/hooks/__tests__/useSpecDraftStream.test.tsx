import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { useSpecDraftStream } from '../useSpecDraftStream'
import { SharedWebSocketContext } from '../useSharedWebSocket'

interface FakeWs {
  registerHandler: (id: string, fn: (msg: unknown) => void) => void
  unregisterHandler: (id: string) => void
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  emit: (msg: unknown) => void
}

function makeFakeWs(): FakeWs {
  const handlers = new Map<string, (msg: unknown) => void>()
  return {
    registerHandler: (id, fn) => handlers.set(id, fn),
    unregisterHandler: (id) => handlers.delete(id),
    connectionStatus: 'connected',
    emit: (msg) => {
      for (const h of handlers.values()) h(msg)
    },
  }
}

function wrapper(ws: FakeWs) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(SharedWebSocketContext.Provider, { value: ws }, children)
}

describe('useSpecDraftStream', () => {
  let ws: FakeWs

  beforeEach(() => {
    ws = makeFakeWs()
  })

  it('returns defaults before any update', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    expect(result.current.draft.title).toBe('')
    expect(result.current.ready).toBe(false)
    expect(result.current.chips).toEqual([])
    expect(result.current.hasManualOverrides).toBe(false)
  })

  it('merges WS updates into draft state', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-1',
        draft: { title: 'A', priority: 'high' },
        ready: false,
        chips: [],
        changedFields: ['title', 'priority'],
        timestamp: '',
      })
    })
    expect(result.current.draft.title).toBe('A')
    expect(result.current.draft.priority).toBe('high')
    expect(result.current.lastChangedFields).toEqual(expect.arrayContaining(['title', 'priority']))
  })

  it('ignores updates for other conversation ids', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-OTHER',
        draft: { title: 'Z' },
        ready: true,
        chips: [],
        changedFields: ['title'],
        timestamp: '',
      })
    })
    expect(result.current.draft.title).toBe('')
    expect(result.current.ready).toBe(false)
  })

  it('manual edit blocks Claude write to that field within the same turn cycle', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      result.current.setField('priority', 'low')
    })
    expect(result.current.draft.priority).toBe('low')
    expect(result.current.hasManualOverrides).toBe(true)

    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-1',
        draft: { priority: 'high', title: 'Streamed' },
        ready: false,
        chips: [],
        changedFields: [],
        timestamp: '',
      })
    })
    expect(result.current.draft.priority).toBe('low') // user wins
    expect(result.current.draft.title).toBe('Streamed') // non-overridden field updates
  })

  it('clearManualOverrides restores Claude authority on next turn', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      result.current.setField('priority', 'low')
      result.current.clearManualOverrides()
    })
    expect(result.current.hasManualOverrides).toBe(false)

    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-1',
        draft: { priority: 'high' },
        ready: false,
        chips: [],
        changedFields: ['priority'],
        timestamp: '',
      })
    })
    expect(result.current.draft.priority).toBe('high')
  })

  it('exposes ready and caps chips at 3', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-1',
        draft: { title: 'X' },
        ready: true,
        chips: ['a', 'b', 'c', 'd', 'e'],
        changedFields: ['title'],
        timestamp: '',
      })
    })
    expect(result.current.ready).toBe(true)
    expect(result.current.chips).toEqual(['a', 'b', 'c'])
  })

  it('resets state on conversation switch', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSpecDraftStream(id),
      { wrapper: wrapper(ws), initialProps: { id: 'conv-1' } },
    )
    act(() => {
      ws.emit({
        type: 'spec_draft.update',
        conversationId: 'conv-1',
        draft: { title: 'X' },
        ready: true,
        chips: ['a'],
        changedFields: ['title'],
        timestamp: '',
      })
    })
    expect(result.current.draft.title).toBe('X')
    rerender({ id: 'conv-2' })
    expect(result.current.draft.title).toBe('')
    expect(result.current.ready).toBe(false)
    expect(result.current.chips).toEqual([])
  })

  it('ignores unrelated WS messages', () => {
    const { result } = renderHook(() => useSpecDraftStream('conv-1'), { wrapper: wrapper(ws) })
    act(() => {
      ws.emit({ type: 'chat_done', conversationId: 'conv-1', fullText: 'hi', timestamp: '' })
      ws.emit('not-an-object')
      ws.emit(null)
    })
    expect(result.current.draft.title).toBe('')
  })
})
