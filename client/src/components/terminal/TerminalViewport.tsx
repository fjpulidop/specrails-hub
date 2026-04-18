import { useEffect, useRef } from 'react'
import { useTerminals } from '../../context/TerminalsContext'

interface TerminalViewportProps {
  activeId: string | null
}

/**
 * The viewport slot. Reparents the active session's container DOM node from the
 * hidden terminal host into this element's subtree, and moves it back on unmount
 * or when the active session changes. Never unmounts xterm.
 */
export function TerminalViewport({ activeId }: TerminalViewportProps) {
  const slotRef = useRef<HTMLDivElement | null>(null)
  const terminals = useTerminals()

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

  return (
    <div
      ref={slotRef}
      className="flex-1 min-w-0 bg-[#282a36] px-2 py-1"
      role="presentation"
      data-terminal-viewport
    />
  )
}
