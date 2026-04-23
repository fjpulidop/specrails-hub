import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { AiEditComposer } from '../AiEditComposer'

vi.mock('../RichAttachmentEditor', () => ({
  RichAttachmentEditor: React.forwardRef(function MockEditor(
    props: { placeholder?: string; ariaLabel?: string; onSubmit?: () => void; disabled?: boolean },
    ref: React.Ref<{ getPlainText: () => string; getAttachmentIds: () => string[]; insertPill: () => void; focus: () => void; clear: () => void }>,
  ) {
    const inputRef = React.useRef<HTMLTextAreaElement>(null)
    React.useImperativeHandle(ref, () => ({
      getPlainText: () => inputRef.current?.value ?? '',
      getAttachmentIds: () => [],
      insertPill: () => {},
      focus: () => inputRef.current?.focus(),
      clear: () => { if (inputRef.current) inputRef.current.value = '' },
    }))
    return (
      <textarea
        ref={inputRef}
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={() => {}}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) props.onSubmit?.() }}
      />
    )
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('AiEditComposer', () => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const onSessionIdsChange = vi.fn()
  const onAttachmentAdded = vi.fn()

  beforeEach(() => vi.resetAllMocks())

  function renderComposer(props: Partial<Parameters<typeof AiEditComposer>[0]> = {}) {
    return render(
      <AiEditComposer
        ticketKey="1"
        sessionIds={[]}
        onSessionIdsChange={onSessionIdsChange}
        onAttachmentAdded={onAttachmentAdded}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />,
    )
  }

  it('renders with default title', () => {
    renderComposer()
    expect(screen.getByText('AI Edit')).toBeInTheDocument()
  })

  it('renders custom title and subtitle', () => {
    renderComposer({ title: 'My Title', subtitle: 'My Subtitle' })
    expect(screen.getByText('My Title')).toBeInTheDocument()
    expect(screen.getByText(/My Subtitle/)).toBeInTheDocument()
  })

  it('calls onCancel when Close button clicked', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel button clicked', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit when Submit button clicked with text', () => {
    renderComposer({ submitLabel: 'Submit' })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'do the thing' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(onSubmit).toHaveBeenCalledWith('do the thing', [])
  })

  it('does not call onSubmit when textarea is empty', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables submit button when busy', () => {
    renderComposer({ busy: true })
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })
})
