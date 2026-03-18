import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test-utils'
import { MessageList } from '../MessageList'
import type { ChatMessage } from '../../types'

// Mock react-markdown to avoid complex markdown rendering in tests
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}))

vi.mock('remark-gfm', () => ({ default: () => {} }))

const noOp = vi.fn()

const userMessage: ChatMessage = {
  id: 1,
  conversation_id: 'conv-1',
  role: 'user',
  content: 'Hello there',
  created_at: '2024-01-01T00:00:00Z',
}

const assistantMessage: ChatMessage = {
  id: 2,
  conversation_id: 'conv-1',
  role: 'assistant',
  content: 'Hi! How can I help?',
  created_at: '2024-01-01T00:00:01Z',
}

describe('MessageList', () => {
  it('shows empty state when no messages and not streaming', () => {
    render(
      <MessageList
        messages={[]}
        streamingText=""
        isStreaming={false}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument()
  })

  it('renders user message content', () => {
    render(
      <MessageList
        messages={[userMessage]}
        streamingText=""
        isStreaming={false}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText('Hello there')).toBeInTheDocument()
  })

  it('renders assistant message content', () => {
    render(
      <MessageList
        messages={[assistantMessage]}
        streamingText=""
        isStreaming={false}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
  })

  it('renders multiple messages', () => {
    render(
      <MessageList
        messages={[userMessage, assistantMessage]}
        streamingText=""
        isStreaming={false}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
  })

  it('shows streaming text when isStreaming is true and streamingText is set', () => {
    render(
      <MessageList
        messages={[]}
        streamingText="Thinking about your question..."
        isStreaming={true}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText('Thinking about your question...')).toBeInTheDocument()
  })

  it('shows streaming indicator (...) when streaming but no text yet', () => {
    render(
      <MessageList
        messages={[]}
        streamingText=""
        isStreaming={true}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.getByText('...')).toBeInTheDocument()
  })

  it('streaming indicator is present alongside streaming text', () => {
    render(
      <MessageList
        messages={[]}
        streamingText="Hello"
        isStreaming={true}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    // Both the streaming text div and the pulsing indicator are present
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('...')).toBeInTheDocument()
  })

  it('does not show empty state when streaming', () => {
    render(
      <MessageList
        messages={[]}
        streamingText=""
        isStreaming={true}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    expect(screen.queryByText(/Start a conversation/i)).not.toBeInTheDocument()
  })

  it('does not show streaming text bubble when not streaming', () => {
    render(
      <MessageList
        messages={[userMessage]}
        streamingText="some text"
        isStreaming={false}
        onConfirmCommand={noOp}
        onDismissCommand={noOp}
      />
    )
    // streamingText div is only rendered when isStreaming=true
    expect(screen.queryByText('some text')).not.toBeInTheDocument()
  })
})
