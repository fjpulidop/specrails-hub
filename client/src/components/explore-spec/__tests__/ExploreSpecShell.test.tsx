import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ExploreSpecShell } from '../ExploreSpecShell'
import { SharedWebSocketContext } from '../../../hooks/useSharedWebSocket'

const mockStartWithMessage = vi.fn().mockResolvedValue('conv-1')
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const conversationsRef: { value: Array<{
  id: string; title: string | null; model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  isStreaming: boolean; streamingText: string; commandProposals: string[]
}> } = { value: [] }

vi.mock('../../../hooks/useChat', () => ({
  useChatContext: () => ({
    conversations: conversationsRef.value,
    activeTabIndex: 0,
    startWithMessage: mockStartWithMessage,
    sendMessage: mockSendMessage,
    abortStream: vi.fn(),
    confirmCommand: vi.fn(),
    dismissCommandProposal: vi.fn(),
    changeConversationModel: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    isPanelOpen: false,
    togglePanel: vi.fn(),
    setActiveTabIndex: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useHub', () => ({
  useHub: () => ({ activeProjectId: 'proj-1', projects: [] }),
}))

vi.mock('../../../lib/api', () => ({
  getApiBase: () => '/api/projects/proj-1',
}))

// Mock RichAttachmentEditor as a plain textarea so tests stay focused on
// the shell's wiring, not on the editor's drop / upload internals.
vi.mock('../../RichAttachmentEditor', () => ({
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
      resetHeight: () => {},
      clear: () => { if (inputRef.current) inputRef.current.value = '' },
    }))
    return (
      <textarea
        ref={inputRef}
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        onChange={() => props.onChange?.()}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) props.onSubmit?.() }}
      />
    )
  }),
}))

function makeFakeWs() {
  const handlers = new Map<string, (m: unknown) => void>()
  return {
    registerHandler: (id: string, fn: (m: unknown) => void) => handlers.set(id, fn),
    unregisterHandler: (id: string) => handlers.delete(id),
    connectionStatus: 'connected' as const,
    emit: (msg: unknown) => handlers.forEach((h) => h(msg)),
  }
}

function wrap(ws: ReturnType<typeof makeFakeWs>) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(SharedWebSocketContext.Provider, { value: ws }, children)
}

describe('ExploreSpecShell', () => {
  let onClose: ReturnType<typeof vi.fn>
  let onTicketCreated: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    onTicketCreated = vi.fn()
    conversationsRef.value = []
    mockStartWithMessage.mockClear()
    mockStartWithMessage.mockResolvedValue('conv-1')
    mockSendMessage.mockClear()
  })

  it('starts the conversation with the slash-command prefix on mount', async () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="dark mode" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} onTicketCreated={onTicketCreated} />, { wrapper: wrap(ws) })
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalled()
    })
    const arg = mockStartWithMessage.mock.calls[0][0] as string
    expect(arg).toContain('/specrails:explore-spec')
    expect(arg).toContain('dark mode')
  })

  it('passes initialAttachmentIds + pendingSpecId to startWithMessage when present', async () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="dark" pendingSpecId="pending-XYZ" initialAttachmentIds={['a-1', 'a-2']} onClose={onClose} />, { wrapper: wrap(ws) })
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalled()
    })
    const opts = mockStartWithMessage.mock.calls[0][1] as { attachments?: { ticketKey: string; ids: string[] } }
    expect(opts.attachments).toEqual({ ticketKey: 'pending-XYZ', ids: ['a-1', 'a-2'] })
  })

  it('omits attachments option when no initial attachments are supplied', async () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="dark" pendingSpecId="p" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    await waitFor(() => {
      expect(mockStartWithMessage).toHaveBeenCalled()
    })
    const opts = mockStartWithMessage.mock.calls[0][1] as { attachments?: unknown }
    expect(opts.attachments).toBeUndefined()
  })

  it('renders eyebrow and dialog role for accessibility', async () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/EXPLORE SPEC/i)).toBeInTheDocument()
  })

  it('shows the loading state until the conversation is bootstrapped', () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    expect(screen.getByText(/Starting conversation/i)).toBeInTheDocument()
  })

  it('Esc on bare-initial overlay closes without confirm', async () => {
    const ws = makeFakeWs()
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Esc with conversation in progress does NOT close immediately (confirm-discard guard)', async () => {
    const ws = makeFakeWs()
    conversationsRef.value = [{
      id: 'conv-1', title: null, model: 'sonnet',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'response' },
      ],
      isStreaming: false, streamingText: '', commandProposals: [],
    }]
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    // Wait for the conversation to actually be looked up (assistant message in DOM)
    await screen.findByText('response')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking a chip sends it as the next user message', async () => {
    const ws = makeFakeWs()
    conversationsRef.value = [{
      id: 'conv-1', title: null, model: 'sonnet',
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }],
      isStreaming: false, streamingText: '', commandProposals: [],
    }]
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    await screen.findByText('ok')

    // Inject a draft update with chips via the WS
    ws.emit({
      type: 'spec_draft.update',
      conversationId: 'conv-1',
      draft: { title: 'X' },
      ready: false,
      chips: ['Looks good', 'Smaller scope'],
      changedFields: [],
      timestamp: '',
    })

    const chipBtn = await screen.findByRole('button', { name: 'Looks good' })
    fireEvent.click(chipBtn)
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('conv-1', 'Looks good', expect.any(Object))
    })
  })

  it('disables Send button while assistant is streaming', async () => {
    const ws = makeFakeWs()
    conversationsRef.value = [{
      id: 'conv-1', title: null, model: 'sonnet',
      messages: [{ role: 'user', content: 'hi' }],
      isStreaming: true, streamingText: 'thinking...', commandProposals: [],
    }]
    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} />, { wrapper: wrap(ws) })
    await waitFor(() => expect(mockStartWithMessage).toHaveBeenCalled())
    const sendBtn = screen.getByRole('button', { name: /streaming|send/i })
    expect(sendBtn).toBeDisabled()
  })

  it('calls onTicketCreated and onClose after a successful Create Spec POST', async () => {
    const ws = makeFakeWs()
    conversationsRef.value = [{
      id: 'conv-1', title: null, model: 'sonnet',
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }],
      isStreaming: false, streamingText: '', commandProposals: [],
    }]
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: { id: 99, title: 'Z' } }),
    })
    ;(global as unknown as { fetch: typeof fetch }).fetch = fakeFetch as unknown as typeof fetch

    render(<ExploreSpecShell initialIdea="hi" pendingSpecId="pending-1" initialAttachmentIds={[]} onClose={onClose} onTicketCreated={onTicketCreated} />, { wrapper: wrap(ws) })
    await screen.findByText('ok')

    ws.emit({
      type: 'spec_draft.update',
      conversationId: 'conv-1',
      draft: { title: 'My title' },
      ready: true,
      chips: [],
      changedFields: ['title'],
      timestamp: '',
    })

    const createBtn = await screen.findByRole('button', { name: /create spec from current draft/i })
    fireEvent.click(createBtn)
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/from-draft'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(onTicketCreated).toHaveBeenCalledWith({ id: 99, title: 'Z' })
      expect(onClose).toHaveBeenCalled()
    })
  })
})
