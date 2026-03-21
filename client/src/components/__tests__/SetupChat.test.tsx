import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))

import { SetupChat } from '../SetupChat'

const baseProps = {
  projectId: 'proj-1',
  messages: [],
  isStreaming: false,
  streamingText: '',
  sessionId: null,
  onSendMessage: vi.fn(),
}

describe('SetupChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Setup assistant header', () => {
    render(<SetupChat {...baseProps} />)
    expect(screen.getByText('Setup assistant')).toBeInTheDocument()
  })

  it('renders the subheader text', () => {
    render(<SetupChat {...baseProps} />)
    expect(screen.getByText(/respond to prompts/i)).toBeInTheDocument()
  })

  it('shows loading spinner when no messages and not streaming', () => {
    render(<SetupChat {...baseProps} />)
    // Loading state shows "Setting up your project..."
    expect(screen.getByText(/setting up your project/i)).toBeInTheDocument()
  })

  it('does not show loading spinner when messages exist', () => {
    render(
      <SetupChat
        {...baseProps}
        messages={[{ role: 'assistant', text: 'Hello' }]}
      />
    )
    expect(screen.queryByText(/setting up your project/i)).toBeNull()
  })

  it('renders assistant message', () => {
    render(
      <SetupChat
        {...baseProps}
        messages={[{ role: 'assistant', text: 'What is your project about?' }]}
      />
    )
    expect(screen.getByText('What is your project about?')).toBeInTheDocument()
  })

  it('renders user message', () => {
    render(
      <SetupChat
        {...baseProps}
        messages={[{ role: 'user', text: 'A task management app' }]}
      />
    )
    expect(screen.getByText('A task management app')).toBeInTheDocument()
  })

  it('renders multiple messages in order', () => {
    render(
      <SetupChat
        {...baseProps}
        messages={[
          { role: 'assistant', text: 'First message' },
          { role: 'user', text: 'User reply' },
          { role: 'assistant', text: 'Second message' },
        ]}
      />
    )
    expect(screen.getByText('First message')).toBeInTheDocument()
    expect(screen.getByText('User reply')).toBeInTheDocument()
    expect(screen.getByText('Second message')).toBeInTheDocument()
  })

  it('renders textarea input', () => {
    render(<SetupChat {...baseProps} />)
    expect(screen.getByPlaceholderText(/type a response/i)).toBeInTheDocument()
  })

  it('renders send button', () => {
    render(<SetupChat {...baseProps} />)
    // Send button exists (has Send icon but no text label — find by role)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('send button is disabled when input is empty', () => {
    render(<SetupChat {...baseProps} />)
    const buttons = screen.getAllByRole('button')
    const sendBtn = buttons[buttons.length - 1]
    expect(sendBtn).toBeDisabled()
  })

  it('send button is disabled when isStreaming=true even with text', () => {
    render(<SetupChat {...baseProps} isStreaming={true} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    fireEvent.change(textarea, { target: { value: 'hello' } })
    const buttons = screen.getAllByRole('button')
    const sendBtn = buttons[buttons.length - 1]
    expect(sendBtn).toBeDisabled()
  })

  it('calls onSendMessage when send button is clicked with text', () => {
    const onSendMessage = vi.fn()
    render(<SetupChat {...baseProps} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    fireEvent.change(textarea, { target: { value: 'My message' } })
    const buttons = screen.getAllByRole('button')
    const sendBtn = buttons[buttons.length - 1]
    fireEvent.click(sendBtn)
    expect(onSendMessage).toHaveBeenCalledWith('My message')
  })

  it('clears input after sending', () => {
    render(<SetupChat {...baseProps} />)
    const textarea = screen.getByPlaceholderText(/type a response/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'My message' } })
    fireEvent.click(screen.getAllByRole('button')[screen.getAllByRole('button').length - 1])
    expect(textarea.value).toBe('')
  })

  it('sends on Enter key (no shift)', () => {
    const onSendMessage = vi.fn()
    render(<SetupChat {...baseProps} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    fireEvent.change(textarea, { target: { value: 'Enter message' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSendMessage).toHaveBeenCalledWith('Enter message')
  })

  it('does not send on Shift+Enter', () => {
    const onSendMessage = vi.fn()
    render(<SetupChat {...baseProps} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    fireEvent.change(textarea, { target: { value: 'Multi-line' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('disables textarea when isStreaming=true', () => {
    render(<SetupChat {...baseProps} isStreaming={true} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    expect(textarea).toBeDisabled()
  })

  it('shows streaming text bubble when isStreaming=true with text', () => {
    render(<SetupChat {...baseProps} isStreaming={true} streamingText="Thinking about your project..." />)
    expect(screen.getByText('Thinking about your project...')).toBeInTheDocument()
  })

  it('shows bouncing dots when isStreaming=true but no streamingText', () => {
    render(<SetupChat {...baseProps} isStreaming={true} streamingText="" />)
    // Three bouncing dots — check for animate-bounce class
    const dots = document.querySelectorAll('.animate-bounce')
    expect(dots.length).toBe(3)
  })

  it('renders keyboard hint text', () => {
    render(<SetupChat {...baseProps} />)
    expect(screen.getByText(/enter to send/i)).toBeInTheDocument()
  })

  it('does not call onSendMessage when input is whitespace only', () => {
    const onSendMessage = vi.fn()
    render(<SetupChat {...baseProps} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/type a response/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})
