/**
 * Synthetic cursor rendered as an absolute-positioned SVG. Consumes tourStore
 * state via useSyncExternalStore; glides between coordinates using a CSS
 * `transform` transition.
 *
 * openspec: hub-demo-scripted-tour (design.md §Decision 3)
 */

import { useSyncExternalStore } from 'react'
import { tourStore } from './tour-store'

export function TourCursor() {
  const state = useSyncExternalStore(tourStore.subscribe, tourStore.getState)

  if (!state.cursorVisible) return null

  return (
    <div
      aria-hidden="true"
      data-tour-cursor
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${state.cursorX}px, ${state.cursorY}px, 0)`,
        transition: 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: 'none',
        zIndex: 2_147_483_000,
        willChange: 'transform',
      }}
    >
      {/* Click pulse ring — keyed on clickPulse so it remounts each click */}
      {state.clickPulse > 0 && (
        <span
          key={state.clickPulse}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '8px',
            top: '8px',
            width: 24,
            height: 24,
            marginLeft: -12,
            marginTop: -12,
            borderRadius: '50%',
            border: '2px solid rgba(189, 147, 249, 0.9)',
            animation: 'tour-click-ring 0.6s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Arrow cursor SVG */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        style={{
          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
          transform: state.clickPulse > 0 ? 'scale(0.9)' : 'scale(1)',
          transformOrigin: '2px 2px',
          transition: 'transform 180ms ease',
        }}
      >
        <path
          d="M 3 2 L 3 22 L 9 17 L 13.5 26 L 17 24 L 12.5 15 L 20 15 Z"
          fill="#ffffff"
          stroke="#1a1a2e"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
