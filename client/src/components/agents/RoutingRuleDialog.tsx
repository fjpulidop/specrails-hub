import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const ROUTING_TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

interface Props {
  open: boolean
  /** 'add' (default) opens a blank form; 'edit' pre-fills from `initial`. */
  mode?: 'add' | 'edit'
  /** Pre-fill values when `mode === 'edit'`. */
  initial?: { tags: string[]; agent: string }
  /** Agent ids that belong to this profile's chain — the only valid routing targets. */
  chainAgents: string[]
  onConfirm: (tags: string[], agent: string) => void
  onCancel: () => void
}

/**
 * Dialog to add or edit a tag-matched routing rule. Tags are comma-separated;
 * target agent is constrained to the profile's chain via a native dropdown
 * (avoids the "route to agent not in chain" footgun the old prompt flow had).
 */
export function RoutingRuleDialog({
  open,
  mode = 'add',
  initial,
  chainAgents,
  onConfirm,
  onCancel,
}: Props) {
  const [tags, setTags] = useState('')
  const [agent, setAgent] = useState(chainAgents[0] ?? '')

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setTags(initial.tags.join(', '))
      setAgent(chainAgents.includes(initial.agent) ? initial.agent : (chainAgents[0] ?? ''))
    } else {
      setTags('')
      setAgent(chainAgents[0] ?? '')
    }
  }, [open, mode, initial, chainAgents])

  const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
  const invalidTags = parsedTags.filter((tag) => !ROUTING_TAG_PATTERN.test(tag))
  const canConfirm =
    parsedTags.length > 0 &&
    invalidTags.length === 0 &&
    chainAgents.includes(agent)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit routing rule' : 'Add routing rule'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update the tags or target agent for this rule.'
              : 'Add a tag-matched routing rule using lowercase kebab-case tags.'}
          </DialogDescription>
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
              aria-label="Tags"
              className="text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma-separated. Use lowercase kebab-case like <code>frontend</code> or <code>api-design</code>.
            </p>
            {invalidTags.length > 0 && (
              <p className="text-[11px] text-red-400 mt-1">
                Invalid tag{invalidTags.length === 1 ? '' : 's'}: {invalidTags.join(', ')}.
                Tags must use lowercase letters, digits, and hyphens only.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Route to
            </label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              aria-label="Route to"
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
            {mode === 'edit' ? 'Save changes' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
