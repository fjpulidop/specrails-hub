import { useEffect } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import type { Attachment } from '../types'
import { attachmentFileUrl } from '../lib/attachments'
import { cn } from '../lib/utils'

interface Props {
  ticketKey: string | number
  attachment: Attachment | null
  onClose: () => void
}

export function AttachmentPreviewLightbox({ ticketKey, attachment, onClose }: Props) {
  useEffect(() => {
    if (!attachment) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [attachment, onClose])

  if (!attachment) return null

  const url = attachmentFileUrl(ticketKey, attachment.id)
  const isImage = attachment.mimeType.startsWith('image/')
  const isPdf = attachment.mimeType === 'application/pdf'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.filename}`}
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to hub"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-white/85 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 text-center min-w-0 px-4">
          <div className="text-sm font-medium text-white/95 truncate">{attachment.filename}</div>
          <div className="text-[11px] text-white/50">{attachment.mimeType}</div>
        </div>
        <a
          href={url}
          download={attachment.filename}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-white/85 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Download"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>

      {/* Body */}
      <div
        className={cn('flex-1 flex items-center justify-center overflow-auto p-6')}
        onClick={onClose}
      >
        {isImage ? (
          <img
            src={url}
            alt={attachment.filename}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
          />
        ) : isPdf ? (
          <iframe
            src={url}
            title={attachment.filename}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full max-w-5xl bg-white rounded-lg shadow-2xl"
          />
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="text-center text-white/80 px-8 py-10 rounded-lg bg-white/5 border border-white/10"
          >
            <p className="text-sm mb-3">Preview not available for this file type.</p>
            <a
              href={url}
              download={attachment.filename}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Download {attachment.filename}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
