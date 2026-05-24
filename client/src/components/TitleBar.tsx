import { useState, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Search, Sparkles, Square, X } from 'lucide-react'
import { useHub } from '../hooks/useHub'
import { useAskHub } from './ask/AskHubProvider'

// ─── Detect Tauri environment ─────────────────────────────────────────────────

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// ─── Detect macOS (traffic lights active via titleBarStyle: Overlay) ─────────

function isMacOverlay(): boolean {
  return isTauriEnv() && /mac/i.test(navigator.platform)
}

// ─── Window control button ────────────────────────────────────────────────────

interface WinButtonProps {
  onClick: () => void
  icon: React.ReactNode
  hoverColor?: string
  hoverTextColor?: string
  ariaLabel: string
}

function WinButton({
  onClick,
  icon,
  hoverColor = 'var(--color-accent)',
  hoverTextColor = 'var(--color-accent-foreground)',
  ariaLabel,
}: WinButtonProps) {
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
        color: hovered ? hoverTextColor : 'var(--color-muted-foreground)',
        transition: 'background 0.12s ease, color 0.12s ease',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {icon}
    </button>
  )
}

// ─── Ask the Hub sparkle button ───────────────────────────────────────────────

function AskPill() {
  const [hovered, setHovered] = useState(false)
  const { enabled } = useAskHub()
  function handleClick() {
    if (!enabled) return
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', metaKey: true, ctrlKey: true, shiftKey: true, bubbles: true }),
    )
  }
  const accent = enabled ? 'var(--color-accent-primary)' : 'var(--color-muted-foreground)'
  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={!enabled}
      aria-label={enabled ? 'Ask the Hub (⌘⇧K)' : 'Ask the Hub — add a project to enable'}
      title={enabled ? 'Ask the Hub (⌘⇧K)' : 'Add a project to enable Ask the Hub'}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        right: 'calc(50% - 200px)',
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
        border: `1px solid color-mix(in srgb, ${accent} ${enabled ? '60%' : '30%'}, transparent)`,
        cursor: enabled ? 'pointer' : 'not-allowed',
        background: enabled && hovered
          ? 'color-mix(in srgb, var(--color-accent-primary) 30%, transparent)'
          : enabled
            ? 'color-mix(in srgb, var(--color-accent-primary) 12%, transparent)'
            : 'transparent',
        color: accent,
        opacity: enabled ? 1 : 0.5,
        transition: 'background 0.12s ease',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <Sparkles size={12} />
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
        border: '1px solid color-mix(in srgb, var(--color-border) 70%, transparent)',
        cursor: 'pointer',
        background: hovered
          ? 'color-mix(in srgb, var(--color-accent) 82%, transparent)'
          : 'color-mix(in srgb, var(--color-surface) 72%, transparent)',
        color: projectName ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
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
        style={{ flexShrink: 0, opacity: projectName ? 0.72 : 0.48 }}
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
        background: 'var(--color-background-deep)',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
        flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <SearchPill projectName={activeProject?.name ?? null} />
      <AskPill />
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
        background: 'var(--color-background-deep)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        userSelect: 'none',
        flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <SearchPill projectName={activeProject?.name ?? null} />
      <AskPill />

      <div data-tauri-drag-region style={{ minWidth: 116, height: '100%' }} />

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
          ariaLabel="Minimize window"
        />
        <WinButton
          onClick={handleMaximize}
          icon={<Square size={12} strokeWidth={1.8} />}
          ariaLabel="Maximize window"
        />
        <WinButton
          onClick={handleClose}
          icon={<X size={15} strokeWidth={1.8} />}
          hoverColor="var(--color-destructive)"
          hoverTextColor="var(--color-destructive-foreground)"
          ariaLabel="Close window"
        />
      </div>
    </div>
  )
}
