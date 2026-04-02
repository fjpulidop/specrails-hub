import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test-utils'
import { ProposeSpecModal } from '../ProposeSpecModal'

const mockStartWithMessage = vi.fn().mockResolvedValue('conv-1')
const mockAbortStream = vi.fn()

vi.mock('../../hooks/useChat', () => ({
  useChatContext: () => ({
    conversations: [],
    activeTabIndex: 0,
    startWithMessage: mockStartWithMessage,
    sendMessage: vi.fn(),
    abortStream: mockAbortStream,
    confirmCommand: vi.fn(),
    dismissCommandProposal: vi.fn(),
    changeConversationModel: vi.fn(),
  }),
}))

const mockRegisterHandler = vi.fn()
const mockUnregisterHandler = vi.fn()
vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: mockRegisterHandler,
    unregisterHandler: mockUnregisterHandler,
    connectionStatus: 'connected',
  }),
}))

describe('ProposeSpecModal', () => {
  const onCloseMock = vi.fn()
  const onTicketCreatedMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartWithMessage.mockResolvedValue('conv-1')
  })

  it('does not render dialog when open=false', () => {
    render(<ProposeSpecModal open={false} onClose={onCloseMock} />)
    expect(screen.queryByText('Add Spec')).not.toBeInTheDocument()
  })

  it('renders dialog with textarea when open=true', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    expect(screen.getByText('Add Spec')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/describe the feature/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate spec/i })).toBeInTheDocument()
  })

  it('does not auto-execute command on open', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    expect(mockStartWithMessage).not.toHaveBeenCalled()
  })

  it('disables Generate Spec button when textarea is empty', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    const button = screen.getByRole('button', { name: /generate spec/i })
    expect(button).toBeDisabled()
  })

  it('enables Generate Spec button when textarea has content', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    const textarea = screen.getByPlaceholderText(/describe the feature/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    const button = screen.getByRole('button', { name: /generate spec/i })
    expect(button).not.toBeDisabled()
  })

  it('sends message with /specrails:propose-spec and user text on submit', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} onTicketCreated={onTicketCreatedMock} />)
    const textarea = screen.getByPlaceholderText(/describe the feature/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledTimes(1)
      const arg = mockStartWithMessage.mock.calls[0][0] as string
      expect(arg).toContain('/specrails:propose-spec')
      expect(arg).toContain('Add dark mode')
    })
  })

  it('shows generating state after submit', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    const textarea = screen.getByPlaceholderText(/describe the feature/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => {
      expect(screen.getByText(/generating your spec/i)).toBeInTheDocument()
    })
  })

  it('aborts stream on close during generation', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    const textarea = screen.getByPlaceholderText(/describe the feature/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => expect(mockStartWithMessage).toHaveBeenCalled())

    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} />)
    expect(mockAbortStream).toHaveBeenCalledWith('conv-1')
  })

  it('resets state when reopened', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} />)
    const textarea = screen.getByPlaceholderText(/describe the feature/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })

    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} />)
    rerender(<ProposeSpecModal open={true} onClose={onCloseMock} />)

    const newTextarea = screen.getByPlaceholderText(/describe the feature/i)
    expect(newTextarea).toHaveValue('')
  })
})
