import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test-utils'
import { ProposeSpecModal } from '../ProposeSpecModal'

const mockStartWithMessage = vi.fn().mockResolvedValue('conv-1')
const mockSendMessage = vi.fn()
const mockAbortStream = vi.fn()
const mockConfirmCommand = vi.fn()
const mockDismissCommandProposal = vi.fn()
const mockChangeConversationModel = vi.fn()

// Mutable mock state so individual tests can override conversations
let mockConversations: unknown[] = [
  {
    id: 'conv-1',
    messages: [{ id: 'msg-1', role: 'assistant', content: 'Hello', timestamp: Date.now() }],
    streamingText: '',
    isStreaming: false,
    model: 'claude-3-5-sonnet',
  },
]

vi.mock('../../hooks/useChat', () => ({
  useChatContext: () => ({
    conversations: mockConversations,
    activeTabIndex: 0,
    startWithMessage: mockStartWithMessage,
    sendMessage: mockSendMessage,
    abortStream: mockAbortStream,
    confirmCommand: mockConfirmCommand,
    dismissCommandProposal: mockDismissCommandProposal,
    changeConversationModel: mockChangeConversationModel,
  }),
}))

vi.mock('../MessageList', () => ({
  MessageList: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="message-list">{messages.length} messages</div>
  ),
}))

vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSend }: { onSend: (msg: string) => void }) => (
    <div data-testid="chat-input">
      <button onClick={() => onSend('test message')}>send</button>
    </div>
  ),
}))

describe('ProposeSpecModal', () => {
  const onCloseMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartWithMessage.mockResolvedValue('conv-1')
    mockConversations = [
      {
        id: 'conv-1',
        messages: [{ id: 'msg-1', role: 'assistant', content: 'Hello', timestamp: Date.now() }],
        streamingText: '',
        isStreaming: false,
        model: 'claude-3-5-sonnet',
      },
    ]
  })

  it('does not render dialog when open=false', () => {
    render(<ProposeSpecModal open={false} onClose={onCloseMock} />)
    expect(screen.queryByText('Add Spec')).not.toBeInTheDocument()
  })

  it('renders dialog when open=true', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    expect(screen.getByText('Add Spec')).toBeInTheDocument()
  })

  it('starts conversation with /specrails:propose-spec when opened', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledWith('/specrails:propose-spec')
    })
  })

  it('does not start conversation twice if already started', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    rerender(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledTimes(1)
    })
  })

  it('renders MessageList when conversation exists', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    })
  })

  it('renders ChatInput when conversation exists', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    })
  })

  it('resets tracking flag when closed and re-opened', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledTimes(1)
    })

    // Close and re-open
    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} />)
    rerender(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledTimes(2)
    })
  })
})

describe('ProposeSpecModal - empty chat context', () => {
  it('renders "Starting session…" when conversations is empty', () => {
    mockConversations = [] // No conversations yet
    const onCloseMock2 = vi.fn()
    render(<ProposeSpecModal open={true} onClose={onCloseMock2} />)
    expect(screen.getByText(/Starting session/i)).toBeInTheDocument()
  })
})
