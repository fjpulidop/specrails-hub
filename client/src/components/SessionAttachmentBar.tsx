import { useRef } from 'react'
import type { Attachment } from '../types'
import { ATTACHMENT_ACCEPT_MIME, uploadAttachment } from '../lib/attachments'
import { AttachmentChip } from './AttachmentChip'
import { cn } from '../lib/utils'

interface Props {
  ticketKey: string | number
  sessionIds: string[]
  ticketAttachments: Attachment[]
  onRemoveFromSession: (id: string) => void
  onAddAttachment: (attachment: Attachment) => void
  onError?: (message: string) => void
  disabled?: boolean
  readOnly?: boolean
  className?: string
}

export function SessionAttachmentBar({
  ticketKey,
  sessionIds,
  ticketAttachments,
  onRemoveFromSession,
  onAddAttachment,
  onError,
  disabled,
  readOnly,
  className,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeAttachments = sessionIds
    .map((id) => ticketAttachments.find((a) => a.id === id))
    .filter((a): a is Attachment => !!a)

  const handleBrowse = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length === 0) return
    for (const file of files) {
      try {
        const attachment = await uploadAttachment(ticketKey, file)
        onAddAttachment(attachment)
      } catch (err) {
        onError?.(err instanceof Error ? err.message : `Upload failed: ${file.name}`)
      }
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 min-h-[32px]', className)}>
      {activeAttachments.map((a, i) => (
        <AttachmentChip
          key={a.id}
          attachment={a}
          index={i}
          onRemove={readOnly ? undefined : () => onRemoveFromSession(a.id)}
        />
      ))}
      {activeAttachments.length === 0 && (
        <span className="text-[11px] text-muted-foreground/60 italic pr-1">
          No pinned resources — drop files or click Add
        </span>
      )}
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={handleBrowse}
            disabled={disabled}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 bg-card/30 hover:bg-accent/40 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <span aria-hidden>+</span>
            <span>Add</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT_MIME}
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  )
}
