import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test-utils'
import { SessionAttachmentBar } from '../SessionAttachmentBar'
import type { Attachment } from '../../types'

vi.mock('../../lib/attachments', () => ({
  uploadAttachment: vi.fn(),
  ATTACHMENT_ACCEPT_MIME: 'image/png,application/pdf',
}))

import { uploadAttachment } from '../../lib/attachments'

function makeAttachment(id: string, filename: string): Attachment {
  return { id, filename, storedName: `u-${filename}`, mimeType: 'image/png', size: 100, addedAt: '' }
}

describe('SessionAttachmentBar', () => {
  const onRemoveFromSession = vi.fn()
  const onAddAttachment = vi.fn()
  const onError = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders empty state when no session ids', () => {
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    expect(screen.getByText(/no pinned resources/i)).toBeInTheDocument()
  })

  it('renders chips for active session attachments', () => {
    const atts = [makeAttachment('a1', 'photo.png')]
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={['a1']}
        ticketAttachments={atts}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    expect(screen.getByText('photo.png')).toBeInTheDocument()
    expect(screen.queryByText(/no pinned resources/i)).not.toBeInTheDocument()
  })

  it('skips session ids not found in ticketAttachments', () => {
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={['missing-id']}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    expect(screen.getByText(/no pinned resources/i)).toBeInTheDocument()
  })

  it('renders Add button when not readOnly', () => {
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('hides Add button in readOnly mode', () => {
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
        readOnly
      />,
    )
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('calls onRemoveFromSession when chip remove clicked', async () => {
    vi.useFakeTimers()
    const atts = [makeAttachment('a1', 'photo.png')]
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={['a1']}
        ticketAttachments={atts}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    await vi.runAllTimersAsync()
    const removeBtn = screen.getByRole('button', { name: /remove photo\.png/i })
    fireEvent.click(removeBtn)
    await vi.runAllTimersAsync()
    expect(onRemoveFromSession).toHaveBeenCalledWith('a1')
    vi.useRealTimers()
  })

  it('calls onAddAttachment after successful upload via file input', async () => {
    const newAtt = makeAttachment('a2', 'doc.pdf')
    vi.mocked(uploadAttachment).mockResolvedValueOnce(newAtt)

    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
        onError={onError}
      />,
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(onAddAttachment).toHaveBeenCalledWith(newAtt))
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError when upload fails', async () => {
    vi.mocked(uploadAttachment).mockRejectedValueOnce(new Error('Upload failed'))

    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
        onError={onError}
      />,
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'x.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Upload failed'))
  })

  it('clicking Add button triggers file input click (handleBrowse)', () => {
    render(
      <SessionAttachmentBar
        ticketKey="1"
        sessionIds={[]}
        ticketAttachments={[]}
        onRemoveFromSession={onRemoveFromSession}
        onAddAttachment={onAddAttachment}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
