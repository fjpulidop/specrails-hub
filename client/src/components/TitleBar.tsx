import { useState, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Search, Square, X } from 'lucide-react'
import { useHub } from '../hooks/useHub'

// ─── Detect Tauri environment ─────────────────────────────────────────────────

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// ─── Detect macOS (traffic lights active via titleBarStyle: Overlay) ─────────

function isMacOverlay(): boolean {
  return isTauriEnv() && /mac/i.test(navigator.platform)
}

// ─── SR lettermark icon ───────────────────────────────────────────────────────

function SRIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect width="512" height="512" rx="100" fill="#6272a4" />
      <text
        x="256"
        y="340"
        fontFamily="system-ui,sans-serif"
        fontWeight="bold"
        fontSize="280"
        textAnchor="middle"
        fill="#f8f8f2"
      >
        SR
      </text>
    </svg>
  )
}

// ─── Window control button ────────────────────────────────────────────────────

interface WinButtonProps {
  onClick: () => void
  icon: React.ReactNode
  hoverColor: string
  hoverTextColor?: string
  ariaLabel: string
}

function WinButton({ onClick, icon, hoverColor, hoverTextColor = '#f8f8f2', ariaLabel }: WinButtonProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 34,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        border: 'none',
        cursor: 'pointer',
        background: hovered ? hoverColor : 'transparent',
        color: hovered ? hoverTextColor : 'rgba(248,248,242,0.62)',
        transition: 'background 0.12s ease, color 0.12s ease',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {icon}
    </button>
  )
}

// ─── macOS search pill ────────────────────────────────────────────────────────

function SearchPill({ projectName }: { projectName: string | null }) {
  const [hovered, setHovered] = useState(false)

  function handleClick() {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    )
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Search (⌘K)"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '40%',
        maxWidth: 360,
        minWidth: 160,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingLeft: 8,
        paddingRight: 8,
        borderRadius: 9999,
        border: 'none',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
        color: projectName ? '#f8f8f2' : 'rgba(248,248,242,0.45)',
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: 0,
        transition: 'background 0.12s ease',
        // pill is clickable, not a drag target
        WebkitAppRegion: 'no-drag',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      } as React.CSSProperties}
    >
      <Search
        size={11}
        style={{ flexShrink: 0, opacity: projectName ? 0.7 : 0.45 }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {projectName ?? 'Search\u2026'}
      </span>
    </button>
  )
}

// ─── TitleBar component ───────────────────────────────────────────────────────

/**
 * Custom frameless titlebar for the Tauri desktop app.
 *
 * macOS (titleBarStyle: Overlay): compact 28px drag region + centered search pill.
 * Windows/Linux: matching compact chrome with centered search pill and quiet
 * custom window controls.
 *
 * Renders null in browser / non-Tauri contexts — no impact on web usage.
 * Must be mounted as the very first child of the root layout so it sits at
 * the top of the window and the drag region covers the full width.
 */
export function TitleBar() {
  if (!isTauriEnv()) return null

  const macOverlay = isMacOverlay()

  if (macOverlay) {
    return <MacTitleBar />
  }

  return <DefaultTitleBar />
}

function MacTitleBar() {
  const { projects, activeProjectId } = useHub()
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return (
    <div
      data-tauri-drag-region
      style={{
        position: 'relative',
        height: 28,
        minHeight: 28,
        background: '#282a36',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
        flexShrink: 0,
        borderBottom: '1px solid #44475a',
      }}
    >
      <SearchPill projectName={activeProject?.name ?? null} />
    </div>
  )
}

function DefaultTitleBar() {
  const { projects, activeProjectId } = useHub()
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const appWindow = getCurrentWindow()

  const handleMinimize = useCallback(() => {
    void appWindow.minimize()
  }, [appWindow])

  const handleMaximize = useCallback(() => {
    void appWindow.toggleMaximize()
  }, [appWindow])

  const handleClose = useCallback(() => {
    void appWindow.close()
  }, [appWindow])

  return (
    <div
      data-tauri-drag-region
      style={{
        position: 'relative',
        height: 36,
        minHeight: 36,
        background: '#282a36',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        userSelect: 'none',
        flexShrink: 0,
        borderBottom: '1px solid #44475a',
      }}
    >
      <SearchPill projectName={activeProject?.name ?? null} />

      {/* Left: restrained brand mark, keeps Windows chrome aligned with macOS */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 116,
          color: 'rgba(248,248,242,0.78)',
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        <SRIcon />
        <span style={{ opacity: 0.9 }}>SpecRails Hub</span>
      </div>

      {/* Right: native-feeling window controls for frameless Windows/Linux */}
      <div
        style={{
          minWidth: 116,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          alignItems: 'center',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <WinButton
          onClick={handleMinimize}
          icon={<Minus size={14} strokeWidth={1.8} />}
          hoverColor="rgba(68,71,90,0.8)"
          ariaLabel="Minimize window"
        />
        <WinButton
          onClick={handleMaximize}
          icon={<Square size={12} strokeWidth={1.8} />}
          hoverColor="rgba(68,71,90,0.8)"
          ariaLabel="Maximize window"
        />
        <WinButton
          onClick={handleClose}
          icon={<X size={15} strokeWidth={1.8} />}
          hoverColor="rgba(255,85,85,0.92)"
          hoverTextColor="#282a36"
          ariaLabel="Close window"
        />
      </div>
    </div>
  )
}
