import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Sparkles, Send, Zap, MessagesSquare, Globe, Ratio } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useHub } from '../hooks/useHub'
import { useSpecGenTracker } from '../hooks/useSpecGenTracker'
import { API_ORIGIN } from '../lib/origin'
import { deleteAllAttachments } from '../lib/attachments'
import { RichAttachmentEditor, type RichAttachmentEditorHandle } from './RichAttachmentEditor'
import { SpecModelPicker, useDefaultSpecModel } from './explore-spec/SpecModelPicker'
import { AiEngineSelector } from './AiEngineSelector'
import type { LocalTicket } from '../types'
import { ContextScopeChecks } from './ContextScopeChecks'
import { ContextScopeSlider } from './ContextScopeSlider'
import { isSmashCapable } from '../lib/provider-capabilities'
import { getLastEngine, setLastEngine } from '../lib/last-engine'
import { useContextScope } from '../hooks/useContextScope'
import { useContextBudget } from '../hooks/useContextBudget'
import { useQuickContractRefineLast } from '../hooks/useQuickContractRefineLast'
import { quickHintForScope, tierFromScope, submitAccentForTier, type ContextScope } from '../types/context-scope'
import { BrowserCaptureModal } from './browser-capture/BrowserCaptureModal'
import { CapturedDomPanel } from './browser-capture/CapturedDomPanel'
import { isBrowserCaptureEnabled, type CaptureResult, type CapturedDom } from '../lib/browser-capture'

interface BrowserCaptureBreakpoint {
  key: string
  attachmentId: string
  dataUrl: string
  width: number
}

interface BrowserCaptureEntry {
  screenshotId: string
  screenshotName: string
  screenshotDataUrl: string
  domAttachmentId: string
  dom: CapturedDom
  /** Present for a multi-breakpoint capture: one screenshot per device size. */
  breakpoints?: BrowserCaptureBreakpoint[]
}

type SpecMode = 'quick' | 'explore'

export interface ExploreLaunchPayload {
  idea: string
  pendingSpecId: string
  initialAttachmentIds: string[]
  /** Model picked at Add Spec — locked for the lifetime of the explore flow.
   *  No downstream UI changes it. */
  model: string
  /** AI engine picked at Add Spec (multi-provider). Undefined → project primary.
   *  Forwarded to the ExploreSpecShell so the conversation runs on it. */
  provider?: 'claude' | 'codex'
  /** Add Spec context scope frozen at launch time. Forwarded to the
   *  ExploreSpecShell so the server-side conversation row carries it. */
  contextScope: ContextScope
}

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
  tickets: LocalTicket[]
  /** Required when explore mode should be wired. Parent owns the
   *  ExploreSpecShell lifecycle so it can keep the chat alive across
   *  modal close events (used by the minimize-to-dock flow). */
  onExploreLaunch?: (payload: ExploreLaunchPayload) => void
}

function genPendingId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // fallback (shouldn't be hit in modern browsers)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function ProposeSpecModal({ open, onClose, tickets, onExploreLaunch }: ProposeSpecModalProps) {
  const { activeProjectId, projects } = useHub()
  const tracker = useSpecGenTracker()
  const [mode, setMode] = useState<SpecMode>('quick')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasText, setHasText] = useState(false)
  const [attachmentCount, setAttachmentCount] = useState(0)
  const [pendingSpecId, setPendingSpecId] = useState<string>(() => genPendingId())
  const [browserOpen, setBrowserOpen] = useState(false)
  const [captures, setCaptures] = useState<BrowserCaptureEntry[]>([])
  const browserCaptureEnabled = isBrowserCaptureEnabled()
  const editorRef = useRef<RichAttachmentEditorHandle | null>(null)
  const submittedRef = useRef(false)
  const scopeTouchedRef = useRef(false)

  // AI Engine (multi-provider). null until the first fetch resolves the
  // project's providers; then initialised to the last-used engine (default =
  // primary). Single-provider projects never render the selector.
  const [engine, setEngine] = useState<'claude' | 'codex' | null>(null)

  // Model picker — fetched on each open. Locked for the whole flow once the
  // user submits; no downstream surface changes it. See spec
  // `add-spec-model-selection`. Refetches when the engine changes.
  const { model, setModel, allowed, loading: modelLoading, provider, providers } =
    useDefaultSpecModel(activeProjectId, open, engine)

  // Initialise the engine selection once providers are known (remember last
  // choice per project; default to primary).
  useEffect(() => {
    if (!open || engine || providers.length === 0) return
    setEngine(getLastEngine(activeProjectId, providers, provider ?? 'claude'))
  }, [open, engine, providers, provider, activeProjectId])

  const handleEngineChange = useCallback((next: 'claude' | 'codex') => {
    setEngine(next)
    setLastEngine(activeProjectId, next)
  }, [activeProjectId])

  // Effective provider drives SMASH gating + the payload's aiEngine. Prefer the
  // user's pick; fall back to the resolved primary while it loads.
  const effectiveProvider = engine ?? provider

  const { scope, setScope, persist: persistScope } = useContextScope(activeProjectId, mode, open)
  const quickRefine = useQuickContractRefineLast(activeProjectId, open)
  const { data: budget, isError: budgetError } = useContextBudget(activeProjectId, open)
  const tier = useMemo(() => tierFromScope(scope), [scope])
  const smashCapable = isSmashCapable(effectiveProvider)

  useEffect(() => {
    if (mode !== 'quick' || !quickRefine.loaded || scopeTouchedRef.current) return
    setScope((prev) => ({ ...prev, contractRefine: quickRefine.value }))
  }, [mode, quickRefine.loaded, quickRefine.value, setScope])

  const handleScopeChange = useCallback((next: ContextScope | ((s: ContextScope) => ContextScope)) => {
    scopeTouchedRef.current = true
    setScope(next)
  }, [setScope])

  useEffect(() => {
    scopeTouchedRef.current = false
  }, [mode])

  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  const projectsRef = useRef(projects)
  useEffect(() => { projectsRef.current = projects }, [projects])

  // Reset on open; cleanup orphaned attachments on close-without-submit
  useEffect(() => {
    if (open) {
      setPendingSpecId(genPendingId())
      setMode('quick')
      setIsSubmitting(false)
      setHasText(false)
      setAttachmentCount(0)
      setEngine(null)
      setBrowserOpen(false)
      setCaptures([])
      submittedRef.current = false
      scopeTouchedRef.current = false
      // defer to let dialog mount; reset any user-resized height so the modal
      // always opens at the configured minHeight, then focus the editor.
      setTimeout(() => {
        editorRef.current?.resetHeight()
        editorRef.current?.focus()
      }, 50)
    }
  }, [open])

  useEffect(() => {
    // On close, if not submitted and we had attachments, clean up
    if (!open && !submittedRef.current && attachmentCount > 0) {
      deleteAllAttachments(pendingSpecId).catch((err) => console.warn('[ProposeSpec] cleanup failed:', err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canSubmit = useMemo(() => (hasText || captures.length > 0) && !isSubmitting, [hasText, captures.length, isSubmitting])

  const handleCaptured = useCallback((result: CaptureResult) => {
    // A capture contributes two attachments (screenshot image + DOM JSON). Both
    // are tracked here and merged into the submit payload; the screenshot renders
    // as a visual chip and the DOM in a collapsible panel. They are NOT inserted
    // as editor pills so removeCapture can cleanly drop both.
    // If the user annotated, the flattened image is `screenshot`; drop the raw one
    // it replaced so only the annotated image + DOM ride into the spec.
    if (result.rawScreenshot && result.rawScreenshot.id !== result.screenshot.id) {
      const pid = activeProjectIdRef.current
      fetch(`${API_ORIGIN}/api/projects/${pid}/tickets/${pendingSpecId}/attachments/${result.rawScreenshot.id}`, { method: 'DELETE' }).catch(() => {})
    }
    const breakpoints = result.breakpoints
      ? Object.entries(result.breakpoints).map(([key, b]) => ({ key, attachmentId: b.attachment.id, dataUrl: b.dataUrl, width: b.viewport.width }))
      : undefined
    setCaptures((c) => [...c, {
      screenshotId: result.screenshot.id,
      screenshotName: result.screenshot.filename,
      screenshotDataUrl: result.screenshotDataUrl,
      domAttachmentId: result.domAttachment.id,
      dom: result.dom,
      breakpoints,
    }])
    // One DOM attachment + N screenshots (N=1 for a normal capture).
    setAttachmentCount((c) => c + 1 + (breakpoints ? breakpoints.length : 1))
  }, [pendingSpecId])

  const removeCapture = useCallback((entry: BrowserCaptureEntry) => {
    setCaptures((c) => c.filter((e) => e.domAttachmentId !== entry.domAttachmentId))
    const ids = new Set<string>([entry.screenshotId, entry.domAttachmentId, ...(entry.breakpoints?.map((b) => b.attachmentId) ?? [])])
    setAttachmentCount((c) => Math.max(0, c - ids.size))
    const pid = activeProjectIdRef.current
    for (const id of ids) {
      fetch(`${API_ORIGIN}/api/projects/${pid}/tickets/${pendingSpecId}/attachments/${id}`, { method: 'DELETE' }).catch(() => {})
    }
  }, [pendingSpecId])

  const handleSubmit = useCallback(async () => {
    const typed = editorRef.current?.getPlainText().trim() ?? ''
    let idea = typed || (captures.length > 0
      ? 'Create a spec based on the captured browser selection (a screenshot and the page DOM are attached for reference).'
      : '')
    if (!idea) return
    // When any capture is multi-breakpoint, tell the spec generator it must be
    // responsive and which reference sizes are attached.
    const responsive = captures.find((c) => c.breakpoints && c.breakpoints.length > 1)
    if (responsive) {
      const widths = responsive.breakpoints!.map((b) => `${b.width}px`).join(', ')
      idea += `${idea ? '\n\n' : ''}This element must be responsive: reference screenshots are attached at ${widths}.`
    }
    const attachmentIds = [
      ...(editorRef.current?.getAttachmentIds() ?? []),
      ...captures.flatMap((c) => [
        ...(c.breakpoints ? c.breakpoints.map((b) => b.attachmentId) : [c.screenshotId]),
        c.domAttachmentId,
      ]),
    ]

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    // Explore mode: hand off to the parent (which owns the overlay
    // lifecycle so the conversation can survive modal close — i.e. minimize
    // to dock). Attachments uploaded into pendingSpecId are carried through
    // and folded into Claude's context for the first turn.
    if (mode === 'explore') {
      if (!onExploreLaunch) {
        toast.error('Explore mode is not wired in this view')
        return
      }
      submittedRef.current = true // suppress attachment cleanup on close
      void persistScope(scope)
      // If the picker is still resolving, fall back to 'sonnet' as a safe
      // claude default — server re-validates and will resolve the project's
      // configured default if this doesn't fit.
      onExploreLaunch({
        idea, pendingSpecId, initialAttachmentIds: attachmentIds,
        model: model ?? 'sonnet',
        provider: effectiveProvider ?? undefined,
        contextScope: scope,
      })
      onClose()
      return
    }

    const projectName = projectsRef.current.find(p => p.id === projectId)?.name ?? 'Project'
    const toastId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const truncated = idea.length > 45 ? idea.slice(0, 45) + '…' : idea
    const knownTicketIds = new Set(tickets.map(t => t.id))
    const startTime = Date.now()

    toast.loading(`${projectName} · ${truncated}`, { id: toastId, description: 'Generating...' })

    submittedRef.current = true
    void quickRefine.persist(scope.contractRefine)
    setIsSubmitting(true)
    editorRef.current?.clear()
    setAttachmentCount(0)
    setHasText(false)
    setCaptures([])

    const reg = { toastId, truncated, knownTicketIds, projectId, projectName, startTime, persistId: toastId }

    try {
      let res: Response
      try {
        res = await fetch(`${API_ORIGIN}/api/projects/${projectId}/tickets/generate-spec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea, attachmentIds, pendingSpecId, model: model ?? undefined,
            aiEngine: effectiveProvider ?? undefined,
            contextScope: {
              specrails: scope.specrails,
              openspec: scope.openspec,
              full: scope.full,
              mcp: scope.mcp,
              contractRefine: scope.contractRefine,
            },
            contractRefine: scope.contractRefine,
          }),
        })
      } catch (err) {
        console.error('[ProposeSpec] generate-spec fetch threw:', err)
        toast.error(`${projectName} · Failed to start`, { id: toastId })
        return
      }
      if (!res.ok) {
        toast.error(`${projectName} · Failed to start`, { id: toastId })
        return
      }
      const data = await res.json() as { requestId: string }
      tracker.registerFastSpec(data.requestId, reg)
    } finally {
      setIsSubmitting(false)
    }
  }, [mode, tickets, tracker, pendingSpecId, onClose, onExploreLaunch, model, quickRefine, scope, effectiveProvider, captures])

  return (
    <>
      {/* While the browser-capture modal is open we drop the Add Spec dialog to
          non-modal: Radix's modal layer otherwise sets `pointer-events:none` on
          <body> and traps focus inside DialogContent, which would block the
          body-portaled BrowserCaptureModal (can't interact with URL bar or
          canvas). DialogContent stays mounted with state preserved while the
          capture modal is stacked above at a higher z-index. */}
      <Dialog open={open} modal={!browserOpen} onOpenChange={(o) => { if (!o && !browserOpen) onClose() }}>
        <DialogContent className="max-w-4xl flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary/70" />
              Add Spec
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create a new spec from a short idea, either immediately or through Explore mode.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col p-5 gap-4 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <ModeSegmented value={mode} onChange={setMode} fullCodebase={scope.full} />
              <div className="flex items-center gap-2">
                <AiEngineSelector
                  value={effectiveProvider ?? 'claude'}
                  providers={providers}
                  onChange={handleEngineChange}
                  disabled={modelLoading}
                  ariaLabel="AI engine for this spec"
                />
                <SpecModelPicker
                  value={model}
                  allowed={allowed}
                  loading={modelLoading}
                  onChange={setModel}
                />
              </div>
            </div>

            <div className="space-y-3">
              <ContextScopeSlider
                value={scope}
                onChange={handleScopeChange}
                budget={budget}
                budgetError={budgetError}
                model={model ?? 'sonnet'}
                maxPresetId={mode === 'quick' ? 'max' : 'hub'}
                smashCapable={smashCapable}
              />
              <ContextScopeChecks scope={scope} mode={mode} onChange={handleScopeChange} label="Fine-tune" showSummary={false} />
            </div>

            <p className="text-sm text-muted-foreground">
              {mode === 'quick'
                ? 'Describe the feature or change. Attach mockups, briefs, or data for more context.'
                : 'Describe a rough idea. Claude will help you shape it through conversation — you decide when to commit.'}
            </p>
            <RichAttachmentEditor
              ref={editorRef}
              ticketKey={pendingSpecId}
              placeholder={mode === 'quick'
                ? "e.g. Add a dark mode toggle to the settings page that persists the user's preference..."
                : "e.g. dark mode — not sure where the toggle should live or how to persist it…"}
              minHeight={160}
              autoFocus
              ariaLabel="Spec idea"
              onChange={() => setHasText((editorRef.current?.getPlainText().length ?? 0) > 0)}
              onAttachmentAdded={() => setAttachmentCount((c) => c + 1)}
              onAttachmentRemoved={(a) => {
                setAttachmentCount((c) => Math.max(0, c - 1))
                fetch(`${API_ORIGIN}/api/projects/${activeProjectIdRef.current}/tickets/${pendingSpecId}/attachments/${a.id}`, { method: 'DELETE' }).catch(() => {})
              }}
              onUnsupportedFile={(f) => toast.error(`Unsupported file type: ${f.name}`)}
              onUploadError={(err, f) => toast.error(`Upload failed for ${f.name}: ${err.message}`)}
              onSubmit={handleSubmit}
              footerExtra={browserCaptureEnabled && activeProjectId ? (
                <button
                  type="button"
                  onClick={() => setBrowserOpen(true)}
                  data-testid="from-browser-btn"
                  title="Open a real web page, select an area, and turn it into a spec"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-accent-info/50 text-accent-info hover:bg-accent-info/10 transition-colors font-medium"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>From a website</span>
                </button>
              ) : undefined}
            />
            {captures.length > 0 && (
              <div className="space-y-3" data-testid="captured-dom-list">
                {captures.map((c) => (
                  <div key={c.domAttachmentId} className="space-y-1.5">
                    <div className="rounded-lg border border-accent-secondary/40 bg-accent-secondary/5 p-2 space-y-1.5">
                      {c.breakpoints ? (
                        <div className="space-y-1.5" data-testid="capture-breakpoints">
                          <div className="flex items-center gap-1 text-[10px] font-medium text-accent-highlight">
                            <Ratio className="w-3 h-3 shrink-0" />
                            Responsive · {c.breakpoints.length} sizes
                          </div>
                          <div className="flex items-end justify-center gap-2 flex-wrap">
                            {c.breakpoints.map((b) => (
                              <div key={b.key} className="flex flex-col items-center gap-1">
                                <img
                                  src={b.dataUrl}
                                  alt={`${b.key} (${b.width}px)`}
                                  className="max-h-36 w-auto max-w-[10rem] object-contain rounded border border-border/60 bg-background-deep block"
                                />
                                <span className="text-[10px] text-muted-foreground tabular-nums">{b.key} · {b.width}px</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <img
                          src={c.screenshotDataUrl}
                          alt={c.screenshotName}
                          className="max-h-44 w-auto max-w-full object-contain rounded border border-border/60 bg-background-deep mx-auto block"
                        />
                      )}
                      {c.dom.url && c.dom.url !== 'about:blank' && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={c.dom.url}>
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{c.dom.url}</span>
                        </div>
                      )}
                    </div>
                    <CapturedDomPanel dom={c.dom} onRemove={() => removeCapture(c)} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`gap-1.5 ${submitAccentForTier(tier)}`}
                data-testid="propose-submit"
              >
                <Send className="w-3.5 h-3.5" />
                {mode === 'quick' ? 'Generate Spec' : 'Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {browserCaptureEnabled && browserOpen && activeProjectId && (
        <BrowserCaptureModal
          open={browserOpen}
          onClose={() => setBrowserOpen(false)}
          projectId={activeProjectId}
          pendingSpecId={pendingSpecId}
          onCaptured={handleCaptured}
        />
      )}
    </>
  )
}

function ModeSegmented({
  value, onChange, fullCodebase,
}: { value: SpecMode; onChange: (v: SpecMode) => void; fullCodebase: boolean }) {
  return (
    <div role="tablist" aria-label="Spec creation mode" className="inline-flex items-center gap-1 p-1 rounded-lg border border-border/50 bg-card/40 self-start">
      <ModeOption
        active={value === 'quick'}
        icon={<Zap className="w-3.5 h-3.5" />}
        label="Quick"
        hint={quickHintForScope({ specrails: false, openspec: false, full: fullCodebase, mcp: false, contractRefine: false })}
        onClick={() => onChange('quick')}
      />
      <ModeOption
        active={value === 'explore'}
        icon={<MessagesSquare className="w-3.5 h-3.5" />}
        label="Explore"
        hint="interactive"
        onClick={() => onChange('explore')}
      />
    </div>
  )
}

function ModeOption({
  active, icon, label, hint, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
      }`}
    >
      {icon}
      {label}
      <span className={`text-[10px] ${active ? 'text-primary/60' : 'text-muted-foreground/60'}`}>{hint}</span>
    </button>
  )
}
