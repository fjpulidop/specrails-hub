import { useEffect, useRef } from 'react'
import { Sparkles, GitBranch, Bot, DollarSign } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'

interface Props {
  open: boolean
  railLabel: string
  specCount: number
  /** Selected model (haiku/sonnet/opus). Shown for context. */
  model?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation modal shown before launching a rail in Ultracode mode. Ultracode
 * bypasses the OpenSpec pipeline and lets Claude run with native agents +
 * dynamic workflows, so cost is variable — the user explicitly opts in here.
 * Continue is the affirmative (green) action; ⌘/Ctrl+Enter triggers it.
 */
export function UltracodeLaunchDialog({ open, railLabel, specCount, model, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // ⌘/Ctrl + Enter confirms while the dialog is open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onConfirm])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-5"
        onOpenAutoFocus={(e) => { e.preventDefault(); confirmRef.current?.focus() }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-highlight/15 text-accent-highlight ring-1 ring-accent-highlight/30">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div className="text-left">
              <DialogTitle className="text-base">Launch in Ultracode mode</DialogTitle>
              <DialogDescription>
                {railLabel} · {specCount} spec{specCount === 1 ? '' : 's'}
                {model ? ` · ${model}` : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="space-y-2.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2.5">
            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-warning" />
            <span><span className="font-medium text-foreground">No OpenSpec pipeline.</span> The structured architect → developer → reviewer flow is skipped entirely.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-info" />
            <span><span className="font-medium text-foreground">Native Claude autonomy.</span> Claude works on its own using native agents and dynamic workflows.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <DollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-success" />
            <span><span className="font-medium text-foreground">Variable cost.</span> Spend depends on what Claude decides to do — it can be higher than expected.</span>
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-9" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            className="h-9 gap-2 bg-emerald-500 text-white hover:bg-emerald-400 focus-visible:ring-emerald-400"
            onClick={onConfirm}
          >
            Continue
            <kbd className="hidden sm:inline-flex items-center rounded border border-white/30 bg-white/10 px-1 text-[9px] font-medium leading-4">⌘↵</kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
