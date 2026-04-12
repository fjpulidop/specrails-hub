import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test-utils'
import { ProposeSpecModal } from '../ProposeSpecModal'
import type { LocalTicket } from '../../types'

const mockStartWithMessage = vi.fn().mockResolvedValue('conv-1')
const mockAbortStream = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({ activeProjectId: 'proj-1' }),
}))

vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: vi.fn(),
    unregisterHandler: vi.fn(),
  }),
}))

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

const makeTicket = (overrides: Partial<LocalTicket> = {}): LocalTicket => ({
  id: 1,
  title: 'Test Ticket',
  description: '',
  status: 'backlog',
  priority: 'medium',
  labels: [],
  source: 'propose-spec',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

describe('ProposeSpecModal', () => {
  const onCloseMock = vi.fn()
  const onTicketCreatedMock = vi.fn()
  const emptyTickets: LocalTicket[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartWithMessage.mockResolvedValue('conv-1')
  })

  it('does not render dialog when open=false', () => {
    render(<ProposeSpecModal open={false} onClose={onCloseMock} tickets={emptyTickets} />)
    expect(screen.queryByText('Add Spec')).not.toBeInTheDocument()
  })

  it('renders dialog with textarea when open=true', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    expect(screen.getByText('Add Spec')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/add a dark mode toggle/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate spec/i })).toBeInTheDocument()
  })

  it('does not auto-execute command on open', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    expect(mockStartWithMessage).not.toHaveBeenCalled()
  })

  it('disables Generate Spec button when textarea is empty', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const button = screen.getByRole('button', { name: /generate spec/i })
    expect(button).toBeDisabled()
  })

  it('enables Generate Spec button when textarea has content', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    const button = screen.getByRole('button', { name: /generate spec/i })
    expect(button).not.toBeDisabled()
  })

  it('sends message with /specrails:propose-spec and user text on submit', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} onTicketCreated={onTicketCreatedMock} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
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
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => {
      expect(screen.getByText(/generating your spec/i)).toBeInTheDocument()
    })
  })

  it('detects new ticket and transitions to done', async () => {
    const existingTickets = [makeTicket({ id: 1 })]
    const { rerender } = render(
      <ProposeSpecModal open={true} onClose={onCloseMock} tickets={existingTickets} onTicketCreated={onTicketCreatedMock} />,
    )
    // Submit
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => expect(screen.getByText(/generating your spec/i)).toBeInTheDocument())

    // Simulate a new ticket appearing
    const newTicket = makeTicket({ id: 2, title: 'New Spec' })
    rerender(
      <ProposeSpecModal open={true} onClose={onCloseMock} tickets={[...existingTickets, newTicket]} onTicketCreated={onTicketCreatedMock} />,
    )

    await waitFor(() => {
      expect(screen.getByText(/spec created/i)).toBeInTheDocument()
    })
  })

  it('aborts stream on close during generation', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => expect(mockStartWithMessage).toHaveBeenCalled())

    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} tickets={emptyTickets} />)
    expect(mockAbortStream).toHaveBeenCalledWith('conv-1')
  })

  it('resets state when reopened', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Add dark mode' } })

    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} tickets={emptyTickets} />)
    rerender(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)

    const newTextarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    expect(newTextarea).toHaveValue('')
  })

  it('submits via Cmd+Enter keyboard shortcut', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Keyboard test' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalledTimes(1)
      expect((mockStartWithMessage.mock.calls[0][0] as string)).toContain('Keyboard test')
    })
  })

  it('uses fast mode when explore codebase is unchecked', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ requestId: 'req-1' }),
    })

    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    // Uncheck explore codebase
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    // Fill and submit
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Fast spec' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/generate-spec'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    // Should NOT use ChatManager in fast mode
    expect(mockStartWithMessage).not.toHaveBeenCalled()
  })

  it('resets phase to input when closed during generation', async () => {
    const { rerender } = render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => expect(screen.getByText(/generating your spec/i)).toBeInTheDocument())

    // Close modal
    rerender(<ProposeSpecModal open={false} onClose={onCloseMock} tickets={emptyTickets} />)
    // Reopen — should show input phase, not generating
    rerender(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)

    expect(screen.getByPlaceholderText(/add a dark mode toggle/i)).toBeInTheDocument()
    expect(screen.queryByText(/generating your spec/i)).not.toBeInTheDocument()
  })

  it('prevents interaction outside during generation', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => expect(screen.getByText(/generating your spec/i)).toBeInTheDocument())
    // The preventInteractOutside callback should exist — modal should still be generating
    expect(screen.getByText(/generating your spec/i)).toBeInTheDocument()
  })
})
