import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, RotateCw, X, Crop, Loader2, Globe, AlertTriangle, Monitor, Tablet, Smartphone, Maximize2, Network, Ratio } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { useBrowserCaptureSession } from './useBrowserCaptureSession'
import { AnnotationEditor } from './AnnotationEditor'
import {
  mapPointToViewport,
  mapRectToDisplay,
  rectFromPoints,
  isUsableSelection,
  BREAKPOINT_DIMS,
  type CaptureRect,
  type CaptureResult,
  type BrowserInputEvent,
} from '../../lib/browser-capture'

/**
 * Detect Tauri-on-Mac. The overlay is portaled to <body> as `fixed inset-0`, so it
 * covers the custom titlebar and the native traffic-light controls (close/min/max)
 * float over its top-left. Reserve a left gutter there so the nav buttons clear them.
 */
function isMacTauriOverlay(): boolean {
  if (typeof window === 'undefined') return false
  if (!('__TAURI_INTERNALS__' in window)) return false
  return /mac/i.test(navigator.platform)
}

interface BrowserCaptureModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  pendingSpecId: string
  onCaptured: (result: CaptureResult) => void
}

interface SelectionBox {
  startX: number
  startY: number
  curX: number
  curY: number
}

type ViewportPreset = 'fit' | 'desktop' | 'tablet' | 'mobile'
const PRESET_DIMS: Record<Exclude<ViewportPreset, 'fit'>, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  tablet: { w: 768, h: 1024 },
  mobile: { w: 375, h: 667 },
}

/**
 * Large in-app browser overlay for "Add Spec from browser": URL bar + navigation
 * + a Select-to-create-spec drag mode. The page is rendered from a CDP screencast
 * onto a canvas; in browse mode pointer/keyboard are forwarded to the page, in
 * select mode a drag rectangle is captured (screenshot + DOM) and handed back to
 * Add Spec. Excluded from coverage (canvas + WS + pointer drag is not jsdom-able).
 */
export function BrowserCaptureModal({ open, onClose, projectId, pendingSpecId, onCaptured }: BrowserCaptureModalProps) {
  const session = useBrowserCaptureSession({ projectId, open })
  const { canvasRef, viewport, status, errorMsg, url, title, hoverRect } = session

  const [addressValue, setAddressValue] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [box, setBox] = useState<SelectionBox | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [preset, setPreset] = useState<ViewportPreset>('fit')
  // Capture the page's XHR/fetch requests alongside the selection (ON by default;
  // a user can disable it for a privacy-sensitive page).
  const [captureNetwork, setCaptureNetwork] = useState(true)
  // Capture the selected element at desktop/tablet/mobile in one shot.
  const [captureAllSizes, setCaptureAllSizes] = useState(false)
  // When set, a single capture is frozen and the markup editor is shown over it.
  const [markup, setMarkup] = useState<CaptureResult | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const presetRef = useRef<ViewportPreset>('fit')
  const canvasRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  const lastProbeAtRef = useRef(0)

  useEffect(() => { setAddressValue(url ?? '') }, [url])

  const go = useCallback(() => {
    const u = addressValue.trim()
    if (u) void session.navigate('goto', u)
  }, [addressValue, session])

  const fitToContainer = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) session.setViewport(r.width, r.height)
  }, [session])

  const applyPreset = useCallback((p: ViewportPreset) => {
    setPreset(p)
    presetRef.current = p
    if (p === 'fit') fitToContainer()
    else session.setViewport(PRESET_DIMS[p].w, PRESET_DIMS[p].h)
  }, [fitToContainer, session])

  // In "fit" mode keep the page viewport matched to the displayed canvas for crisp
  // 1:1 rendering; a fixed preset (mobile/tablet/desktop) locks it so resizing the
  // window doesn't override the chosen device size.
  useEffect(() => {
    if (!open) return
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let t: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (presetRef.current !== 'fit') return
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) session.setViewport(r.width, r.height)
      }, 150)
    })
    ro.observe(el)
    return () => { if (t) clearTimeout(t); ro.disconnect() }
  }, [open, session])

  // Escape closes (when not mid-selection).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selecting) { setSelecting(false); setBox(null) }
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, selecting, onClose])

  const canvasRect = useCallback((): DOMRect | null => {
    const r = canvasRef.current?.getBoundingClientRect() ?? null
    // Cache for the hover-highlight so we never measure layout during render.
    if (r) canvasRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
    return r
  }, [canvasRef])

  const toViewport = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRect()
    if (!rect) return { x: 0, y: 0 }
    return mapPointToViewport({ x: clientX, y: clientY }, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, viewport)
  }, [canvasRect, viewport])

  // ─── Browse-mode interaction (forward to page) ──────────────────────────────

  const flushMove = useCallback(() => {
    rafRef.current = null
    const p = pendingMoveRef.current
    if (!p) return
    pendingMoveRef.current = null
    session.forwardInput({ type: 'mouse', action: 'move', x: p.x, y: p.y })
  }, [session])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (selecting) return
    const p = toViewport(e.clientX, e.clientY)
    pendingMoveRef.current = p
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushMove)
  }, [selecting, toViewport, flushMove])

  const buttonOf = (b: number): 'left' | 'middle' | 'right' => (b === 2 ? 'right' : b === 1 ? 'middle' : 'left')

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (selecting) return
    const p = toViewport(e.clientX, e.clientY)
    session.forwardInput({ type: 'mouse', action: 'down', x: p.x, y: p.y, button: buttonOf(e.button), clickCount: e.detail || 1 })
  }, [selecting, toViewport, session])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (selecting) return
    const p = toViewport(e.clientX, e.clientY)
    session.forwardInput({ type: 'mouse', action: 'up', x: p.x, y: p.y, button: buttonOf(e.button), clickCount: e.detail || 1 })
  }, [selecting, toViewport, session])

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (selecting) return
    const p = toViewport(e.clientX, e.clientY)
    session.forwardInput({ type: 'wheel', x: p.x, y: p.y, deltaX: e.deltaX, deltaY: e.deltaY })
  }, [selecting, toViewport, session])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (selecting || e.key === 'Escape') return
    const meta = e.metaKey || e.ctrlKey
    // Clipboard bridge: the embedded headless page can't reach the OS clipboard,
    // so ⌘/Ctrl+C/X read the page selection into the host clipboard and ⌘/Ctrl+V
    // injects the host clipboard text into the page.
    if (meta && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
      e.preventDefault()
      const key = e.key
      void (async () => {
        try {
          if (key === 'v') {
            const text = await navigator.clipboard.readText()
            if (text) await session.clipboard('paste', text)
          } else {
            const { text } = await session.clipboard(key === 'x' ? 'cut' : 'copy')
            if (text) await navigator.clipboard.writeText(text)
          }
        } catch {
          /* clipboard permission denied / unavailable — ignore */
        }
      })()
      return
    }
    // Don't type the letter of an unhandled ⌘/Ctrl combo (e.g. ⌘A) into the page.
    const ev: BrowserInputEvent = { type: 'key', action: 'down', key: e.key, code: e.code, text: !meta && e.key.length === 1 ? e.key : undefined }
    session.forwardInput(ev)
    if (e.key === 'Tab' || e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault()
  }, [selecting, session])

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (selecting || e.key === 'Escape') return
    session.forwardInput({ type: 'key', action: 'up', key: e.key, code: e.code })
  }, [selecting, session])

  // ─── Select mode: hover-to-select an element, or drag a custom rectangle ──────

  const runCapture = useCallback(async (rect: CaptureRect) => {
    setCapturing(true)
    try {
      if (captureAllSizes) {
        // Multi-breakpoint = 3 reference images; no markup step.
        const anchorPoint = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        const result = await session.captureBreakpoints(rect, anchorPoint, pendingSpecId, BREAKPOINT_DIMS)
        onCaptured(result)
        toast.success('Captured page selection')
        onClose()
      } else {
        // Freeze the single capture and hand it to the in-place markup editor.
        const result = await session.capture(rect, pendingSpecId, { captureNetwork })
        setMarkup(result)
      }
    } catch {
      toast.error('Capture failed')
    } finally {
      setCapturing(false)
      setSelecting(false)
      setBox(null)
      session.clearHover()
    }
  }, [session, pendingSpecId, captureNetwork, captureAllSizes, onCaptured, onClose])

  const onSelectDown = useCallback((e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setBox({ startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY })
  }, [])

  const onSelectMove = useCallback((e: React.PointerEvent) => {
    if (box) {
      const cx = e.clientX, cy = e.clientY
      setBox((b) => (b ? { ...b, curX: cx, curY: cy } : b))
      return
    }
    // Not dragging → hover-probe the element under the cursor (throttled: at most
    // one probe per animation frame AND no more often than every 40ms, to avoid
    // flooding the WS / the page's elementFromPoint on fast movement).
    const p = toViewport(e.clientX, e.clientY)
    pendingMoveRef.current = p
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        if (now - lastProbeAtRef.current < 40) return
        lastProbeAtRef.current = now
        const pt = pendingMoveRef.current
        if (pt) session.probe(pt)
      })
    }
  }, [box, toViewport, session])

  const onSelectUp = useCallback((e: React.PointerEvent) => {
    setBox((b) => {
      if (b) {
        const a = toViewport(b.startX, b.startY)
        const c = toViewport(e.clientX, e.clientY)
        const dragRect = rectFromPoints(a, c)
        if (isUsableSelection(dragRect)) {
          // A real drag → capture the custom rectangle.
          void runCapture(dragRect)
        } else if (hoverRect) {
          // A click (no meaningful drag) → capture the hovered element.
          void runCapture(hoverRect)
        }
      }
      return null
    })
  }, [toViewport, hoverRect, runCapture])

  if (!open || typeof document === 'undefined') return null

  const selectionStyle = box
    ? {
        left: Math.min(box.startX, box.curX),
        top: Math.min(box.startY, box.curY),
        width: Math.abs(box.startX - box.curX),
        height: Math.abs(box.startY - box.curY),
      }
    : null

  // DevTools-style highlight of the element under the cursor (select mode, not
  // mid-drag). Uses the canvas rect cached during the last pointer move so we
  // never measure layout during the render phase.
  const cr = canvasRectRef.current
  const hoverStyle = selecting && hoverRect && !box && cr
    ? mapRectToDisplay(hoverRect, cr, viewport)
    : null

  const macOverlay = isMacTauriOverlay()

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-background-deep/95 backdrop-blur-sm pointer-events-auto" role="dialog" aria-modal="true" aria-label="Browser capture">
      {markup ? (
        <AnnotationEditor
          result={markup}
          pendingSpecId={pendingSpecId}
          macOverlay={macOverlay}
          onConfirm={(aug) => { onCaptured(aug); onClose() }}
          onReselect={() => { setMarkup(null); setSelecting(true) }}
          onCancel={() => { setMarkup(null); onClose() }}
        />
      ) : (
      <>
      {/* Toolbar */}
      <div className={`flex items-center gap-2 py-1.5 border-b border-border/50 bg-surface/80 shrink-0 ${macOverlay ? 'pr-3' : 'px-3'}`}>
        {/* On macOS desktop the native traffic-light controls float over the top-left;
            this drag-region gutter reserves their space and keeps the window movable. */}
        {macOverlay && <div data-tauri-drag-region className="w-20 self-stretch shrink-0" aria-hidden />}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Back" onClick={() => session.navigate('back')}><ArrowLeft className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Forward" onClick={() => session.navigate('forward')}><ArrowRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reload" onClick={() => session.navigate('reload')}><RotateCw className="w-4 h-4" /></Button>
        </div>
        <form
          className="flex-1 flex items-center gap-2 min-w-0"
          onSubmit={(e) => { e.preventDefault(); go() }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 py-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }}
              placeholder="Enter a URL and press Go…"
              aria-label="Address bar"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="shrink-0" disabled={status === 'error'}>Go</Button>
        </form>
        <div className="hidden md:flex items-center gap-0.5 rounded-md border border-border/50 p-0.5 shrink-0" role="group" aria-label="Viewport size">
          {([['fit', Maximize2], ['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([p, Icon]) => (
            <button
              key={p}
              type="button"
              aria-label={`Viewport ${p}`}
              aria-pressed={preset === p}
              title={`Viewport: ${p}`}
              onClick={() => applyPreset(p)}
              className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${preset === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Capture network requests"
          aria-pressed={captureNetwork}
          title={captureNetwork ? 'Capturing the page’s network requests (click to disable)' : 'Network capture off (click to enable)'}
          onClick={() => setCaptureNetwork((v) => !v)}
          className={`hidden md:inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] shrink-0 transition-colors ${captureNetwork ? 'border-accent-info/40 bg-accent-info/10 text-accent-info' : 'border-border/50 text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
        >
          <Network className="w-3.5 h-3.5" />
          Network
        </button>
        <button
          type="button"
          aria-label="Capture at all screen sizes"
          aria-pressed={captureAllSizes}
          title={captureAllSizes ? 'Will capture this element at desktop, tablet and mobile (click to disable)' : 'Capture at all sizes: desktop, tablet and mobile'}
          onClick={() => setCaptureAllSizes((v) => !v)}
          className={`hidden md:inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] shrink-0 transition-colors ${captureAllSizes ? 'border-accent-highlight/40 bg-accent-highlight/10 text-accent-highlight' : 'border-border/50 text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
        >
          <Ratio className="w-3.5 h-3.5" />
          All sizes
        </button>
        <Button
          size="sm"
          variant={selecting ? 'default' : 'secondary'}
          className="gap-1.5"
          onClick={() => { setSelecting((v) => !v); setBox(null); session.clearHover() }}
          disabled={status !== 'ready' || capturing}
          data-testid="browser-select-toggle"
        >
          <Crop className="w-3.5 h-3.5" />
          {selecting ? 'Click an element or drag…' : 'Select to create spec'}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close browser" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <div className="px-3 py-1 text-[11px] text-muted-foreground truncate shrink-0 flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${status === 'ready' ? 'bg-accent-success' : status === 'error' ? 'bg-destructive' : 'bg-accent-warning animate-pulse'}`}
          aria-hidden
        />
        <span className="truncate">
          {status === 'connecting' ? 'Conectando navegador…' : status === 'error' ? (errorMsg ?? 'Browser unavailable') : (title || '')}
        </span>
      </div>

      {/* Viewport. tabIndex + key handlers live here so the canvas can be a direct
          flex child — that keeps the max-h-full chain intact so the frame scales
          to fit instead of overflowing at its intrinsic pixel size. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        {status === 'error' ? (
          <div className="flex flex-col items-center gap-2 text-center max-w-md px-6">
            <AlertTriangle className="w-8 h-8 text-accent-warning" />
            <p className="text-sm text-foreground/90">{errorMsg ?? 'The browser is unavailable.'}</p>
            <p className="text-xs text-muted-foreground">In dev, run <code className="font-mono">npx playwright install chromium</code> once. In the desktop app, Chromium is bundled.</p>
          </div>
        ) : (
          <>
            {/* Interactive canvas (browse mode forwards input to the page). Direct
                flex child of the definite-height container so max-w/h-full scale
                the frame to fit, preserving aspect. */}
            <canvas
              ref={canvasRef}
              className={`max-w-full max-h-full block shadow-2xl ${selecting ? 'cursor-crosshair' : 'cursor-default'}`}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={onWheel}
            />
            {/* Selection capture layer — covers the whole viewport; coordinates are
                mapped via the canvas's displayed rect so off-canvas points clamp. */}
            {selecting && (
              <div
                className="absolute inset-0 cursor-crosshair"
                onPointerDown={onSelectDown}
                onPointerMove={onSelectMove}
                onPointerUp={onSelectUp}
              />
            )}

            {status === 'connecting' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Opening browser…
              </div>
            )}
            {capturing && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-foreground bg-background-deep/40">
                <Loader2 className="w-4 h-4 animate-spin" /> Capturing…
              </div>
            )}
          </>
        )}

        {/* Hover highlight of the element under the cursor (DevTools-style) */}
        {hoverStyle && (
          <div
            className="fixed border-2 border-accent-info bg-accent-info/10 pointer-events-none z-[81]"
            style={{ left: hoverStyle.left, top: hoverStyle.top, width: hoverStyle.width, height: hoverStyle.height }}
          />
        )}

        {/* Selection rectangle (fixed-positioned over the whole overlay) */}
        {selectionStyle && (
          <div
            className="fixed border-2 border-accent-primary bg-accent-primary/10 pointer-events-none z-[81]"
            style={selectionStyle}
          />
        )}
      </div>

      {selecting && (
        <div className="px-3 py-1.5 text-center text-[11px] text-muted-foreground border-t border-border/40 shrink-0">
          Click a highlighted element to capture it, or drag a custom rectangle. Press Esc to cancel.
        </div>
      )}
      </>
      )}
    </div>,
    document.body,
  )
}
