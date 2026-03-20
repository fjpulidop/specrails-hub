import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, CheckSquare, GitBranch, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { getApiBase } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

const ARTIFACT_FILES = ['proposal.md', 'design.md', 'tasks.md', 'delta-spec.md', 'context-bundle.md'] as const
type ArtifactFile = typeof ARTIFACT_FILES[number]

interface ArtifactMeta {
  file: ArtifactFile
  label: string
}

const ARTIFACTS: ArtifactMeta[] = [
  { file: 'proposal.md', label: 'Proposal' },
  { file: 'design.md', label: 'Design' },
  { file: 'tasks.md', label: 'Tasks' },
  { file: 'delta-spec.md', label: 'Delta Spec' },
  { file: 'context-bundle.md', label: 'Context Bundle' },
]

// ─── Task progress parser ─────────────────────────────────────────────────────

function parseTaskProgress(md: string): { done: number; total: number } {
  const checkboxes = md.match(/- \[[ xX]\]/g) ?? []
  const done = checkboxes.filter((c) => c !== '- [ ]').length
  return { done, total: checkboxes.length }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-xs leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside text-xs mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-xs mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
          inline ? (
            <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 text-foreground/80">{children}</code>
          ) : (
            <code className="block font-mono text-[10px] p-2 rounded bg-muted/60 overflow-x-auto leading-relaxed">{children}</code>
          ),
        pre: ({ children }) => <pre className="mb-2 overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground text-xs mb-2">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border/40 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SpecArtifactBrowserModalProps {
  open: boolean
  onClose: () => void
  changeId: string
  changeName: string
  availableArtifacts: { proposal: boolean; design: boolean; tasks: boolean }
  isArchived: boolean
}

interface ArtifactCache {
  [key: string]: string | null
}

export function SpecArtifactBrowserModal({
  open,
  onClose,
  changeId,
  changeName,
  availableArtifacts,
  isArchived,
}: SpecArtifactBrowserModalProps) {
  // Determine default selection: first available artifact
  function defaultArtifact(): ArtifactFile {
    if (availableArtifacts.proposal) return 'proposal.md'
    if (availableArtifacts.design) return 'design.md'
    if (availableArtifacts.tasks) return 'tasks.md'
    return 'proposal.md'
  }

  const [selected, setSelected] = useState<ArtifactFile>(defaultArtifact)
  const [cache, setCache] = useState<ArtifactCache>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelected(defaultArtifact())
      setCache({})
      setError(null)
    }
  }, [open, changeId])

  // Fetch artifact content
  useEffect(() => {
    if (!open || !selected) return
    if (cache[selected] !== undefined) return // already cached

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${getApiBase()}/changes/${changeId}/artifacts/${selected}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) {
          setCache((prev) => ({ ...prev, [selected]: null }))
          return
        }
        if (!res.ok) throw new Error(`Server error (${res.status})`)
        const data = await res.json() as { content: string }
        setCache((prev) => ({ ...prev, [selected]: data.content }))
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, selected, changeId, cache])

  function isAvailable(file: ArtifactFile): boolean {
    if (file === 'proposal.md') return availableArtifacts.proposal
    if (file === 'design.md') return availableArtifacts.design
    if (file === 'tasks.md') return availableArtifacts.tasks
    return true // delta-spec and context-bundle: optimistically show
  }

  const content = cache[selected]
  const taskProgress = selected === 'tasks.md' && content ? parseTaskProgress(content) : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl glass-card flex flex-col max-h-[85vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Changes</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-xs font-medium truncate max-w-[200px]">{changeName}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-xs text-dracula-purple">{ARTIFACTS.find((a) => a.file === selected)?.label}</span>
            {isArchived && (
              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                archived
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Artifact sidebar */}
          <div className="w-36 flex-shrink-0 border-r border-border/40 py-2">
            {ARTIFACTS.map(({ file, label }) => {
              const available = isAvailable(file)
              return (
                <button
                  key={file}
                  onClick={() => available && setSelected(file)}
                  disabled={!available}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left',
                    selected === file
                      ? 'bg-dracula-purple/15 text-dracula-purple font-medium'
                      : available
                        ? 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        : 'text-muted-foreground/30 cursor-not-allowed'
                  )}
                >
                  {file === 'tasks.md' ? (
                    <CheckSquare className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <FileText className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>

          {/* Content area */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            {/* Task progress bar */}
            {taskProgress && taskProgress.total > 0 && (
              <div className="mb-4 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Progress</span>
                  <span>{taskProgress.done}/{taskProgress.total} tasks</span>
                </div>
                <div className="h-1 rounded-full bg-border/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-dracula-purple transition-all"
                    style={{ width: `${(taskProgress.done / taskProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading...
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 py-4">{error}</p>
            )}

            {!loading && content === null && (
              <div className="py-4">
                <p className="text-xs text-muted-foreground">This artifact has not been generated yet.</p>
              </div>
            )}

            {!loading && content && (
              <div className="prose-sm text-foreground/90 max-w-none">
                <MarkdownContent content={content} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
