import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  useTerminals,
  DEFAULT_USER_HEIGHT, PANEL_MIN_HEIGHT, TERMINAL_MAX_PER_PROJECT,
  type ProjectPanelState,
} from '../../context/TerminalsContext'
import { openExternalUrl } from '../../lib/tauri-shell'
import { DEFAULT_TERMINAL_SETTINGS, type TerminalSettings } from '../../lib/terminal-settings-types'
import { ShortcutContextMenu } from './ShortcutContextMenu'
import { TerminalTopBar } from './TerminalTopBar'
import { TerminalSidebar } from './TerminalSidebar'
import { TerminalViewport } from './TerminalViewport'
import { TerminalDragHandle } from './TerminalDragHandle'
import { EmptyTerminalPlaceholder } from './EmptyTerminalPlaceholder'

interface BottomPanelProps {
  projectId: string
  state: ProjectPanelState
  /** Full project viewport height in px — used for maximize computation. */
  viewportHeight: number
  statusBarHeight: number
}

export function BottomPanel({ projectId, state, viewportHeight, statusBarHeight }: BottomPanelProps) {
  const t = useTerminals()
  const navigate = useNavigate()
  const [livePreviewHeight, setLivePreviewHeight] = useState<number | null>(null)
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS)
  const [shortcutMenu, setShortcutMenu] = useState<{ x: number; y: number; kind: 'browser' | 'script' } | null>(null)

  // Resolve terminal settings (project override → hub default) for this project,
  // so the Browser shortcut button uses the configured URL.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/terminal-settings`)
        if (!res.ok) return
        const body = await res.json() as { resolved?: TerminalSettings }
        if (!cancelled && body?.resolved) setSettings(body.resolved)
      } catch { /* ignore — keep defaults */ }
    })()
    return () => { cancelled = true }
  }, [projectId])

  const maxHeight = Math.max(PANEL_MIN_HEIGHT, viewportHeight - statusBarHeight - 40)
  const userHeight = Math.min(Math.max(state.userHeight || DEFAULT_USER_HEIGHT, PANEL_MIN_HEIGHT), maxHeight)
  const height =
    state.visibility === 'maximized' ? Math.max(PANEL_MIN_HEIGHT, viewportHeight - statusBarHeight) :
    livePreviewHeight ?? userHeight

  const canCreate = state.sessions.length < TERMINAL_MAX_PER_PROJECT
  const hasActive = state.activeId !== null

  const handleCreate = useCallback(() => {
    if (!canCreate) return
    void t.create(projectId)
  }, [canCreate, projectId, t])

  const handleOpenClaude = useCallback(() => {
    if (!canCreate) return
    // Auto-number "claude", "claude (2)", "claude (3)" so multiple Claude
    // terminals are easy to tell apart in the sidebar.
    const claudeMatches = state.sessions.filter(
      (s) => s.name === 'claude' || /^claude \(\d+\)$/.test(s.name),
    )
    const name = claudeMatches.length === 0 ? 'claude' : `claude (${claudeMatches.length + 1})`
    void t.createAndType(projectId, 'claude\n', { name })
  }, [canCreate, projectId, state.sessions, t])

  const handleOpenBrowser = useCallback(() => {
    void openExternalUrl(settings.browserShortcutUrl)
  }, [settings.browserShortcutUrl])

  const handlePasteScript = useCallback(() => {
    if (!state.activeId) return
    if (!settings.quickScript) return
    t.writeToSession(state.activeId, settings.quickScript)
  }, [settings.quickScript, state.activeId, t])

  const handleConfigureBrowser = useCallback((anchor: { x: number; y: number }) => {
    setShortcutMenu({ ...anchor, kind: 'browser' })
  }, [])
  const handleConfigureScript = useCallback((anchor: { x: number; y: number }) => {
    setShortcutMenu({ ...anchor, kind: 'script' })
  }, [])
  const handleNavigateToSetting = useCallback((kind: 'browser' | 'script') => {
    const hash = kind === 'browser' ? '#terminal-browser-shortcut-url' : '#terminal-quick-script'
    navigate(`/settings${hash}`)
  }, [navigate])

  const handleKillActive = useCallback(() => {
    if (!state.activeId) return
    void t.kill(projectId, state.activeId)
  }, [projectId, state.activeId, t])

  const handleToggleMaximize = useCallback(() => {
    t.setVisibility(projectId, state.visibility === 'maximized' ? 'restored' : 'maximized')
  }, [projectId, state.visibility, t])

  const handleCollapse = useCallback(() => {
    t.setVisibility(projectId, 'hidden')
  }, [projectId, t])

  // Reset live preview when visibility changes (e.g. maximize)
  useEffect(() => { setLivePreviewHeight(null) }, [state.visibility])

  if (state.visibility === 'hidden') return null

  return (
    <div
      className={cn(
        'relative flex flex-col shrink-0 bg-background/95',
        'border-t border-border/40',
      )}
      style={{ height }}
      data-testid="terminal-bottom-panel"
    >
      <TerminalDragHandle
        height={userHeight}
        maxHeight={maxHeight}
        onHeightPreview={(h) => setLivePreviewHeight(h)}
        onHeightCommit={(h) => {
          setLivePreviewHeight(null)
          t.setUserHeight(projectId, h)
          if (state.visibility === 'maximized') t.setVisibility(projectId, 'restored')
        }}
      />
      <TerminalTopBar
        visibility={state.visibility}
        canCreate={canCreate}
        hasActive={hasActive}
        onCreate={handleCreate}
        onOpenClaude={handleOpenClaude}
        onOpenBrowser={handleOpenBrowser}
        onPasteScript={handlePasteScript}
        pasteScriptDisabled={!hasActive || !settings.quickScript}
        onConfigureBrowser={handleConfigureBrowser}
        onConfigureScript={handleConfigureScript}
        onKillActive={handleKillActive}
        onToggleMaximize={handleToggleMaximize}
        onCollapse={handleCollapse}
      />
      {shortcutMenu && (
        <ShortcutContextMenu
          x={shortcutMenu.x}
          y={shortcutMenu.y}
          label={shortcutMenu.kind === 'browser' ? 'Configure browser URL in settings…' : 'Edit quick script in settings…'}
          onSelect={() => handleNavigateToSetting(shortcutMenu.kind)}
          onClose={() => setShortcutMenu(null)}
        />
      )}
      <div className="flex-1 flex min-h-0">
        {state.sessions.length === 0 ? (
          <EmptyTerminalPlaceholder onCreate={handleCreate} />
        ) : (
          <>
            <TerminalViewport activeId={state.activeId} />
            <TerminalSidebar
              sessions={state.sessions}
              activeId={state.activeId}
              onActivate={(id) => t.setActive(projectId, id)}
              onRename={(id, name) => void t.rename(projectId, id, name)}
              onKill={(id) => void t.kill(projectId, id)}
            />
          </>
        )}
      </div>
    </div>
  )
}
