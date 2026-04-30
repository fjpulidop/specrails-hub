import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test-utils'
import { ProposeSpecModal } from '../ProposeSpecModal'
import type { LocalTicket } from '../../types'

// Mock RichAttachmentEditor with a plain textarea so placeholder/change/keydown queries work
vi.mock('../RichAttachmentEditor', () => ({
  RichAttachmentEditor: React.forwardRef(function MockEditor(
    props: { placeholder?: string; ariaLabel?: string; onChange?: () => void; onSubmit?: () => void },
    ref: React.Ref<{ getPlainText: () => string; getAttachmentIds: () => string[]; insertPill: () => void; focus: () => void; resetHeight: () => void; clear: () => void }>,
  ) {
    const inputRef = React.useRef<HTMLTextAreaElement>(null)
    React.useImperativeHandle(ref, () => ({
      getPlainText: () => inputRef.current?.value ?? '',
      getAttachmentIds: () => [],
      insertPill: () => {},
      focus: () => inputRef.current?.focus(),
      resetHeight: () => { if (inputRef.current) inputRef.current.style.height = '' },
      clear: () => { if (inputRef.current) inputRef.current.value = '' },
    }))
    return (
      <textarea
        ref={inputRef}
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        onChange={(e) => { void e; props.onChange?.() }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) props.onSubmit?.() }}
      />
    )
  }),
}))

const mockStartWithMessage = vi.fn().mockResolvedValue('conv-1')
const mockAbortStream = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({ activeProjectId: 'proj-1', projects: [{ id: 'proj-1', name: 'Test Project' }] }),
}))

const mockRegisterExploreSpec = vi.fn()
const mockRegisterFastSpec = vi.fn()

vi.mock('../../hooks/useSpecGenTracker', () => ({
  useSpecGenTracker: () => ({
    registerFastSpec: mockRegisterFastSpec,
    registerExploreSpec: mockRegisterExploreSpec,
    specToOpen: null,
    clearSpecToOpen: vi.fn(),
  }),
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
    mockRegisterExploreSpec.mockReset()
    mockRegisterFastSpec.mockReset()
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

  it('exposes a Quick / Explore segmented control with Quick selected by default', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    const quickTab = tabs.find((t) => t.textContent?.toLowerCase().includes('quick'))
    expect(quickTab).toHaveAttribute('aria-selected', 'true')
  })

  it('renames the action button to Continue in Explore mode', () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const exploreTab = screen.getAllByRole('tab').find((t) => t.textContent?.toLowerCase().includes('explore'))!
    fireEvent.click(exploreTab)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('hands off to ExploreSpecShell when Continue is clicked in Explore mode', async () => {
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} onTicketCreated={onTicketCreatedMock} />)
    const exploreTab = screen.getAllByRole('tab').find((t) => t.textContent?.toLowerCase().includes('explore'))!
    fireEvent.click(exploreTab)
    const textarea = screen.getByPlaceholderText(/dark mode/i)
    fireEvent.change(textarea, { target: { value: 'dark mode rough idea' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    // The Quick path's /generate-spec must NOT be invoked in Explore mode.
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled()
    })
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/tickets/generate-spec'),
      expect.anything(),
    )
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

  it('submits via Cmd+Enter keyboard shortcut (Quick mode → /generate-spec)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ requestId: 'req-kbd' }),
    })
    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Keyboard test' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/generate-spec'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('uses fast mode when explore codebase is unchecked', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ requestId: 'req-1' }),
    })

    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    // Explore codebase defaults to unchecked — fast mode is the default path.
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

  it('registers fast spec with tracker when explore codebase is unchecked', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ requestId: 'req-fast' }),
    })

    render(<ProposeSpecModal open={true} onClose={onCloseMock} tickets={emptyTickets} />)
    const textarea = screen.getByPlaceholderText(/add a dark mode toggle/i)
    fireEvent.change(textarea, { target: { value: 'Fast spec' } })
    fireEvent.click(screen.getByRole('button', { name: /generate spec/i }))

    await waitFor(() => {
      expect(mockRegisterFastSpec).toHaveBeenCalledWith('req-fast', expect.objectContaining({ projectId: 'proj-1' }))
    })
  })
})
