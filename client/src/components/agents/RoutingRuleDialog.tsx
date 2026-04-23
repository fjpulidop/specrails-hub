import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface Props {
  open: boolean
  /** Agent ids that belong to this profile's chain — the only valid routing targets. */
  chainAgents: string[]
  onConfirm: (tags: string[], agent: string) => void
  onCancel: () => void
}

/**
 * Dialog to add a tag-matched routing rule. Tags are comma-separated; target
 * agent is constrained to the profile's chain via a native dropdown (avoids
 * the "route to agent not in chain" footgun the old prompt flow had).
 */
export function RoutingRuleDialog({ open, chainAgents, onConfirm, onCancel }: Props) {
  const [tags, setTags] = useState('')
  const [agent, setAgent] = useState(chainAgents[0] ?? '')

  useEffect(() => {
    if (open) {
      setTags('')
      setAgent(chainAgents[0] ?? '')
    }
  }, [open, chainAgents])

  const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
  const canConfirm = parsedTags.length > 0 && chainAgents.includes(agent)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add routing rule</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tags
            </label>
            <Input
              autoFocus
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="frontend, ui"
              className="text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma-separated. Rule fires when any of these tags appears on a task.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Route to
            </label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full h-9 px-2 text-sm rounded-md border border-border bg-background"
            >
              {chainAgents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Only agents in this profile's chain can be routing targets.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(parsedTags, agent)}
            disabled={!canConfirm}
          >
            Add rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
