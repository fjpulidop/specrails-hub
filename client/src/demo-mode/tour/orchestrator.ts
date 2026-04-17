/**
 * Async beat runner. Iterates the canonical timeline, mutates tourStore, and
 * loops forever unless prefers-reduced-motion is set.
 *
 * openspec: hub-demo-scripted-tour (design.md §Decision 8)
 */

import { tourStore } from './tour-store'
import { findTourElement, type TourSelectorKey } from './selectors'
import { TOUR_TIMELINE, type Beat } from './timeline'
import { TOUR_LOG_LINES, TOUR_LOG_LINE_INTERVAL_MS } from '../fixtures/tour-log'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Wait through a single beat, honouring pause.
async function wait(durationMs: number) {
  const start = Date.now()
  let remaining = durationMs
  while (remaining > 0) {
    if (tourStore.getState().paused) {
      await sleep(100)
      continue
    }
    const chunk = Math.min(remaining, 100)
    await sleep(chunk)
    remaining = durationMs - (Date.now() - start)
  }
}

function targetCoords(key: TourSelectorKey): { x: number; y: number } | null {
  const el = findTourElement(key)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // Offset the cursor tip so it sits just inside the element's top-left quadrant.
  return { x: rect.left + rect.width * 0.35, y: rect.top + rect.height * 0.55 }
}

async function runBeat(beat: Beat) {
  tourStore.update({ currentBeatId: beat.id })

  switch (beat.kind) {
    case 'idle':
      await wait(beat.duration)
      return

    case 'moveTo': {
      const coords = targetCoords(beat.target) ?? fallbackCoord(beat.target)
      tourStore.update({ cursorX: coords.x, cursorY: coords.y })
      await wait(beat.duration)
      return
    }

    case 'click': {
      const coords = targetCoords(beat.target) ?? fallbackCoord(beat.target)
      tourStore.update({
        cursorX: coords.x,
        cursorY: coords.y,
        clickPulse: tourStore.getState().clickPulse + 1,
      })
      await wait(beat.duration)
      return
    }

    case 'type': {
      const fullText = beat.text
      const steps = Math.max(6, Math.floor(fullText.length / 2))
      const stepMs = Math.max(40, Math.floor(beat.duration / steps))
      tourStore.update({ typedText: '' })
      for (let i = 1; i <= steps; i++) {
        if (tourStore.getState().paused) {
          await sleep(100)
          i--
          continue
        }
        const cut = Math.ceil((fullText.length * i) / steps)
        tourStore.update({ typedText: fullText.slice(0, cut) })
        await sleep(stepMs)
      }
      tourStore.update({ typedText: fullText })
      return
    }

    case 'wait':
      await wait(beat.duration)
      return

    case 'action': {
      await runAction(beat.name, beat.duration)
      return
    }

    case 'fadeReset':
      // Fade to black, then clear visual state.
      tourStore.update({ fadeOpacity: 1 })
      await wait(Math.max(beat.duration - 200, 100))
      tourStore.softReset()
      tourStore.update({ fadeOpacity: 0 })
      await wait(200)
      return
  }
}

async function runAction(name: string, durationMs: number) {
  switch (name) {
    case 'openProposeSpecModal':
      tourStore.update({ modalOpen: true, typedText: '' })
      await wait(durationMs)
      return

    case 'closeProposeSpecModal':
      tourStore.update({ modalOpen: false })
      await wait(durationMs)
      return

    case 'showToast':
      // Use the real sonner toast system so it looks identical to a real user
      // action. Dynamic import because 'sonner' is ambient but we want
      // tree-shaking safety in prod builds.
      try {
        const sonner = await import('sonner')
        sonner.toast.loading('specrails-hub · Add JWT auth with refresh…', {
          description: 'Generating spec...',
          duration: 2800,
        })
      } catch {
        // no-op — toast is decorative
      }
      await wait(durationMs)
      return

    case 'spawnNewSpecCard':
      tourStore.update({ specCardVisible: true, specCardOnRail: false })
      await wait(durationMs)
      return

    case 'moveSpecToRail1':
      tourStore.update({ specCardOnRail: true })
      await wait(durationMs)
      return

    case 'markRail1Running':
      tourStore.update({ rail1Running: true })
      await wait(durationMs)
      return

    case 'openRail1Log':
      tourStore.update({ logDrawerOpen: true, logLines: [] })
      await wait(durationMs)
      return

    case 'appendLogLine': {
      // Tail every TOUR_LOG_LINE_INTERVAL_MS until the canonical set is exhausted.
      const total = TOUR_LOG_LINES.length
      const end = Date.now() + durationMs
      while (Date.now() < end && tourStore.getState().logLines.length < total) {
        if (tourStore.getState().paused) {
          await sleep(100)
          continue
        }
        tourStore.appendLogLine()
        await sleep(TOUR_LOG_LINE_INTERVAL_MS)
      }
      return
    }

    case 'resetAll':
      tourStore.softReset()
      await wait(durationMs)
      return
  }
}

/** Best-effort coordinates when the target element is not in the DOM yet. */
function fallbackCoord(key: TourSelectorKey): { x: number; y: number } {
  // Rough anchors tuned for the default hub-demo layout. Used only on the
  // first frames before the real DOM has rendered. Once the element exists,
  // `targetCoords` takes over.
  const w = window.innerWidth
  const h = window.innerHeight
  switch (key) {
    case 'addSpecButton':
      return { x: w * 0.14, y: h * 0.18 }
    case 'proposeSpecTextarea':
      return { x: w * 0.5, y: h * 0.4 }
    case 'generateSpecButton':
      return { x: w * 0.6, y: h * 0.55 }
    case 'rail1PlayButton':
      return { x: w * 0.52, y: h * 0.55 }
    case 'rail1LogButton':
      return { x: w * 0.48, y: h * 0.55 }
    default:
      return { x: w / 2, y: h / 2 }
  }
}

async function runLoop() {
  // Hold 1s between iterations for a calmer rhythm.
  const INTER_LOOP_HOLD_MS = 1000

  while (true) {
    for (const beat of TOUR_TIMELINE) {
      await runBeat(beat)
    }
    await wait(INTER_LOOP_HOLD_MS)
  }
}

interface TourHandle {
  pause: () => void
  resume: () => void
}

let started = false

export function startTour(): TourHandle | null {
  if (started) return globalHandle
  started = true

  // Honour reduced motion: render idle state only.
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    tourStore.update({ cursorVisible: false })
    return null
  }

  tourStore.update({
    cursorVisible: true,
    cursorX: window.innerWidth - 80,
    cursorY: window.innerHeight - 80,
  })

  // Fire-and-forget. The loop rejects only if the browser crashes.
  runLoop().catch((err) => {
    console.error('[tour] loop crashed', err)
  })

  globalHandle = {
    pause: () => tourStore.pause(),
    resume: () => tourStore.resume(),
  }

  // Expose a debug hook for screenshots and marketing captures (spec: debug
  // pause hook requirement).
  ;(window as unknown as Record<string, unknown>).__specrailsTour = globalHandle

  return globalHandle
}

let globalHandle: TourHandle = {
  pause: () => tourStore.pause(),
  resume: () => tourStore.resume(),
}
