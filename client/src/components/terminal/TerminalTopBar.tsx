import { Plus, Trash2, Maximize2, Minimize2, Sparkles, Globe, Code2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PanelChevronButton } from './PanelChevronButton'
import type { PanelVisibility } from '../../context/TerminalsContext'

interface TerminalTopBarProps {
  visibility: PanelVisibility
  canCreate: boolean
  hasActive: boolean
  onCreate: () => void
  onOpenClaude: () => void
  onOpenBrowser: () => void
  onPasteScript: () => void
  pasteScriptDisabled: boolean
  onConfigureBrowser: (anchor: { x: number; y: number }) => void
  onConfigureScript: (anchor: { x: number; y: number }) => void
  onKillActive: () => void
  onToggleMaximize: () => void
  onCollapse: () => void
}

export function TerminalTopBar({
  visibility, canCreate, hasActive, onCreate, onOpenClaude, onOpenBrowser, onPasteScript, pasteScriptDisabled,
  onConfigureBrowser, onConfigureScript,
  onKillActive, onToggleMaximize, onCollapse,
}: TerminalTopBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between h-7 px-2 shrink-0',
        'bg-background/95 backdrop-blur-sm',
        'border-b border-border/40',
        'text-[10px] uppercase tracking-wide text-muted-foreground select-none',
      )}
    >
      <div className="flex items-center gap-2 pl-1">
        <span className="font-medium text-foreground">Terminal</span>
      </div>
      <div className="flex items-center gap-0.5">
        <ActionButton
          label={canCreate ? 'Open Claude in new terminal' : 'Max 10 terminals per project'}
          disabled={!canCreate}
          onClick={onOpenClaude}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label="Open in browser"
          onClick={onOpenBrowser}
          onContextMenu={(ev) => { ev.preventDefault(); onConfigureBrowser({ x: ev.clientX, y: ev.clientY }) }}
        >
          <Globe className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label={pasteScriptDisabled ? 'No active terminal to paste into' : 'Paste quick script into active terminal'}
          disabled={pasteScriptDisabled}
          onClick={onPasteScript}
          onContextMenu={(ev) => { ev.preventDefault(); onConfigureScript({ x: ev.clientX, y: ev.clientY }) }}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label={canCreate ? 'New terminal' : 'Max 10 terminals per project'}
          disabled={!canCreate}
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label="Kill active terminal"
          disabled={!hasActive}
          onClick={onKillActive}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label={visibility === 'maximized' ? 'Restore panel' : 'Maximize panel'}
          onClick={onToggleMaximize}
        >
          {visibility === 'maximized'
            ? <Minimize2 className="h-3.5 w-3.5" />
            : <Maximize2 className="h-3.5 w-3.5" />}
        </ActionButton>
        <PanelChevronButton isOpen onClick={onCollapse} />
      </div>
    </div>
  )
}

interface ActionButtonProps {
  label: string
  disabled?: boolean
  onClick: () => void
  onContextMenu?: (ev: React.MouseEvent) => void
  children: React.ReactNode
}

function ActionButton({ label, disabled, onClick, onContextMenu, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center h-5 w-6 rounded',
        'text-muted-foreground transition-colors duration-120',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-border/40 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dracula-purple/60',
      )}
    >
      {children}
    </button>
  )
}
