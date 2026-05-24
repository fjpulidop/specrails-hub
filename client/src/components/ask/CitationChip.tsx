// Per-kind clickable citation chip rendered in the answer view.

import { useNavigate } from 'react-router-dom'
import { useTicketDetailModal } from '../../context/TicketDetailModalContext'
import type { AskSource } from '../../lib/ask-client'

export interface CitationChipProps {
  n: number
  source: AskSource
  onActivate?: () => void
}

export function CitationChip({ n, source, onActivate }: CitationChipProps) {
  const navigate = useNavigate()
  const { openTicketDetail } = useTicketDetailModal()

  const click = () => {
    onActivate?.()
    switch (source.kind) {
      case 'ticket': {
        const id = source.ticket_id ? Number(source.ticket_id) : NaN
        if (Number.isFinite(id)) openTicketDetail(id)
        break
      }
      case 'job': {
        if (source.job_id) navigate(`/jobs/${source.job_id}`)
        break
      }
      case 'explore-turn': {
        if (source.conversation_id) navigate(`/specs?conversation=${source.conversation_id}`)
        break
      }
      case 'file-summary': {
        if (source.file_path) navigate(`/code?path=${encodeURIComponent(source.file_path)}`)
        break
      }
      case 'git-commit': {
        if (source.source_id?.startsWith('git:')) {
          const sha = source.source_id.slice(4)
          void navigator.clipboard?.writeText(sha)
        }
        break
      }
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      title={`${source.kind}: ${source.title}`}
      className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded-md bg-accent-primary/20 text-accent-primary text-[10px] font-medium hover:bg-accent-primary/40 transition-colors mx-0.5 align-middle"
    >
      {n}
    </button>
  )
}
