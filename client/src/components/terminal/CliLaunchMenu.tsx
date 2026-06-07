import { useEffect, useRef } from 'react'
import { providerLabel } from '../../lib/provider-capabilities'

interface Props {
  x: number
  y: number
  providers: readonly string[]
  onSelect: (provider: 'claude' | 'codex') => void
  onClose: () => void
}

/**
 * Context menu shown when the Terminal "Open AI CLI" shortcut is clicked on a
 * multi-provider project — lets the user pick which engine's CLI to launch.
 * Matches ShortcutContextMenu styling so it feels native to the panel.
 */
export function CliLaunchMenu({ x, y, providers, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const flippedX = typeof window !== 'undefined' && x + 200 > window.innerWidth ? x - 200 : x
  const menuH = 8 + providers.length * 32
  const flippedY = typeof window !== 'undefined' && y + menuH > window.innerHeight ? y - menuH : y

  return (
    <div
      ref={ref}
      role="menu"
      data-cli-launch-menu
      style={{ position: 'fixed', left: flippedX, top: flippedY, minWidth: 180 }}
      className="bg-[#1f1f29] border border-[#44475a] rounded-md shadow-lg py-1 z-50 text-sm"
    >
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          role="menuitem"
          onClick={() => { onSelect(p as 'claude' | 'codex'); onClose() }}
          className="w-full text-left px-3 py-1.5 text-[#f8f8f2] hover:bg-[#44475a]"
        >
          Open {providerLabel(p)}
        </button>
      ))}
    </div>
  )
}
