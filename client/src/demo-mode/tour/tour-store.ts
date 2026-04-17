/**
 * Lightweight external store for tour state. Consumed by TourOverlay via
 * useSyncExternalStore. No external deps.
 *
 * openspec: hub-demo-scripted-tour
 */

import { TOUR_LOG_LINES, type TourLogLine } from '../fixtures/tour-log'

export interface TourState {
  /** Current beat id (from timeline.ts). `null` before first beat. */
  currentBeatId: string | null
  /** Cursor x/y in viewport coordinates. */
  cursorX: number
  cursorY: number
  /** Click pulse animation trigger — increments per click. */
  clickPulse: number
  /** Cursor visible? (hidden during reduced-motion). */
  cursorVisible: boolean
  /** Propose Spec modal visible. */
  modalOpen: boolean
  /** Text typed into the fake textarea so far. */
  typedText: string
  /** Show the "new spec" card (Beat 08+). */
  specCardVisible: boolean
  /** Animate the spec card moving from Specs → Rail 1. */
  specCardOnRail: boolean
  /** Rail 1 is running (Beat 11+). */
  rail1Running: boolean
  /** Log drawer open (Beat 13+). */
  logDrawerOpen: boolean
  /** Log lines currently visible in the drawer. */
  logLines: TourLogLine[]
  /** Global "fade to black" overlay opacity (0..1), used by fadeReset. */
  fadeOpacity: number
  /** Paused (debug / window.__specrailsTour.pause). */
  paused: boolean
}

const INITIAL_STATE: TourState = {
  currentBeatId: null,
  cursorX: 0,
  cursorY: 0,
  clickPulse: 0,
  cursorVisible: false,
  modalOpen: false,
  typedText: '',
  specCardVisible: false,
  specCardOnRail: false,
  rail1Running: false,
  logDrawerOpen: false,
  logLines: [],
  fadeOpacity: 0,
  paused: false,
}

class TourStore {
  private state: TourState = INITIAL_STATE
  private listeners = new Set<() => void>()

  getState = (): TourState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  update = (patch: Partial<TourState>) => {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /** Reset all visual flags (Beat 15). Keeps paused and cursorVisible. */
  softReset = () => {
    this.state = {
      ...this.state,
      currentBeatId: null,
      modalOpen: false,
      typedText: '',
      specCardVisible: false,
      specCardOnRail: false,
      rail1Running: false,
      logDrawerOpen: false,
      logLines: [],
      fadeOpacity: 0,
    }
    this.emit()
  }

  appendLogLine = (): boolean => {
    const next = TOUR_LOG_LINES[this.state.logLines.length]
    if (!next) return false
    this.update({ logLines: [...this.state.logLines, next] })
    return true
  }

  pause = () => this.update({ paused: true })
  resume = () => this.update({ paused: false })
}

export const tourStore = new TourStore()
