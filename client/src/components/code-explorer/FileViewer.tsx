import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, FileMinus2, FilePlus2, FileText, GitCommitHorizontal } from 'lucide-react'
import { getApiBase } from '../../lib/api'
import { useHub } from '../../hooks/useHub'
import { useSharedWebSocket } from '../../hooks/useSharedWebSocket'
import { useTicketDetailModal } from '../../context/TicketDetailModalContext'
import { CodeViewerMonaco } from './CodeViewerMonaco'
import { SummaryHeader, type SummaryPayload } from './SummaryHeader'
import { MarkdownPreview } from './MarkdownPreview'

function isMarkdown(relPath: string, language?: string): boolean {
  if (language === 'markdown' || language === 'md') return true
  return /\.(md|mdx|markdown)$/i.test(relPath)
}

interface FileViewerProps {
  relPath: string
  onFilterJob?: (jobId: string) => void
  onSummaryActionChange?: (action: SummaryAction | null) => void
  onCopyPathActionChange?: (action: CopyPathAction | null) => void
}

export interface SummaryAction {
  hasSummary: boolean
  regenerating: boolean
  disabledReason: string | null
  onClick: () => void
}

export interface CopyPathAction {
  onClick: () => void
}

interface FileResponse {
  content?: string
  reason?: 'not-found'
  encoding?: string
  language?: string
  binary?: boolean
  sizeBytes?: number
  mime?: string
  tooLarge?: boolean
  summary?: SummaryPayload | null
  summaryStale?: boolean
  absolutePath?: string
  provenance?: ProvenanceRow[]
}

interface ProvenanceRow {
  path: string
  ticketId: number | null
  jobId: string | null
  kind: 'created' | 'modified' | 'deleted'
  at: number
}

const DEFAULT_HISTORY_HEIGHT = 180
const MIN_HISTORY_HEIGHT = 120
const MIN_VIEWER_BODY_HEIGHT = 240

function summaryCollapsedKey(projectId: string | null): string | null {
  return projectId ? `specrails-hub:code-summary-collapsed:${projectId}` : null
}

function historyHeightKey(projectId: string | null): string | null {
  return projectId ? `specrails-hub:code-history-height:${projectId}` : null
}

function historyCollapsedKey(projectId: string | null): string | null {
  return projectId ? `specrails-hub:code-history-collapsed:${projectId}` : null
}

function loadHistoryHeight(projectId: string | null): number {
  const key = historyHeightKey(projectId)
  if (!key) return DEFAULT_HISTORY_HEIGHT
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HISTORY_HEIGHT
  } catch {
    return DEFAULT_HISTORY_HEIGHT
  }
}

function saveHistoryHeight(projectId: string | null, height: number): void {
  const key = historyHeightKey(projectId)
  if (!key) return
  try { localStorage.setItem(key, String(Math.round(height))) } catch { /* ignore */ }
}

function loadSummaryCollapsed(projectId: string | null): boolean {
  const key = summaryCollapsedKey(projectId)
  if (!key) return false
  try { return localStorage.getItem(key) === 'true' } catch { return false }
}

function saveSummaryCollapsed(projectId: string | null, collapsed: boolean): void {
  const key = summaryCollapsedKey(projectId)
  if (!key) return
  try { localStorage.setItem(key, collapsed ? 'true' : 'false') } catch { /* ignore */ }
}

function loadHistoryCollapsed(projectId: string | null): boolean {
  const key = historyCollapsedKey(projectId)
  if (!key) return false
  try { return localStorage.getItem(key) === 'true' } catch { return false }
}

function saveHistoryCollapsed(projectId: string | null, collapsed: boolean): void {
  const key = historyCollapsedKey(projectId)
  if (!key) return
  try { localStorage.setItem(key, collapsed ? 'true' : 'false') } catch { /* ignore */ }
}

function clampHistoryHeight(height: number, containerHeight: number): number {
  const max = Math.max(MIN_HISTORY_HEIGHT, containerHeight - MIN_VIEWER_BODY_HEIGHT)
  return Math.min(Math.max(height, MIN_HISTORY_HEIGHT), max)
}

export function FileViewer({ relPath, onFilterJob, onSummaryActionChange, onCopyPathActionChange }: FileViewerProps) {
  const { activeProjectId } = useHub()
  const { openTicketDetail } = useTicketDetailModal()
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [file, setFile] = useState<FileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [budgetPromptOpen, setBudgetPromptOpen] = useState(false)
  const [summaryCollapsed, setSummaryCollapsed] = useState(() => loadSummaryCollapsed(activeProjectId))
  const [historyHeight, setHistoryHeight] = useState(() => loadHistoryHeight(activeProjectId))
  const [historyCollapsed, setHistoryCollapsed] = useState(() => loadHistoryCollapsed(activeProjectId))

  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])
  const relPathRef = useRef(relPath)
  useEffect(() => { relPathRef.current = relPath }, [relPath])

  useEffect(() => {
    const height = viewerRef.current?.clientHeight || window.innerHeight
    setSummaryCollapsed(loadSummaryCollapsed(activeProjectId))
    setHistoryHeight(clampHistoryHeight(loadHistoryHeight(activeProjectId), height))
    setHistoryCollapsed(loadHistoryCollapsed(activeProjectId))
  }, [activeProjectId])

  const beginHistoryResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY
    const startHeight = historyHeight
    const containerHeight = viewerRef.current?.clientHeight || window.innerHeight
    const target = e.currentTarget
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    function onMove(ev: PointerEvent) {
      setHistoryHeight(clampHistoryHeight(startHeight + (startY - ev.clientY), containerHeight))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setHistoryHeight((prev) => {
        const next = clampHistoryHeight(prev, containerHeight)
        saveHistoryHeight(activeProjectId, next)
        return next
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [activeProjectId, historyHeight])

  const resetHistoryHeight = useCallback(() => {
    const height = viewerRef.current?.clientHeight || window.innerHeight
    const next = clampHistoryHeight(DEFAULT_HISTORY_HEIGHT, height)
    setHistoryHeight(next)
    saveHistoryHeight(activeProjectId, next)
  }, [activeProjectId])

  const toggleSummaryCollapsed = useCallback(() => {
    setSummaryCollapsed((prev) => {
      const next = !prev
      saveSummaryCollapsed(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

  const toggleHistoryCollapsed = useCallback(() => {
    setHistoryCollapsed((prev) => {
      const next = !prev
      saveHistoryCollapsed(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

  useEffect(() => {
    setRegenerating(false)
    setBudgetPromptOpen(false)
    setMarkdownMode('preview')
  }, [relPath])

  const reqIdRef = useRef(0)
  const fetchFile = useCallback(async () => {
    // Monotonic request id: a slower fetch for a previously-selected file can
    // resolve after a newer one — ignore any response that is no longer current
    // so the viewer never shows the wrong file's content.
    const myReq = ++reqIdRef.current
    setLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/code/file?path=${encodeURIComponent(relPath)}`)
      if (myReq !== reqIdRef.current) return
      if (!res.ok) {
        setFile(null)
        return
      }
      const json = (await res.json()) as FileResponse
      if (myReq !== reqIdRef.current) return
      setFile(json)
    } catch {
      if (myReq === reqIdRef.current) setFile(null)
    } finally {
      if (myReq === reqIdRef.current) setLoading(false)
    }
    // activeProjectId: getApiBase() is project-scoped, so a project switch (with
    // the same relPath) must refetch against the new project.
  }, [relPath, activeProjectId])

  useEffect(() => { fetchFile() }, [fetchFile])

  useEffect(() => {
    if (!activeProjectId) return
    const id = `code-file-${activeProjectId}`
    registerHandler(id, (raw) => {
      const msg = raw as { type?: string; projectId?: string; path?: string; reason?: string }
      if (msg.projectId !== activeProjectIdRef.current) return
      if (msg.type === 'file.summary_updated' && msg.path === relPathRef.current) {
        setRegenerating(false)
        fetchFile()
      } else if (msg.type === 'file.summary_failed' && msg.path === relPathRef.current) {
        toast.error(msg.reason ?? 'Summary generation failed')
        setRegenerating(false)
      } else if (msg.type === 'file.summary_skipped' && msg.path === relPathRef.current) {
        if (msg.reason) toast(`Summary skipped: ${msg.reason}`)
        setRegenerating(false)
      }
    })
    return () => unregisterHandler(id)
  }, [activeProjectId, registerHandler, unregisterHandler, fetchFile])

  const handleRegenerate = useCallback(async (overrideBudget: boolean) => {
    setRegenerating(true)
    try {
      const res = await fetch(
        `${getApiBase()}/code/file/regenerate-summary?path=${encodeURIComponent(relPath)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ overrideBudget }),
        },
      )
      const json = await res.json().catch(() => ({})) as { skipped?: string }
      if (!res.ok) {
        setRegenerating(false)
        const skipped = typeof json.skipped === 'string' ? json.skipped : null
        toast.error(skipped ? `Summary skipped: ${skipped}` : 'Summary generation failed')
        return
      }
      if (json.skipped === 'budget') {
        setRegenerating(false)
        setBudgetPromptOpen(true)
        return
      }
      // ttl / not-found / per-job-cap come back as 200 with a `skipped` reason —
      // tell the user it was dropped instead of silently clearing the spinner.
      if (json.skipped) {
        setRegenerating(false)
        toast(`Summary skipped: ${json.skipped}`)
        return
      }
      await fetchFile()
      setRegenerating(false)
    } catch {
      setRegenerating(false)
      toast.error('Summary generation failed')
    }
  }, [fetchFile, relPath])

  const copyAbsolutePath = useCallback(async () => {
    const abs = file?.absolutePath ?? relPath
    try {
      // writeText rejects ASYNC (insecure origin, unfocused doc, Tauri webview);
      // await so a failure doesn't leak an unhandled rejection AND so the success
      // toast only fires when the clipboard actually received the path.
      await navigator.clipboard?.writeText(abs)
      toast.success('Path copied')
    } catch {
      toast.error('Could not copy path')
    }
  }, [file, relPath])

  // Hook order must be stable across renders — declare BEFORE any early return.
  const markdown = useMemo(() => isMarkdown(relPath, file?.language), [relPath, file?.language])
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'raw'>('preview')

  const summary = file?.summary ?? null
  const stale = !!file?.summaryStale
  const provenance = file?.provenance ?? []
  const missing = file?.reason === 'not-found'
  const summaryDisabledReason = missing
    ? 'file missing'
    : file?.binary
      ? 'binary file'
      : file?.tooLarge
        ? 'file too large'
        : null

  useEffect(() => {
    if (!onSummaryActionChange) return
    if (loading && !file) {
      onSummaryActionChange(null)
      return
    }
    onSummaryActionChange({
      hasSummary: !!summary,
      regenerating,
      disabledReason: summaryDisabledReason,
      onClick: () => handleRegenerate(false),
    })
    return () => onSummaryActionChange(null)
  }, [file, handleRegenerate, loading, onSummaryActionChange, regenerating, summary, summaryDisabledReason])

  useEffect(() => {
    if (!onCopyPathActionChange) return
    if (loading && !file) {
      onCopyPathActionChange(null)
      return
    }
    onCopyPathActionChange({ onClick: copyAbsolutePath })
    return () => onCopyPathActionChange(null)
  }, [copyAbsolutePath, file, loading, onCopyPathActionChange])

  if (loading && !file) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading file…
      </div>
    )
  }

  return (
    <div ref={viewerRef} className="flex flex-col h-full" data-testid="file-viewer">
      {summaryCollapsed ? (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface px-4" data-testid="summary-header-collapsed">
          <span className="truncate text-xs text-muted-foreground">{relPath}</span>
          <button
            type="button"
            onClick={toggleSummaryCollapsed}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Show summary
          </button>
        </div>
      ) : (
        <SummaryHeader
          path={relPath}
          summary={summary}
          stale={stale}
          regenerating={regenerating}
          generateDisabledReason={summaryDisabledReason}
          onCollapse={toggleSummaryCollapsed}
        />
      )}
      <div className="px-4 py-1 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {markdown && file?.content !== undefined && !file.binary && !file.tooLarge && (
            <div className="flex items-center gap-1 text-[11px]" role="group" aria-label="Markdown view mode">
              <button
                type="button"
                onClick={() => setMarkdownMode('preview')}
                aria-pressed={markdownMode === 'preview'}
                className={
                  markdownMode === 'preview'
                    ? 'px-2 py-1 rounded-md bg-accent-primary/20 text-accent-primary'
                    : 'px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setMarkdownMode('raw')}
                aria-pressed={markdownMode === 'raw'}
                className={
                  markdownMode === 'raw'
                    ? 'px-2 py-1 rounded-md bg-accent-primary/20 text-accent-primary'
                    : 'px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              >
                Raw
              </button>
            </div>
          )}
        </div>
        <span />
      </div>
      <div className="flex-1 overflow-hidden">
        {missing ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground" data-testid="file-missing">
            This file was touched by an AI job but no longer exists in the working tree.
          </div>
        ) : file?.binary ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground" data-testid="file-binary">
            Binary file.
          </div>
        ) : file?.tooLarge ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground" data-testid="file-too-large">
            File too large to preview ({Math.round((file.sizeBytes ?? 0) / 1024 / 1024)} MB).
          </div>
        ) : file?.content !== undefined ? (
          markdown && markdownMode === 'preview' ? (
            <div
              className="h-full overflow-auto px-6 py-4 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-pre:bg-muted/40 prose-pre:rounded-md prose-code:before:content-none prose-code:after:content-none"
              data-testid="markdown-preview"
            >
              <MarkdownPreview content={file.content} />
            </div>
          ) : (
            <CodeViewerMonaco content={file.content} language={file.language ?? 'plaintext'} />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No content available.
          </div>
        )}
      </div>
      {provenance.length > 0 && (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize AI touch history"
            onPointerDown={historyCollapsed ? undefined : beginHistoryResize}
            onDoubleClick={historyCollapsed ? undefined : resetHistoryHeight}
            className={
              historyCollapsed
                ? 'flex h-8 shrink-0 items-center justify-between border-t border-border bg-card/35 px-4'
                : 'flex h-8 shrink-0 cursor-row-resize items-center justify-between border-y border-border/40 bg-card/35 px-4 hover:bg-accent-primary/10'
            }
            title={historyCollapsed ? undefined : 'Drag to resize. Double-click to reset.'}
            data-testid="code-history-resizer"
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              AI touch history · {provenance.length} {provenance.length === 1 ? 'change' : 'changes'}
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleHistoryCollapsed}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              {historyCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {historyCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>
          {!historyCollapsed && (
            <ProvenanceTimeline
              rows={provenance}
              onOpenTicket={openTicketDetail}
              onFilterJob={onFilterJob}
              height={historyHeight}
            />
          )}
        </>
      )}

      {budgetPromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          data-testid="budget-prompt"
        >
          <div className="bg-card border border-border rounded-lg p-4 w-80 flex flex-col gap-3">
            <p className="text-sm text-foreground">Override the budget cap?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBudgetPromptOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setBudgetPromptOpen(false); handleRegenerate(true) }}
                className="text-xs px-3 py-1.5 rounded-md bg-accent-primary text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProvenanceTimeline({
  rows,
  onOpenTicket,
  onFilterJob,
  height,
}: {
  rows: ProvenanceRow[]
  onOpenTicket: (ticketId: number) => void
  onFilterJob?: (jobId: string) => void
  height: number
}) {
  const [openDiffKey, setOpenDiffKey] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, { patch: string; truncated: boolean } | 'missing' | 'loading'>>({})
  if (rows.length === 0) return null

  async function toggleDiff(row: ProvenanceRow, key: string) {
    if (openDiffKey === key) {
      setOpenDiffKey(null)
      return
    }
    setOpenDiffKey(key)
    if (!row.jobId || diffs[key]) return
    setDiffs((prev) => ({ ...prev, [key]: 'loading' }))
    try {
      const params = new URLSearchParams({ jobId: row.jobId, path: row.path })
      const res = await fetch(`${getApiBase()}/code/diff?${params.toString()}`)
      if (res.status === 404) {
        setDiffs((prev) => ({ ...prev, [key]: 'missing' }))
        return
      }
      if (!res.ok) throw new Error('diff failed')
      const json = await res.json() as { patch?: string; truncated?: boolean }
      setDiffs((prev) => ({ ...prev, [key]: { patch: json.patch ?? '', truncated: json.truncated === true } }))
    } catch {
      setDiffs((prev) => ({ ...prev, [key]: 'missing' }))
    }
  }

  return (
    <div
      className="shrink-0 border-t border-border bg-card/40 px-4 py-3 overflow-hidden"
      style={{ height }}
      data-testid="file-provenance-timeline"
    >
      <div className="h-full overflow-auto space-y-1">
        {rows.map((row, index) => {
          const Icon = row.kind === 'created' ? FilePlus2 : row.kind === 'deleted' ? FileMinus2 : FileText
          const job = row.jobId ? (row.jobId.length > 12 ? row.jobId.slice(0, 12) : row.jobId) : 'unknown job'
          const diffKey = `${row.jobId ?? 'job'}:${row.path}:${row.at}:${index}`
          const diffState = diffs[diffKey]
          return (
            <div key={diffKey} className="rounded-md hover:bg-muted/40">
              <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)_auto] items-center gap-2 text-xs px-2 py-1.5">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="capitalize">{row.kind}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground">
                  <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" />
                  {row.jobId && onFilterJob ? (
                    <button
                      type="button"
                      onClick={() => onFilterJob(row.jobId!)}
                      className="font-mono truncate hover:text-foreground"
                      title={`Filter Code by job ${row.jobId}`}
                    >
                      {job}
                    </button>
                  ) : (
                    <span className="font-mono truncate" title={row.jobId ?? undefined}>{job}</span>
                  )}
                  {row.jobId && (
                    <button
                      type="button"
                      onClick={() => toggleDiff(row, diffKey)}
                      className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Diff
                    </button>
                  )}
                  {typeof row.ticketId === 'number' && (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(row.ticketId!)}
                      className="shrink-0 rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] text-accent-primary hover:bg-accent-primary/25"
                      title={`Open spec #${row.ticketId}`}
                    >
                      spec #{row.ticketId}
                    </button>
                  )}
                </span>
                <time className="text-[11px] text-muted-foreground" dateTime={new Date(row.at).toISOString()}>
                  {new Date(row.at).toLocaleString()}
                </time>
              </div>
              {openDiffKey === diffKey && (
                <div className="px-2 pb-2">
                  {diffState === 'loading' ? (
                    <div className="rounded-md bg-muted/35 px-2 py-2 text-[11px] text-muted-foreground">Loading diff...</div>
                  ) : diffState === 'missing' || !diffState ? (
                    <div className="rounded-md bg-muted/35 px-2 py-2 text-[11px] text-muted-foreground">
                      Diff unavailable for this historical touch. New jobs will store patches automatically.
                    </div>
                  ) : (
                    <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 px-2 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
                      {diffState.patch}
                      {diffState.truncated ? '\n[diff truncated]' : ''}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FileViewer
