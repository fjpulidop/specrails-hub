import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FilePlus2, FileMinus2, GitCommitHorizontal } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import { FEATURE_CODE_EXPLORER } from '../../lib/feature-flags'

interface ProvenanceRow {
  path: string
  kind: 'created' | 'modified' | 'deleted'
  jobId: string | null
  at: number
}

interface Props {
  ticketId: number
  onClose: () => void
}

export function TicketFilesTouched({ ticketId, onClose }: Props) {
  if (!FEATURE_CODE_EXPLORER) return null

  const navigate = useNavigate()
  const [rows, setRows] = useState<ProvenanceRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${getApiBase()}/code/provenance?ticketId=${ticketId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProvenanceRow[]) => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [ticketId])

  if (!rows || rows.length === 0) return null

  return (
    <div>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
        Files touched by this ticket
      </span>
      <ul className="space-y-1">
        {rows.map((row, idx) => {
          const Icon = row.kind === 'created' ? FilePlus2 : row.kind === 'deleted' ? FileMinus2 : FileText
          return (
            <li key={`${row.path}-${idx}`}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(`/code?path=${encodeURIComponent(row.path)}`)
                }}
                className="w-full text-left flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono truncate flex-1">{row.path}</span>
                {row.jobId && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono shrink-0" title={`Job ${row.jobId}`}>
                    <GitCommitHorizontal className="h-3 w-3" />
                    {row.jobId.length > 10 ? row.jobId.slice(0, 10) : row.jobId}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
                  {row.kind}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
