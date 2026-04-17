/**
 * Overlay components that render tour-specific visuals on top of the real
 * demo dashboard: fake Propose Spec modal, typed text, spec card, rail
 * running indicator, log drawer, fade-reset scrim.
 *
 * None of these interact with production state. All read from tourStore.
 *
 * openspec: hub-demo-scripted-tour
 */

import { useSyncExternalStore } from 'react'
import { Sparkles, Send, Search } from 'lucide-react'
import { tourStore } from './tour-store'

export function TourOverlay() {
  const state = useSyncExternalStore(tourStore.subscribe, tourStore.getState)

  return (
    <>
      {state.modalOpen && <TourFakeModal typedText={state.typedText} />}
      {state.specCardVisible && <TourFakeSpecCard onRail={state.specCardOnRail} />}
      {state.specCardOnRail && (
        <TourFakeRail running={state.rail1Running} />
      )}
      {state.logDrawerOpen && <TourFakeLogDrawer />}
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
        {/* Header */}
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

        {/* Body */}
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
              outline: '2px solid transparent',
              outlineOffset: 2,
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

// ─── Fake spec card that appears then slides to Rail 1 ──────────────────────

function TourFakeSpecCard({ onRail }: { onRail: boolean }) {
  const START = { top: 172, left: 32 }
  const END = { top: 440, left: 360 }
  const current = onRail ? END : START

  return (
    <div
      aria-hidden="true"
      data-tour-fake-spec-card
      style={{
        position: 'fixed',
        top: current.top,
        left: current.left,
        width: 280,
        padding: '10px 12px',
        background: 'hsl(231 15% 20%)',
        border: '1px solid hsl(271 60% 78% / 0.45)',
        borderRadius: 10,
        color: 'hsl(60 30% 96%)',
        boxShadow: '0 20px 40px -12px rgba(189, 147, 249, 0.25)',
        zIndex: 2_147_479_000,
        pointerEvents: 'none',
        transition:
          'top 900ms cubic-bezier(0.22, 1, 0.36, 1), left 900ms cubic-bezier(0.22, 1, 0.36, 1), transform 300ms ease',
        fontSize: 12,
        opacity: 0,
        animation: 'tour-fade-in 400ms ease-out forwards',
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

// ─── Fake Rail 1 with Play + Logs buttons the cursor can target ─────────────

function TourFakeRail({ running }: { running: boolean }) {
  const glow = running
    ? '0 0 28px hsl(142 70% 56% / 0.55)'
    : '0 12px 30px -10px rgba(0, 0, 0, 0.35)'
  return (
    <div
      aria-hidden="true"
      data-tour-rail-running={running ? 'true' : 'false'}
      style={{
        position: 'fixed',
        top: 420,
        left: 300,
        width: 380,
        padding: '10px 14px',
        borderRadius: 10,
        border: `1px solid ${running ? 'hsl(142 70% 56% / 0.75)' : 'hsl(231 15% 30%)'}`,
        background: 'hsl(231 15% 20%)',
        boxShadow: glow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        color: 'hsl(60 30% 96%)',
        fontSize: 12,
        pointerEvents: 'none',
        zIndex: 2_147_478_500,
        transition: 'box-shadow 450ms ease, border-color 450ms ease',
        animation: running ? 'tour-pulse-glow 1.6s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: running ? 'hsl(142 70% 56%)' : 'hsl(225 27% 51% / 0.6)',
            boxShadow: running ? '0 0 6px hsl(142 70% 56%)' : 'none',
            animation: running
              ? 'tour-pulse-dot 1.2s ease-in-out infinite'
              : undefined,
          }}
        />
        <span style={{ fontWeight: 500 }}>Rail 1</span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 999,
            background: 'hsl(231 15% 30% / 0.7)',
            opacity: 0.7,
          }}
        >
          1
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Logs button — only visible when running, matches real RailControls behaviour */}
        {running && (
          <div
            data-tour="rail-1-logs"
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: 'hsl(191 97% 77%)',
              background: 'hsl(191 97% 77% / 0.1)',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h18M3 16h18M3 12h12" />
            </svg>
          </div>
        )}

        {/* Mode pill — decorative */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 6,
            overflow: 'hidden',
            fontSize: 10,
            border: '1px solid hsl(231 15% 30% / 0.6)',
          }}
        >
          <span
            style={{
              padding: '1px 6px',
              background: 'hsl(271 60% 78% / 0.15)',
              color: 'hsl(271 60% 78%)',
              fontWeight: 500,
            }}
          >
            Implement
          </span>
          <span style={{ padding: '1px 6px', opacity: 0.6 }}>Batch</span>
        </div>

        {/* Play / Stop button */}
        <div
          data-tour="rail-1-play"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: running ? 'hsl(0 100% 67%)' : 'hsl(135 94% 65%)',
            background: running
              ? 'hsl(0 100% 67% / 0.1)'
              : 'hsl(135 94% 65% / 0.1)',
          }}
        >
          {running ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5 L19 12 L8 19 Z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Fake log drawer slides in from the right ───────────────────────────────

function TourFakeLogDrawer() {
  const state = useSyncExternalStore(tourStore.subscribe, tourStore.getState)
  return (
    <div
      aria-hidden="true"
      data-tour-fake-log
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: 'min(520px, 60vw)',
        background: 'hsl(231 15% 14%)',
        borderLeft: '1px solid hsl(231 15% 30% / 0.6)',
        boxShadow: '-20px 0 40px -10px rgba(0, 0, 0, 0.5)',
        zIndex: 2_147_478_000,
        pointerEvents: 'none',
        animation: 'tour-slide-left 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid hsl(231 15% 30% / 0.4)',
          fontSize: 12,
          fontWeight: 500,
          color: 'hsl(60 30% 96%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            background: 'hsl(142 70% 56%)',
            borderRadius: '50%',
            boxShadow: '0 0 6px hsl(142 70% 56%)',
            animation: 'tour-pulse-dot 1.2s ease-in-out infinite',
          }}
        />
        Rail 1 · /sr:implement SPEC-009
      </div>
      <div
        style={{
          flex: 1,
          padding: '12px 18px',
          fontFamily: '"Fira Code", Menlo, Monaco, monospace',
          fontSize: 12,
          lineHeight: 1.8,
          color: 'hsl(60 30% 96%)',
          overflow: 'hidden',
        }}
      >
        {state.logLines.map((line) => (
          <div key={line.id} style={{ animation: 'tour-fade-in 180ms ease-out' }}>
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
  // Colour specific tokens for punch: numbers in cyan, SHIPPED / PASS in green bold.
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
