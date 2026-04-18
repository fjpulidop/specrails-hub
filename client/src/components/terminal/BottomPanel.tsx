import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  useTerminals,
  DEFAULT_USER_HEIGHT, PANEL_MIN_HEIGHT, TERMINAL_MAX_PER_PROJECT,
  type ProjectPanelState,
} from '../../context/TerminalsContext'
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
  const [livePreviewHeight, setLivePreviewHeight] = useState<number | null>(null)

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
        onKillActive={handleKillActive}
        onToggleMaximize={handleToggleMaximize}
        onCollapse={handleCollapse}
      />
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
