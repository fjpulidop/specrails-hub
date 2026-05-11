import { useEffect, useRef, useState } from 'react'

/**
 * Smooths bursty `chat_stream` deltas into a steady character-by-character
 * render driven by `requestAnimationFrame`. Returns the visible substring of
 * `target` that has been "typed in" so far. When the streaming turn ends
 * (or the backlog exceeds the safety threshold), the remainder flushes in
 * one frame so no characters are ever dropped.
 *
 * The rate is computed each frame so a 1 KB delta empties in ~250 ms rather
 * than dripping for 16 s at 1 char/frame.
 *
 * See accelerate-spec-chat-first-token design.md D8.
 */

const SAFETY_FLUSH_BYTES = 4096
const TARGET_DRAIN_MS = 250

export function useSmoothStream(target: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = useState('')
  const displayedRef = useRef('')
  const targetRef = useRef(target)
  const lastTickRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => { targetRef.current = target }, [target])
  useEffect(() => { displayedRef.current = displayed }, [displayed])

  useEffect(() => {
    if (!isStreaming && target.length <= displayedRef.current.length) {
      // Idle and nothing pending — make sure we don't have a stale RAF.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // Ensure displayed catches up exactly to target on settle.
      if (displayed !== target) setDisplayed(target)
      return
    }

    const tick = (now: number) => {
      const cur = displayedRef.current
      const tgt = targetRef.current
      const backlog = tgt.length - cur.length

      if (backlog <= 0) {
        rafRef.current = null
        return
      }

      // Safety flush: if we fall too far behind, drop the smoothing.
      if (backlog > SAFETY_FLUSH_BYTES) {
        setDisplayed(tgt)
        displayedRef.current = tgt
        rafRef.current = null
        return
      }

      const last = lastTickRef.current || now
      const dtMs = Math.max(0, now - last)
      lastTickRef.current = now
      // Aim to drain the entire current backlog in TARGET_DRAIN_MS, with a
      // floor of 1 char/frame so very tiny deltas still feel alive.
      const charsPerMs = backlog / TARGET_DRAIN_MS
      const advance = Math.max(1, Math.ceil(charsPerMs * dtMs))
      const next = tgt.slice(0, Math.min(tgt.length, cur.length + advance))
      setDisplayed(next)
      displayedRef.current = next

      rafRef.current = requestAnimationFrame(tick)
    }

    if (rafRef.current == null) {
      lastTickRef.current = 0
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target, isStreaming, displayed])

  return displayed
}
