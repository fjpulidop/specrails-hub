import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '../ChatInput'

const defaultProps = {
  conversationId: 'conv-1',
  model: 'claude-sonnet-4-5',
  hasMessages: false,
  isStreaming: false,
  onSend: vi.fn(),
  onAbort: vi.fn(),
}

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders textarea and send button', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument()
  })

  it('send button is disabled when textarea is empty', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Send/i })).toBeDisabled()
  })

  it('send button enables when text is entered', async () => {
    const user = userEvent.setup()
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Message...')
    await user.type(textarea, 'Hello')
    expect(screen.getByRole('button', { name: /Send/i })).not.toBeDisabled()
  })

  it('Enter key sends message and calls onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Message...')
    await user.type(textarea, 'Hello{Enter}')
    expect(onSend).toHaveBeenCalledWith('conv-1', 'Hello')
  })

  it('Shift+Enter adds newline instead of sending', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Message...')
    await user.type(textarea, 'Hello{Shift>}{Enter}{/Shift}World')
    expect(onSend).not.toHaveBeenCalled()
    expect((textarea as HTMLTextAreaElement).value).toContain('Hello')
    expect((textarea as HTMLTextAreaElement).value).toContain('World')
  })

  it('clicking Send button calls onSend with trimmed text', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Message...')
    await user.type(textarea, '  Hello  ')
    const sendBtn = screen.getByRole('button', { name: /Send/i })
    await user.click(sendBtn)
    expect(onSend).toHaveBeenCalledWith('conv-1', 'Hello')
  })

  it('textarea is cleared after sending', async () => {
    const user = userEvent.setup()
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Message...') as HTMLTextAreaElement
    await user.type(textarea, 'Hello{Enter}')
    expect(textarea.value).toBe('')
  })

  it('textarea is disabled while streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />)
    const textarea = screen.getByPlaceholderText('Message...')
    expect(textarea).toBeDisabled()
  })

  it('send button is disabled while streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />)
    expect(screen.getByRole('button', { name: /Send/i })).toBeDisabled()
  })

  it('shows Stop button when streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />)
    expect(screen.getByRole('button', { name: /Stop/i })).toBeInTheDocument()
  })

  it('Stop button calls onAbort with conversationId', async () => {
    const user = userEvent.setup()
    const onAbort = vi.fn()
    render(<ChatInput {...defaultProps} isStreaming={true} onAbort={onAbort} />)
    const stopBtn = screen.getByRole('button', { name: /Stop/i })
    await user.click(stopBtn)
    expect(onAbort).toHaveBeenCalledWith('conv-1')
  })

  it('Stop button is not shown when not streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={false} />)
    expect(screen.queryByRole('button', { name: /Stop/i })).not.toBeInTheDocument()
  })

  it('model selector is rendered', () => {
    render(<ChatInput {...defaultProps} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
  })

  it('model selector shows current model', () => {
    render(<ChatInput {...defaultProps} model="claude-sonnet-4-6" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('claude-sonnet-4-6')
  })

  it('model selector is disabled when hasMessages is true', () => {
    render(<ChatInput {...defaultProps} hasMessages={true} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeDisabled()
  })

  it('model selector is enabled when hasMessages is false', () => {
    render(<ChatInput {...defaultProps} hasMessages={false} />)
    const select = screen.getByRole('combobox')
    expect(select).not.toBeDisabled()
  })
})
