import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Search, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { EventRow } from '../types'
import { hasMarkdownSyntax } from '../lib/markdown-detect'

// ─── Types ────────────────────────────────────────────────────────────────────

type FormattedLineType =
  | 'phase'
  | 'tool-use'
  | 'tool-result'
  | 'assistant'
  | 'stderr'
  | 'result'
  | 'log'
  | 'plain'
  | 'diff-add'
  | 'diff-remove'
  | 'diff-meta'
  | 'diff-hunk'

interface FormattedLine {
  id: string
  content: string
  type: FormattedLineType
  timestamp?: string
}

interface PhaseGroup {
  key: string
  header: FormattedLine | null  // null = preamble before first phase
  lines: FormattedLine[]
}

// ─── Event parsing ────────────────────────────────────────────────────────────

function parseEvent(event: EventRow, idx: number): FormattedLine | null {
  const id = `${event.id ?? idx}`
  const timestamp = event.timestamp

  if (event.event_type === 'log') {
    try {
      const payload = JSON.parse(event.payload) as { line?: string }
      const line = payload.line ?? ''
      if (!line.trim()) return null

      // Phase header detection
      if (line.startsWith('▸') || line.match(/^(architect|developer|reviewer|ship|analyst)\s*:/i)) {
        return { id, content: line, type: 'phase', timestamp }
      }

      if (event.source === 'stderr') {
        return { id, content: line, type: 'stderr', timestamp }
      }

      // Detect markdown content — lines from Claude's assistant output
      if (hasMarkdownSyntax(line)) {
        return { id, content: line, type: 'assistant', timestamp }
      }

      return { id, content: line, type: 'plain', timestamp }
    } catch {
      return null
    }
  }

  // assistant, tool_use, tool_result, user, system — their display text is
  // already persisted as separate 'log' events by the server, so skip the
  // raw structured events to avoid duplicates.
  if (event.event_type !== 'log' && event.event_type !== 'result') {
    return null
  }

  if (event.event_type === 'result') {
    try {
      const result = JSON.parse(event.payload) as {
        total_cost_usd?: number
        num_turns?: number
        duration_ms?: number
      }
      const parts: string[] = []
      if (result.duration_ms) parts.push(`${(result.duration_ms / 1000).toFixed(1)}s`)
      if (result.total_cost_usd) parts.push(`$${result.total_cost_usd.toFixed(4)}`)
      if (result.num_turns) parts.push(`${result.num_turns} turns`)
      return {
        id,
        content: `▸ Completed${parts.length ? ` — ${parts.join(' · ')}` : ''}`,
        type: 'result',
        timestamp,
      }
    } catch {
      return null
    }
  }

  return null
}

// ─── Diff detection ───────────────────────────────────────────────────────────
// Detects unified-diff lines (--- a/… +++ b/… @@ … +line -line)
// Only marks lines as diff types after seeing a proper diff header sequence.

function applyDiffDetection(lines: FormattedLine[]): FormattedLine[] {
  type DiffState = 'none' | 'saw_minus' | 'active'
  let diffState: DiffState = 'none'
  const out: FormattedLine[] = []

  for (const line of lines) {
    const t = line.type
    // Only scan plain/log lines for diff markers; phase/result/stderr etc. reset state
    if (t !== 'plain' && t !== 'log') {
      diffState = 'none'
      out.push(line)
      continue
    }
    const c = line.content
    if (c.startsWith('--- ')) {
      diffState = 'saw_minus'
      out.push({ ...line, type: 'diff-meta' })
    } else if (diffState === 'saw_minus' && c.startsWith('+++ ')) {
      diffState = 'active'
      out.push({ ...line, type: 'diff-meta' })
    } else if (diffState === 'active' && c.startsWith('@@ ')) {
      out.push({ ...line, type: 'diff-hunk' })
    } else if (diffState === 'active' && c.startsWith('+') && !c.startsWith('+++')) {
      out.push({ ...line, type: 'diff-add' })
    } else if (diffState === 'active' && c.startsWith('-') && !c.startsWith('---')) {
      out.push({ ...line, type: 'diff-remove' })
    } else if (diffState === 'active' && (c.startsWith(' ') || c === '')) {
      // unchanged line — keep plain but stay in diff mode
      out.push(line)
    } else {
      diffState = 'none'
      out.push(line)
    }
  }
  return out
}

// ─── Phase grouping ───────────────────────────────────────────────────────────

function groupByPhase(lines: FormattedLine[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [{ key: '__preamble__', header: null, lines: [] }]
  for (const line of lines) {
    if (line.type === 'phase') {
      groups.push({ key: line.id, header: line, lines: [] })
    } else {
      groups[groups.length - 1].lines.push(line)
    }
  }
  // Drop empty preamble
  return groups.filter((g) => g.header !== null || g.lines.length > 0)
}

// ─── LogViewer ────────────────────────────────────────────────────────────────

interface LogViewerProps {
  events: EventRow[]
  isLoading?: boolean
}

export function LogViewer({ events, isLoading }: LogViewerProps) {
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse → merge markdown → detect diffs (memoized — only recomputes when events change)
  const { processedLines, groups, totalLines } = useMemo(() => {
    const rawLines = events
      .map((ev, idx) => parseEvent(ev, idx))
      .filter((l): l is FormattedLine => l !== null)

    const merged: FormattedLine[] = []
    for (const line of rawLines) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : null
      if (line.type === 'assistant' && prev?.type === 'assistant') {
        prev.content += '\n' + line.content
      } else {
        merged.push({ ...line })
      }
    }

    const processed = applyDiffDetection(merged)
    return { processedLines: processed, groups: groupByPhase(processed), totalLines: processed.length }
  }, [events])

  // Filter count (memoized — only recomputes when filter or lines change)
  const filteredCount = useMemo(() => {
    if (!filter) return totalLines
    const lowerFilter = filter.toLowerCase()
    return processedLines.filter((l) => l.content.toLowerCase().includes(lowerFilter)).length
  }, [filter, processedLines, totalLines])

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    if (autoScroll) scrollToBottom()
  }, [events.length, autoScroll, scrollToBottom])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  function togglePhase(key: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading logs...</p>
      </div>
    )
  }

  if (totalLines === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No log output yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-7 h-7"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground/50 hover:text-foreground"
          onClick={() => {
            const text = processedLines.map((l) => l.content).join('\n')
            navigator.clipboard.writeText(text).then(() => {
              toast.success('Log copied to clipboard')
            }).catch(() => {
              toast.error('Failed to copy log')
            })
          }}
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {filteredCount} / {totalLines} lines
        </span>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 text-xs relative"
        onScroll={handleScroll}
      >
        {groups.map((group) => (
          <PhaseGroupSection
            key={group.key}
            group={group}
            filter={filter}
            collapsed={collapsedPhases.has(group.key)}
            onToggle={() => togglePhase(group.key)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom button */}
      {!autoScroll && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { setAutoScroll(true); scrollToBottom() }}
          className="absolute bottom-16 right-6 h-7 gap-1 shadow-lg"
        >
          <ChevronDown className="w-3 h-3" />
          Jump to bottom
        </Button>
      )}
    </div>
  )
}

// ─── PhaseGroupSection ────────────────────────────────────────────────────────

interface PhaseGroupSectionProps {
  group: PhaseGroup
  filter: string
  collapsed: boolean
  onToggle: () => void
}

const PhaseGroupSection = memo(function PhaseGroupSection({
  group,
  filter,
  collapsed,
  onToggle,
}: PhaseGroupSectionProps) {
  const visibleLines = filter
    ? group.lines.filter((l) => l.content.toLowerCase().includes(filter.toLowerCase()))
    : group.lines

  // Preamble: render lines without a phase header
  if (group.header === null) {
    if (visibleLines.length === 0) return null
    return (
      <div>
        {visibleLines.map((line, idx) => (
          <LogLine key={line.id} line={line} even={idx % 2 === 0} />
        ))}
      </div>
    )
  }

  const phaseContent = group.header.content

  return (
    <div className="mt-3 rounded-md overflow-hidden border border-border/20">
      {/* Phase header — clickable to collapse */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 w-full text-left px-3 py-2',
          'bg-primary/5 border-b border-primary/20',
          'hover:bg-primary/10 transition-colors duration-150 cursor-pointer',
        )}
      >
        <ChevronRight
          className={cn(
            'w-3 h-3 text-primary/60 shrink-0 transition-transform duration-150',
            !collapsed && 'rotate-90',
          )}
        />
        <span className="flex-1 text-[12px] font-semibold text-foreground leading-none">
          {phaseContent}
        </span>
        {group.header.timestamp && (
          <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
            {new Date(group.header.timestamp).toLocaleTimeString('en', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/40 shrink-0">
          {group.lines.length} lines
        </span>
      </button>

      {/* Phase content */}
      {!collapsed && (
        <div className="bg-muted/5">
          {visibleLines.length === 0 ? (
            <p className="px-4 py-2 text-[10px] text-muted-foreground/40 italic">
              {filter ? 'No matching lines' : 'No output'}
            </p>
          ) : (
            visibleLines.map((line, idx) => (
              <LogLine key={line.id} line={line} even={idx % 2 === 0} />
            ))
          )}
        </div>
      )}
    </div>
  )
})

// ─── LogLine ──────────────────────────────────────────────────────────────────

const REHYPE_PLUGINS = [rehypeHighlight]

const LogLine = memo(function LogLine({ line, even }: { line: FormattedLine; even: boolean }) {
  const isMarkdown = line.type === 'assistant'
  const isDiffAdd = line.type === 'diff-add'
  const isDiffRemove = line.type === 'diff-remove'
  const isDiffMeta = line.type === 'diff-meta'
  const isDiffHunk = line.type === 'diff-hunk'
  const isDiff = isDiffAdd || isDiffRemove || isDiffMeta || isDiffHunk

  return (
    <div
      className={cn(
        'flex items-start gap-2 group px-2 py-0.5 rounded-sm',
        !isDiff && (even ? 'bg-muted/20' : 'bg-transparent'),
        line.type === 'result' && 'bg-emerald-500/5 border-l-2 border-emerald-500/40 mt-2 py-2',
        isDiffAdd    && 'bg-emerald-500/8 border-l-2 border-emerald-500/50',
        isDiffRemove && 'bg-red-500/8 border-l-2 border-red-500/50',
        isDiffMeta   && 'bg-accent-primary/5 border-l-2 border-accent-primary/30',
        isDiffHunk   && 'bg-accent-info/5 border-l-2 border-accent-info/30',
      )}
    >
      {line.timestamp && (
        <span className="text-[10px] text-muted-foreground/40 shrink-0 mt-0.5 w-[52px] font-mono tabular-nums">
          {new Date(line.timestamp).toLocaleTimeString('en', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </span>
      )}

      {isMarkdown ? (
        <div
          className="flex-1 min-w-0 prose prose-invert prose-xs max-w-none
            prose-p:my-1 prose-p:leading-relaxed
            prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold
            prose-ul:my-1 prose-ol:my-1 prose-li:my-0
            prose-code:text-cyan-300 prose-code:text-[11px] prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:my-1 prose-pre:bg-muted/30 prose-pre:rounded-md prose-pre:p-2 prose-pre:text-[11px]
            prose-strong:text-foreground prose-em:text-foreground/70
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-table:my-2 prose-table:text-[11px]
            prose-thead:border-border prose-thead:bg-muted/30
            prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold prose-th:text-foreground/90
            prose-td:px-3 prose-td:py-1.5 prose-td:border-border
            prose-tr:border-border
            text-foreground/80"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={REHYPE_PLUGINS}>
            {line.content}
          </ReactMarkdown>
        </div>
      ) : (
        <span
          className={cn(
            'flex-1 break-all leading-relaxed whitespace-pre-wrap font-mono',
            line.type === 'tool-use'    && 'text-cyan-400/80 text-[11px]',
            line.type === 'stderr'      && 'text-orange-400',
            line.type === 'result'      && 'text-emerald-400 font-medium',
            line.type === 'log'         && 'text-foreground/60',
            line.type === 'plain'       && 'text-foreground/70',
            line.type === 'tool-result' && 'text-muted-foreground/50',
            isDiffAdd    && 'text-emerald-400',
            isDiffRemove && 'text-red-400',
            isDiffMeta   && 'text-accent-primary/80',
            isDiffHunk   && 'text-accent-info/80',
          )}
        >
          {line.content}
        </span>
      )}
    </div>
  )
})
