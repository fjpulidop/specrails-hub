import { useCallback, useEffect, useRef, useState } from 'react'
import { useTerminals } from '../../context/TerminalsContext'
import { TerminalSearchOverlay } from './TerminalSearchOverlay'
import { TerminalContextMenu } from './TerminalContextMenu'
import { revealItemInDir, isTauri } from '../../lib/tauri-shell'
import { saveScrollbackToFile } from '../../lib/save-scrollback'
import { registerTauriDragDrop } from '../../lib/tauri-drag-drop'
import { PromptGutter } from './PromptGutter'
import { CommandTimingBadge } from './CommandTimingBadge'

interface TerminalViewportProps {
  activeId: string | null
}

/**
 * The viewport slot. Reparents the active session's container DOM node from the
 * hidden terminal host into this element's subtree, and moves it back on unmount
 * or when the active session changes. Never unmounts xterm.
 *
 * Also listens to `transitionend` on ancestor sidebar elements so that, when a
 * sidebar finishes animating, we issue an immediate refit. This complements the
 * trailing-debounced ResizeObserver inside TerminalsContext: the transitionend
 * is the "settle" signal, and the debounced fit is the catch-all.
 */
export function TerminalViewport({ activeId }: TerminalViewportProps) {
  const slotRef = useRef<HTMLDivElement | null>(null)
  const terminals = useTerminals()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const tauri = isTauri()

  // Subscribe to "open search overlay" requests for the active session.
  useEffect(() => {
    if (!activeId) return
    return terminals.subscribeOpenSearch(activeId, () => setSearchOpen(true))
  }, [activeId, terminals])

  // Close search and any open menu when the active session changes.
  useEffect(() => { setSearchOpen(false); setMenu(null) }, [activeId])

  const search = activeId ? terminals.getSearchAddon(activeId) : null
  const term = activeId ? terminals.getTerminalInstance(activeId) : null
  const cwd = activeId ? terminals.getCwd(activeId) : null
  const [dragOver, setDragOver] = useState(false)

  const handleContextMenu = useCallback((ev: React.MouseEvent) => {
    // Always preventDefault so the WebView's native contextmenu does not show.
    ev.preventDefault()
    // Defer to the running app (tmux, vim, htop) when it has enabled mouse
    // tracking — but only when Shift is NOT held. Shift-right-click forces our
    // menu so the user can still get to Copy/Save when an alt-screen app is up.
    if (!ev.shiftKey && term) {
      const mode = (term as unknown as { modes?: { mouseTrackingMode?: string } }).modes?.mouseTrackingMode
      if (mode && mode !== 'none') return
    }
    setMenu({ x: ev.clientX, y: ev.clientY })
  }, [term])

  // Register Tauri drag-drop listener. Returns active session/viewport on demand.
  useEffect(() => {
    let disposed = false
    let controller: { dispose: () => void } | null = null
    void registerTauriDragDrop(() => {
      const slot = slotRef.current
      const t = activeId ? terminals.getTerminalInstance(activeId) : null
      if (!slot || !t) return null
      return { term: t, viewportEl: slot }
    }).then((c) => {
      if (disposed) c.dispose()
      else controller = c
    })
    return () => {
      disposed = true
      controller?.dispose()
    }
  }, [activeId, terminals])

  useEffect(() => {
    const slot = slotRef.current
    if (!slot || !activeId) return
    const container = terminals.getContainer(activeId)
    if (!container) return
    slot.appendChild(container)
    terminals.notifyAdopted(activeId)
    return () => {
      const host = document.getElementById('specrails-terminal-host')
      if (host && container.parentElement === slot) {
        host.appendChild(container)
      }
    }
  }, [activeId, terminals])

  // transitionend → immediate refit. Walk ancestors to find sidebar-like elements.
  useEffect(() => {
    const slot = slotRef.current
    if (!slot || !activeId) return
    const ancestors: Element[] = []
    let cur: Element | null = slot.parentElement
    while (cur && cur !== document.body) {
      const tag = cur.tagName.toLowerCase()
      if (tag === 'aside' || cur.matches('[data-sidebar]')) {
        ancestors.push(cur)
      }
      cur = cur.parentElement
    }
    if (ancestors.length === 0) return
    const onTransitionEnd = (ev: Event) => {
      const tev = ev as TransitionEvent
      if (tev.propertyName !== 'width' && tev.propertyName !== 'height') return
      terminals.refitActive(activeId)
    }
    ancestors.forEach((a) => a.addEventListener('transitionend', onTransitionEnd))
    return () => {
      ancestors.forEach((a) => a.removeEventListener('transitionend', onTransitionEnd))
    }
  }, [activeId, terminals])

  return (
    <div
      ref={slotRef}
      className={`flex-1 min-w-0 bg-[#282a36] px-2 py-1 relative ${dragOver ? 'outline outline-2 outline-[#bd93f9] outline-offset-[-2px]' : ''}`}
      role="presentation"
      data-terminal-viewport
      onContextMenu={handleContextMenu}
      onDragEnter={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        // Browser drop has no path; we render highlight only and let Tauri's
        // native event handle the actual paste in the desktop app.
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
        setDragOver(false)
      }}
    >
      {activeId && <PromptGutter sessionId={activeId} />}
      {activeId && <CommandTimingBadge sessionId={activeId} />}
      {searchOpen && search && (
        <TerminalSearchOverlay search={search} onClose={() => setSearchOpen(false)} />
      )}
      {menu && term && (
        <TerminalContextMenu
          x={menu.x}
          y={menu.y}
          term={term}
          cwd={cwd}
          hasReveal={tauri}
          onClose={() => setMenu(null)}
          onOpenSearch={() => setSearchOpen(true)}
          onReveal={(p) => { void revealItemInDir(p) }}
          onSaveScrollback={() => { if (term) void saveScrollbackToFile(term) }}
        />
      )}
    </div>
  )
}
