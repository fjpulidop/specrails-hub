/**
 * Overlay components that render tour-specific visuals on top of the real
 * demo dashboard. All overlays anchor their position to real DOM elements
 * (via `[data-tour=…]` selectors + getBoundingClientRect) so they appear
 * INSIDE the real Specs column / over the real Rail 1 / fullscreen for the
 * log page — not floating in mid-screen.
 *
 * None of these interact with production state. All read from tourStore.
 *
 * openspec: hub-demo-scripted-tour
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Sparkles, Send, Search, ChevronRight, Home } from 'lucide-react'
import { tourStore } from './tour-store'

export function TourOverlay() {
  const state = useSyncExternalStore(tourStore.subscribe, tourStore.getState)

  return (
    <>
      {state.modalOpen && <TourFakeModal typedText={state.typedText} />}
      {state.specCardVisible && <TourFakeSpecCard onRail={state.specCardOnRail} />}
      {state.specCardOnRail && <TourFakeRail running={state.rail1Running} />}
      {state.logDrawerOpen && <TourFullscreenLogPage />}
      {state.fadeOpacity > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'black',
            opacity: state.fadeOpacity,
            transition: 'opacity 300ms ease',
            pointerEvents: 'none',
            zIndex: 2_147_482_000,
          }}
        />
      )}
    </>
  )
}

// ─── Hook: track the rect of a `data-tour="…"` element ──────────────────────

function useAnchorRect(selector: string): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [selector])
  return rect
}

// ─── Fake Propose Spec modal ────────────────────────────────────────────────

function TourFakeModal({ typedText }: { typedText: string }) {
  return (
    <div
      aria-hidden="true"
      data-tour-fake-modal
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 2_147_480_000,
        pointerEvents: 'none',
        animation: 'tour-fade-in 220ms ease-out',
      }}
    >
      <div
        style={{
          width: 'min(640px, 90vw)',
          background: 'hsl(231 15% 18%)',
          border: '1px solid hsl(231 15% 30% / 0.6)',
          borderRadius: 12,
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          color: 'hsl(60 30% 96%)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid hsl(231 15% 30% / 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Sparkles width={15} height={15} color="hsl(271 60% 78%)" />
          <span>Add Spec</span>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
            Describe the feature or change you want to propose. A spec will be generated automatically.
          </p>
          <div
            data-tour="propose-spec-textarea"
            style={{
              minHeight: 128,
              padding: '10px 14px',
              background: 'hsl(231 15% 12%)',
              border: '1px solid hsl(271 60% 78% / 0.35)',
              borderRadius: 8,
              fontSize: 13,
              fontFamily:
                '"Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
              lineHeight: 1.55,
              color: 'hsl(60 30% 96%)',
              boxShadow: '0 0 0 3px hsl(271 60% 78% / 0.12)',
            }}
          >
            {typedText.length === 0 ? (
              <span style={{ opacity: 0.4 }}>e.g. Add a dark mode toggle...</span>
            ) : (
              <>
                {typedText}
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 1,
                    height: 14,
                    marginLeft: 2,
                    verticalAlign: 'middle',
                    background: 'hsl(271 60% 78%)',
                    animation: 'tour-caret 0.9s step-end infinite',
                  }}
                />
              </>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                opacity: 0.7,
              }}
            >
              <Search width={12} height={12} />
              Explore codebase
              <span style={{ opacity: 0.5, fontSize: 10 }}>~1 min</span>
            </div>
            <div
              data-tour="generate-spec-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'hsl(271 60% 78%)',
                color: 'hsl(231 15% 12%)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <Send width={13} height={13} />
              Generate Spec
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fake spec card: born inside Specs column, slides to Rail 1 ─────────────

function TourFakeSpecCard({ onRail }: { onRail: boolean }) {
  const specsRect = useAnchorRect('[data-tour="specs-list"]')
  const railRect = useAnchorRect('[data-tour="rail-1"]')

  // Once positioned, keep rendering even if the rect briefly goes null (e.g.
  // during re-measure) so we don't flicker mid-animation.
  const lastSpecsRect = useRef<DOMRect | null>(null)
  const lastRailRect = useRef<DOMRect | null>(null)
  if (specsRect) lastSpecsRect.current = specsRect
  if (railRect) lastRailRect.current = railRect

  const start = lastSpecsRect.current
  const end = lastRailRect.current
  if (!start || !end) return null

  // Card lives at the top of the Specs list (first slot) → then top of Rail 1.
  const CARD_WIDTH = Math.min(start.width - 32, 280)
  const INNER_PAD_X = 12
  const current = onRail ? end : start
  const top = current.top + 12
  const left = current.left + INNER_PAD_X

  return (
    <div
      aria-hidden="true"
      data-tour-fake-spec-card
      style={{
        position: 'fixed',
        top,
        left,
        width: CARD_WIDTH,
        padding: '10px 12px',
        background: 'hsl(231 15% 20%)',
        border: '1px solid hsl(271 60% 78% / 0.45)',
        borderRadius: 10,
        color: 'hsl(60 30% 96%)',
        boxShadow: '0 20px 40px -12px rgba(189, 147, 249, 0.25)',
        zIndex: 2_147_479_000,
        pointerEvents: 'none',
        transition:
          'top 900ms cubic-bezier(0.22, 1, 0.36, 1), left 900ms cubic-bezier(0.22, 1, 0.36, 1), width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
        fontSize: 12,
        opacity: 0,
        animation: 'tour-fade-in 380ms ease-out forwards',
      }}
    >
      <div
        style={{
          fontWeight: 500,
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            background: 'hsl(35 95% 66%)',
            borderRadius: '50%',
          }}
        />
        Add JWT auth with refresh tokens
      </div>
      <div style={{ fontSize: 10, opacity: 0.6 }}>high · auth, backend</div>
    </div>
  )
}

// ─── Fake Rail 1 state glow: overlays over the REAL first rail ──────────────

function TourFakeRail({ running }: { running: boolean }) {
  const railRect = useAnchorRect('[data-tour="rail-1"]')
  if (!railRect) return null

  const glow = running
    ? '0 0 28px hsl(142 70% 56% / 0.55)'
    : '0 0 0 transparent'

  return (
    <>
      {/* Running glow ring overlaid over the real rail */}
      {running && (
        <div
          aria-hidden="true"
          data-tour-rail-running
          style={{
            position: 'fixed',
            top: railRect.top,
            left: railRect.left,
            width: railRect.width,
            height: railRect.height,
            borderRadius: 12,
            border: '1px solid hsl(142 70% 56% / 0.75)',
            boxShadow: glow,
            pointerEvents: 'none',
            zIndex: 2_147_478_500,
            animation: 'tour-pulse-glow 1.6s ease-in-out infinite',
          }}
        />
      )}

      {/* Invisible click targets for the cursor — positioned over where the
          real Play and Logs buttons would be inside the rail header (right
          side). The cursor's targetCoords reads these rects. */}
      <div
        data-tour="rail-1-play"
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: railRect.top + 10,
          left: railRect.right - 34,
          width: 22,
          height: 22,
          pointerEvents: 'none',
          zIndex: 2_147_478_600,
        }}
      />
      {running && (
        <div
          data-tour="rail-1-logs"
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: railRect.top + 10,
            left: railRect.right - 120,
            width: 22,
            height: 22,
            pointerEvents: 'none',
            zIndex: 2_147_478_600,
          }}
        />
      )}
    </>
  )
}

// ─── Fullscreen fake log page (mimics JobDetailPage layout) ─────────────────

function TourFullscreenLogPage() {
  const state = useSyncExternalStore(tourStore.subscribe, tourStore.getState)
  const logRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the log to bottom as new lines arrive (matches real behaviour).
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.logLines])

  return (
    <div
      aria-hidden="true"
      data-tour-fullscreen-log
      style={{
        position: 'fixed',
        inset: 0,
        background: 'hsl(231 15% 14%)',
        zIndex: 2_147_478_000,
        pointerEvents: 'none',
        animation: 'tour-fade-in 280ms ease-out',
        display: 'flex',
        flexDirection: 'column',
        color: 'hsl(60 30% 96%)',
      }}
    >
      {/* Breadcrumb bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '12px 24px',
          borderBottom: '1px solid hsl(231 15% 30% / 0.4)',
          fontSize: 12,
          color: 'hsl(225 27% 70%)',
        }}
      >
        <Home width={12} height={12} />
        <span>Dashboard</span>
        <ChevronRight width={12} height={12} style={{ opacity: 0.5 }} />
        <span>Jobs</span>
        <ChevronRight width={12} height={12} style={{ opacity: 0.5 }} />
        <span style={{ color: 'hsl(60 30% 96%)', fontFamily: 'monospace' }}>
          job-rail-1-active
        </span>
      </div>

      {/* Header with job title + badges */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid hsl(231 15% 30% / 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            /sr:implement
          </h1>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              background: 'hsl(142 70% 56% / 0.18)',
              color: 'hsl(142 70% 66%)',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'hsl(142 70% 56%)',
                animation: 'tour-pulse-dot 1.2s ease-in-out infinite',
              }}
            />
            running
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            Rail 1 · Add JWT auth with refresh tokens
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, opacity: 0.7 }}>
          <span>turns: 8</span>
          <span>cost: $0.18</span>
          <span style={{ fontFamily: 'monospace' }}>claude-sonnet-4</span>
        </div>
      </div>

      {/* Pipeline progress strip */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid hsl(231 15% 30% / 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
        }}
      >
        {[
          { label: 'Architect', state: 'done' },
          { label: 'Develop', state: 'running' },
          { label: 'Review', state: 'idle' },
          { label: 'Ship', state: 'idle' },
        ].map((p, i) => (
          <div
            key={p.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 6,
              background:
                p.state === 'done'
                  ? 'hsl(142 70% 56% / 0.12)'
                  : p.state === 'running'
                    ? 'hsl(271 60% 78% / 0.15)'
                    : 'hsl(231 15% 30% / 0.3)',
              color:
                p.state === 'done'
                  ? 'hsl(142 70% 66%)'
                  : p.state === 'running'
                    ? 'hsl(271 60% 78%)'
                    : 'hsl(225 27% 60%)',
              fontFamily: 'monospace',
            }}
          >
            <span style={{ fontSize: 10 }}>{i + 1}</span>
            {p.label}
            {p.state === 'running' && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'hsl(271 60% 78%)',
                  animation: 'tour-pulse-dot 1s ease-in-out infinite',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Log body */}
      <div
        ref={logRef}
        style={{
          flex: 1,
          padding: '16px 24px',
          fontFamily: '"Fira Code", Menlo, Monaco, monospace',
          fontSize: 13,
          lineHeight: 1.8,
          overflow: 'auto',
        }}
      >
        {state.logLines.map((line) => (
          <div key={line.id} style={{ animation: 'tour-fade-in 200ms ease-out' }}>
            <span style={{ color: 'hsl(231 15% 55%)' }}>{line.timestamp}</span>
            {'  '}
            <span
              style={{
                color:
                  line.marker === '✓'
                    ? 'hsl(142 70% 56%)'
                    : 'hsl(271 60% 78%)',
                fontWeight: 600,
              }}
            >
              {line.marker}
            </span>
            {'  '}
            <TourLogLineText text={line.text} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TourLogLineText({ text }: { text: string }) {
  const parts = text.split(/(SHIPPED|PASS|\d+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === 'SHIPPED' || part === 'PASS') {
          return (
            <span key={i} style={{ color: 'hsl(142 70% 56%)', fontWeight: 700 }}>
              {part}
            </span>
          )
        }
        if (/^\d+$/.test(part)) {
          return (
            <span key={i} style={{ color: 'hsl(191 97% 77%)' }}>
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
