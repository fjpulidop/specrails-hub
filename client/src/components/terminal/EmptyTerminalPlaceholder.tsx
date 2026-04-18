import { Terminal as TerminalIcon, Plus } from 'lucide-react'

interface EmptyTerminalPlaceholderProps {
  onCreate: () => void
}

export function EmptyTerminalPlaceholder({ onCreate }: EmptyTerminalPlaceholderProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6 bg-[#282a36]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <TerminalIcon className="h-8 w-8 opacity-50" />
        <p className="text-xs">No terminals yet for this project.</p>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-border/30 hover:bg-border/50 hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" /> New terminal
        </button>
      </div>
    </div>
  )
}
