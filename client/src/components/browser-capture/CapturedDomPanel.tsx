import { useMemo, useState } from 'react'
import { ChevronRight, Code2, Palette, X } from 'lucide-react'
import { domSummary, type CapturedDom } from '../../lib/browser-capture'
import { tokenizeHtml, HL_CLASS } from '../../lib/html-highlight'

interface CapturedDomPanelProps {
  dom: CapturedDom
  /** Optional remove handler — when provided renders an × to drop this capture. */
  onRemove?: () => void
}

// Above this size we skip per-token highlighting (thousands of spans) and render
// plain text to keep the panel responsive.
const HIGHLIGHT_CAP = 40_000

function HighlightedHtml({ html }: { html: string }) {
  // Memoise so panel/CSS toggles (parent rerenders) don't re-tokenize + re-diff
  // thousands of spans. `null` signals "too big to highlight" → render plain.
  const tokens = useMemo(() => (html.length > HIGHLIGHT_CAP ? null : tokenizeHtml(html)), [html])
  if (!tokens) return <>{html}</>
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={HL_CLASS[t.type]}>{t.text}</span>
      ))}
    </>
  )
}

/**
 * Collapsible, scrollable panel showing the DOM (and applied CSS) captured for a
 * browser selection. Collapsed by default (a non-technical user never has to look
 * at HTML), but the captured markup — syntax-highlighted — and the matched CSS are
 * one click away and travel to the AI as an attachment.
 */
export function CapturedDomPanel({ dom, onRemove }: CapturedDomPanelProps) {
  const [openPanel, setOpenPanel] = useState(false)
  const [openCss, setOpenCss] = useState(false)
  const summary = domSummary(dom)
  const host = (() => {
    try { return new URL(dom.url).host } catch { return dom.url }
  })()

  return (
    <div className="rounded-lg border border-accent-secondary/40 bg-accent-secondary/5 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpenPanel((v) => !v)}
          aria-expanded={openPanel}
          className="flex items-center gap-2 flex-1 min-w-0 text-left text-foreground/90 hover:text-foreground transition-colors"
        >
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${openPanel ? 'rotate-90' : ''}`} />
          <Code2 className="w-3.5 h-3.5 shrink-0 text-accent-secondary" />
          <span className="truncate font-medium">Captured page · {dom.title || host}</span>
        </button>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {summary.nodeCount} elements{dom.css ? ' · CSS' : ''}{summary.truncated ? ' · truncated' : ''}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove captured page context"
            className="shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {openPanel && (
        <div className="border-t border-accent-secondary/30">
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground truncate" title={dom.url}>
            {dom.url}
          </div>
          <pre
            className="max-h-64 overflow-auto px-3 pb-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono"
            data-testid="captured-dom-html"
          >
            {dom.html ? <HighlightedHtml html={dom.html} /> : '(no markup captured)'}
          </pre>
          {dom.css && (
            <div className="border-t border-accent-secondary/30">
              <button
                type="button"
                onClick={() => setOpenCss((v) => !v)}
                aria-expanded={openCss}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-foreground/90 hover:text-foreground transition-colors"
              >
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${openCss ? 'rotate-90' : ''}`} />
                <Palette className="w-3.5 h-3.5 shrink-0 text-accent-highlight" />
                <span className="font-medium">Applied CSS{dom.cssTruncated ? ' (truncated)' : ''}</span>
              </button>
              {openCss && (
                <pre
                  className="max-h-64 overflow-auto px-3 pb-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-accent-success/90"
                  data-testid="captured-dom-css"
                >
                  {dom.css}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
