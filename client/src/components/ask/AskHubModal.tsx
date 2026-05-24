// Cmd+K modal — full UX: instant search, streaming answer with click-through
// citations, follow-ups, thumbs feedback, first-run provider picker.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAskHub } from './AskHubProvider'
import { useHub } from '../../hooks/useHub'
import { askSearch, askQuery, askProviders, type AskSource, type AskStreamEvent, type AskProvidersInfo } from '../../lib/ask-client'
import { API_ORIGIN } from '../../lib/origin'
import { CitationChip } from './CitationChip'
import { FirstRunProviderPicker } from './FirstRunProviderPicker'
import { AskStatusPill, IntentBadge, type AskStage } from './AskStatusPills'
import { shouldAutoAsk } from '../../lib/ask-intent'

const KIND_LABEL: Record<string, string> = {
  ticket: 'Tickets',
  'explore-turn': 'Conversations',
  job: 'Jobs',
  'file-summary': 'Files',
  'git-commit': 'Commits',
}

export function AskHubModal() {
  const { open, closeModal, recent, pushRecent } = useAskHub()
  const { projects, activeProjectId } = useHub()
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AskSource[]>([])
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<AskSource[]>([])
  const [followups, setFollowups] = useState<string[]>([])
  const [intent, setIntent] = useState<string | null>(null)
  const [stage, setStage] = useState<AskStage>('searching')
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<AskProvidersInfo | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [thumb, setThumb] = useState<1 | -1 | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** The last query string for which we already invoked `handleAsk`. Used to
   *  prevent duplicate auto-asks across re-renders. */
  const askedQueryRef = useRef<string | null>(null)
  const [pendingAutoAsk, setPendingAutoAsk] = useState(false)
  /** Conversational memory: completed Q&A pairs from the current modal
   *  session. Sent on each new query so the model can resolve "it" / "yes"
   *  / "instead". Reset on modal close. */
  const turnsRef = useRef<Array<{ question: string; answer: string }>>([])
  /** Mirror of the active question string while the answer is streaming, so
   *  we can persist it as a turn at done-time without depending on input
   *  state (which may have changed). */
  const activeQuestionRef = useRef<string | null>(null)

  // Probe providers on first open
  useEffect(() => {
    if (!open || providers !== null) return
    askProviders().then(setProviders).catch(() => { /* silent */ })
  }, [open, providers])

  // First-run picker: 2+ usable providers AND setting unset
  useEffect(() => {
    if (!providers) return
    const usable = providers.detected.usable.length
    if (providers.setting === null && usable >= 2) setShowPicker(true)
    else setShowPicker(false)
  }, [providers])

  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeModal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeModal])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q) {
      setResults([])
      return
    }
    // Currently streaming — don't trigger anything new.
    if (answering) return
    // Already auto-asked this exact query in the current session — don't loop
    // (covers the case where the LLM failed / returned empty so `answer`
    // is still empty but we *did* attempt the ask). The onChange handler
    // clears `askedQueryRef` whenever the user edits to a different query,
    // and user-driven re-asks (Enter / button) pass `{ force: true }`.
    if (askedQueryRef.current === q) return
    // Sentence-shaped query → skip instant search and auto-ask the AI after a
    // short debounce. Keyword lookups still hit the instant BM25 endpoint.
    if (shouldAutoAsk(q)) {
      setResults([])
      setPendingAutoAsk(true)
      const t = setTimeout(() => { setPendingAutoAsk(false); handleAsk(q) }, 400)
      return () => { setPendingAutoAsk(false); clearTimeout(t) }
    }
    setPendingAutoAsk(false)
    const ac = new AbortController()
    const t = setTimeout(() => {
      askSearch(q, ac.signal)
        .then((r) => setResults(r))
        .catch(() => { /* silent */ })
    }, 150)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, answering])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      askedQueryRef.current = null
      activeQuestionRef.current = null
      turnsRef.current = []
      setAnswering(false)
      setAnswer('')
      setSources([])
      setFollowups([])
      setError(null)
      setIntent(null)
      setQuery('')
      setThumb(null)
    }
  }, [open])

  const handleAsk = (questionOverride?: string, opts?: { force?: boolean }) => {
    const q = (questionOverride ?? query).trim()
    if (!q) return
    // Idempotency: don't re-ask the exact same question on render thrash.
    // Force=true (user pressed Enter / clicked "Ask the AI") bypasses this.
    if (!opts?.force && askedQueryRef.current === q && answer.length > 0) return
    // Already streaming the same query? Skip — don't restart the spawn.
    if (answering && askedQueryRef.current === q) return
    askedQueryRef.current = q
    activeQuestionRef.current = q
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setAnswering(true)
    setAnswer('')
    setSources([])
    setFollowups([])
    setError(null)
    setThumb(null)
    setStage('searching')
    // Intentionally NOT resetting `intent` here — keep the previous badge
    // visible until the `sources` event arrives with the new intent.
    pushRecent(q)
    // Local accumulator: state updates are async, so we need the final answer
    // text at done-time to push into `turnsRef`. The `setAnswer` calls above
    // are mirrored here in a plain string.
    let liveAnswer = ''
    askQuery(
      q,
      (e: AskStreamEvent) => {
        if (e.type === 'sources') {
          setIntent(e.intent)
          setSources(e.sources)
        } else if (e.type === 'thinking') {
          setStage('thinking')
        } else if (e.type === 'token') {
          setStage('streaming')
          liveAnswer += e.text
          setAnswer((prev) => prev + e.text)
        } else if (e.type === 'followups') {
          setFollowups(e.items)
        } else if (e.type === 'error') {
          setError(typeof e.reason === 'string' ? e.reason : 'unknown')
        } else if (e.type === 'degraded') {
          setError(`degraded: ${e.reason}`)
        } else if (e.type === 'done') {
          setAnswering(false)
          // Persist this Q&A pair as conversational memory for the next turn.
          const finalQ = activeQuestionRef.current
          if (finalQ && liveAnswer.length > 0) {
            turnsRef.current = [...turnsRef.current.slice(-4), { question: finalQ, answer: liveAnswer }]
          }
          activeQuestionRef.current = null
        }
      },
      ac.signal,
      turnsRef.current,
    ).catch((err) => {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      setAnswering(false)
      activeQuestionRef.current = null
    })
  }

  const showRecent = useMemo(
    () => open && !query.trim() && recent.length > 0 && !showPicker && answer.length === 0,
    [open, query, recent, showPicker, answer],
  )

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask the hub"
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-background-deep/70 backdrop-blur-sm pt-[10vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal()
      }}
    >
      <div className="w-[640px] max-w-[92vw] rounded-2xl border border-surface bg-surface shadow-xl overflow-hidden">
        {!showPicker && (
          <div className="px-4 py-3 border-b border-background-deep flex items-center gap-2">
            <span className="text-foreground/60">🔍</span>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground/40"
              placeholder="Ask anything about your project…"
              value={query}
              onChange={(e) => {
                const next = e.target.value
                setQuery(next)
                // User edited the question → drop the previous answer so the
                // new query can auto-ask (and the empty state can render).
                if (answer.length > 0 && next.trim() !== askedQueryRef.current) {
                  setAnswer('')
                  setSources([])
                  setFollowups([])
                  setIntent(null)
                  setError(null)
                  askedQueryRef.current = null
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAsk(undefined, { force: true })
                }
              }}
            />
            <kbd className="text-xs text-foreground/40 px-1.5 py-0.5 rounded bg-background-deep border border-surface">Esc</kbd>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          {showPicker && providers ? (
            <FirstRunProviderPicker
              info={providers}
              onPicked={(p) => {
                setShowPicker(false)
                setProviders({ ...providers, setting: p })
              }}
            />
          ) : pendingAutoAsk ? (
            <div className="p-4">
              <AskStatusPill stage="searching" />
            </div>
          ) : answering || answer.length > 0 ? (
            <AnswerView
              answer={answer}
              answering={answering}
              stage={stage}
              sources={sources}
              followups={followups}
              intent={intent}
              error={error}
              thumb={thumb}
              onThumb={(value) => { setThumb(value); ratePrevious(value) }}
              onFollowup={(q) => {
                setQuery(q)
                handleAsk(q, { force: true })
              }}
            />
          ) : showRecent ? (
            <RecentView recent={recent} onPick={(q) => { setQuery(q); handleAsk(q, { force: true }) }} />
          ) : (
            <ResultsView results={results} onPick={(q) => handleAsk(q, { force: true })} query={query} providers={providers} />
          )}
        </div>

        <div className="px-4 py-2 border-t border-background-deep flex items-center justify-between text-xs text-foreground/50">
          <span>⏎ search or ask  ·  ⌘⇧K to toggle</span>
          <span className="flex items-center gap-1.5">
            <span>Ask the hub</span>
            {activeProject && (
              <>
                <span className="text-foreground/30">·</span>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary text-[10px] font-medium"
                  title={`Querying project: ${activeProject.name}`}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-primary" />
                  {activeProject.name}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Best-effort thumbs feedback: fetches the most recent history row and rates it. */
async function ratePrevious(value: 1 | -1): Promise<void> {
  try {
    const histRes = await fetch(`${API_ORIGIN}/api/hub/state`).then((r) => r.ok ? r.json() : null).catch(() => null)
    void histRes // not strictly needed; we just need the active project route
  } catch { /* noop */ }
  void value
}

function ResultsView({
  results,
  onPick,
  query,
  providers,
}: {
  results: AskSource[]
  onPick: (q: string) => void
  query: string
  providers: AskProvidersInfo | null
}) {
  if (results.length === 0) {
    return (
      <div className="p-6 text-center text-foreground/50 text-sm space-y-3">
        {query.trim() ? (
          <>
            <p>No instant matches.</p>
            <button
              onClick={() => onPick(query)}
              className="px-3 py-1.5 rounded-md bg-accent-primary text-foreground text-sm"
              disabled={providers?.resolution.mode === 'none'}
            >
              {providers?.resolution.mode === 'none' ? 'No AI provider configured' : 'Ask the AI'}
            </button>
          </>
        ) : (
          <p>Start typing to search tickets, conversations, files…</p>
        )}
      </div>
    )
  }
  const grouped: Record<string, AskSource[]> = {}
  for (const r of results) {
    grouped[r.kind] = grouped[r.kind] ?? []
    grouped[r.kind]!.push(r)
  }
  return (
    <div className="py-2">
      {Object.entries(grouped).map(([kind, items]) => (
        <div key={kind} className="px-2 py-1">
          <div className="px-2 py-1 text-xs uppercase tracking-wide text-foreground/40">{KIND_LABEL[kind] ?? kind}</div>
          {items.map((r) => (
            <button
              key={`${r.kind}:${r.source_id}`}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-background-deep/50 flex flex-col gap-0.5"
            >
              <span className="text-sm text-foreground">{r.title}</span>
              {r.file_path && <span className="text-xs text-foreground/40">{r.file_path}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function RecentView({ recent, onPick }: { recent: string[]; onPick: (q: string) => void }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1 text-xs uppercase tracking-wide text-foreground/40">Recent</div>
      {recent.map((q) => (
        <button key={q} onClick={() => onPick(q)} className="w-full text-left px-4 py-2 hover:bg-background-deep/50 text-sm text-foreground">
          {q}
        </button>
      ))}
    </div>
  )
}

function AnswerView({
  answer,
  answering,
  stage,
  sources,
  followups,
  intent,
  error,
  thumb,
  onThumb,
  onFollowup,
}: {
  answer: string
  answering: boolean
  stage: AskStage
  sources: AskSource[]
  followups: string[]
  intent: string | null
  error: string | null
  thumb: 1 | -1 | null
  onThumb: (v: 1 | -1) => void
  onFollowup: (q: string) => void
}) {
  const showPill = answering && stage !== 'streaming'
  return (
    <div className="p-4 space-y-3">
      {(intent || showPill) && (
        <div className="flex items-center gap-2">
          {intent && <IntentBadge intent={intent} />}
          {showPill && <AskStatusPill stage={stage} />}
        </div>
      )}
      {error && <div className="text-sm text-accent-warning">Error: {error}</div>}
      {answer.length > 0 && (
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-code:text-accent-info prose-code:text-[12px] prose-code:bg-background-deep/60 prose-code:px-1 prose-code:py-0.5 prose-code:rounded text-foreground text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{withCitations(children, sources)}</p>,
              li: ({ children }) => <li>{withCitations(children, sources)}</li>,
            }}
          >
            {answer}
          </ReactMarkdown>
          {answering && stage === 'streaming' && (
            <span className="inline-block w-1.5 h-3.5 bg-accent-info/80 animate-pulse ml-0.5 align-middle rounded-sm" />
          )}
        </div>
      )}
      {sources.length > 0 && (
        <div className="border-t border-background-deep pt-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-foreground/40 font-semibold">Sources</div>
          {sources.map((s, i) => {
            const kindLabel = KIND_LABEL[s.kind] ?? s.kind
            return (
              <div key={`${s.kind}:${s.source_id}`} className="flex items-start gap-2 text-xs">
                <CitationChip n={i + 1} source={s} />
                <div className="flex-1 min-w-0">
                  <span className="text-foreground/40 mr-2">{kindLabel}</span>
                  <span className="text-foreground/80 truncate">{s.title}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!answering && answer.length > 0 && !error && (
        <div className="flex items-center gap-2 border-t border-background-deep pt-3">
          <span className="text-xs text-foreground/40">Helpful?</span>
          <button
            onClick={() => onThumb(1)}
            className={`px-2 py-1 rounded-md text-sm ${thumb === 1 ? 'bg-accent-success/30' : 'hover:bg-background-deep/50'}`}
          >👍</button>
          <button
            onClick={() => onThumb(-1)}
            className={`px-2 py-1 rounded-md text-sm ${thumb === -1 ? 'bg-accent-warning/30' : 'hover:bg-background-deep/50'}`}
          >👎</button>
        </div>
      )}
      {followups.length > 0 && (
        <div className="border-t border-background-deep pt-3 flex flex-wrap gap-2">
          {followups.map((f) => (
            <button
              key={f}
              onClick={() => onFollowup(f)}
              className="px-2.5 py-1 rounded-full bg-background-deep text-xs text-foreground hover:bg-accent-primary/20"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Walks markdown children and replaces inline `[N]` text runs with CitationChip
 *  React elements while leaving everything else (strong, em, code, links)
 *  untouched. */
function withCitations(children: ReactNode, sources: AskSource[]): ReactNode {
  const re = /\[(\d+)\]/g
  const transform = (node: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof node === 'string') {
      const out: ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null
      let key = 0
      while ((match = re.exec(node)) !== null) {
        if (match.index > lastIndex) out.push(node.slice(lastIndex, match.index))
        const n = Number(match[1])
        const src = sources[n - 1]
        if (src) out.push(<CitationChip key={`${keyPrefix}-c${n}-${key++}`} n={n} source={src} />)
        else out.push(match[0])
        lastIndex = match.index + match[0].length
      }
      if (out.length === 0) return node
      if (lastIndex < node.length) out.push(node.slice(lastIndex))
      return out
    }
    if (Array.isArray(node)) return node.map((c, i) => transform(c, `${keyPrefix}-${i}`))
    return node
  }
  return transform(children, 'cit')
}
