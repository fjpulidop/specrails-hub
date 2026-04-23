import { useRef, useCallback } from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { RichAttachmentEditor, type RichAttachmentEditorHandle } from './RichAttachmentEditor'
import { Button } from './ui/button'
import type { Attachment } from '../types'
import { cn } from '../lib/utils'

interface Props {
  ticketKey: string | number
  sessionIds: string[]
  onSessionIdsChange: (ids: string[]) => void
  onAttachmentAdded: (a: Attachment) => void
  onSubmit: (instructions: string, attachmentIds: string[]) => void
  onCancel: () => void
  disabled?: boolean
  busy?: boolean
  placeholder?: string
  submitLabel?: string
  className?: string
  title?: string
  subtitle?: string
}

export function AiEditComposer({
  ticketKey,
  sessionIds,
  onSessionIdsChange,
  onAttachmentAdded,
  onSubmit,
  onCancel,
  disabled,
  busy,
  placeholder = 'Describe the changes you want…',
  submitLabel = 'Submit',
  className,
  title = 'AI Edit',
  subtitle,
}: Props) {
  const editorRef = useRef<RichAttachmentEditorHandle | null>(null)

  const handleSubmit = useCallback(() => {
    const text = editorRef.current?.getPlainText().trim() ?? ''
    if (!text || busy) return
    // Editor's pills are the authoritative active session list
    const editorIds = editorRef.current?.getAttachmentIds() ?? []
    // Merge with existing sessionIds (in case some were added but not yet reflected as pills)
    const merged = Array.from(new Set([...sessionIds, ...editorIds]))
    onSubmit(text, merged)
    editorRef.current?.clear()
    onSessionIdsChange([])
  }, [busy, onSubmit, onSessionIdsChange, sessionIds])

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card shadow-lg p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary/80" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {subtitle && <span className="text-[11px] text-muted-foreground">· {subtitle}</span>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <RichAttachmentEditor
        ref={editorRef}
        ticketKey={ticketKey}
        placeholder={placeholder}
        minHeight={120}
        autoFocus
        disabled={disabled || busy}
        ariaLabel={title}
        onAttachmentAdded={(a) => {
          onAttachmentAdded(a)
          onSessionIdsChange(Array.from(new Set([...sessionIds, a.id])))
        }}
        onAttachmentRemoved={(a) => {
          onSessionIdsChange(sessionIds.filter((id) => id !== a.id))
        }}
        onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
        onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
        onSubmit={handleSubmit}
      />

      <div className="flex items-center justify-end mt-3 gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={disabled || busy} className="gap-1.5">
          <Send className="w-3.5 h-3.5" />
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
