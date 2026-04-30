import { useReducer, useState } from 'react'
import { toast } from 'sonner'
import { getApiBase } from '../lib/api'
import type { IssueItem } from '../types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { IssuePickerStep, BatchFreeFormStep } from './IssuePickerStep'
import { cn } from '../lib/utils'
import {
  ProfilePicker,
  type ProfileSelection,
  selectionToSpawnPayload,
  useDefaultProfileSelection,
  useProjectProfiles,
} from './agents/ProfilePicker'

type WizardPath = 'from-issues' | 'free-form' | null

interface BatchWizardState {
  path: WizardPath
  selectedIssues: IssueItem[]
  freeFormItems: Array<{ title: string; description: string }>
}

type BatchWizardAction =
  | { type: 'SELECT_PATH'; path: WizardPath }
  | { type: 'SET_ISSUES'; issues: IssueItem[] }
  | { type: 'SET_ITEMS'; items: Array<{ title: string; description: string }> }
  | { type: 'RESET' }

function batchWizardReducer(state: BatchWizardState, action: BatchWizardAction): BatchWizardState {
  switch (action.type) {
    case 'SELECT_PATH':
      return { ...state, path: action.path }
    case 'SET_ISSUES':
      return { ...state, selectedIssues: action.issues }
    case 'SET_ITEMS':
      return { ...state, freeFormItems: action.items }
    case 'RESET':
      return { path: null, selectedIssues: [], freeFormItems: [{ title: '', description: '' }] }
    default:
      return state
  }
}

interface BatchImplementWizardProps {
  open: boolean
  onClose: () => void
}

export function BatchImplementWizard({ open, onClose }: BatchImplementWizardProps) {
  const [state, dispatch] = useReducer(batchWizardReducer, {
    path: null,
    selectedIssues: [],
    freeFormItems: [{ title: '', description: '' }],
  })
  const [profileSelection, setProfileSelection] = useDefaultProfileSelection()
  const availableProfiles = useProjectProfiles()
  // Per-issue profile overrides (absent = inherit batch default)
  const [perIssueProfile, setPerIssueProfile] = useState<Record<number, ProfileSelection>>({})

  function handleClose() {
    dispatch({ type: 'RESET' })
    onClose()
  }

  async function handleSubmit() {
    let command: string

    if (state.path === 'from-issues') {
      if (state.selectedIssues.length === 0) {
        toast.error('Please select at least one issue')
        return
      }
      const issueArgs = state.selectedIssues.map((issue) => {
        let text = `#${issue.number}: ${issue.title}`
        if (issue.body?.trim()) text += `\n\n${issue.body.trim()}`
        return text
      }).join('\n\n---\n\n')
      // Build --profiles "ref=profile,..." for issues that differ from the batch default
      const overrides: string[] = []
      for (const issue of state.selectedIssues) {
        const override = perIssueProfile[issue.number]
        if (!override) continue
        if (override.kind === 'legacy' && profileSelection.kind === 'legacy') continue
        if (override.kind === 'profile' && profileSelection.kind === 'profile' && override.name === profileSelection.name) continue
        const value = override.kind === 'legacy' ? '__legacy__' : override.name
        overrides.push(`#${issue.number}=${value}`)
      }
      const profilesFlag = overrides.length > 0 ? ` --profiles "${overrides.join(',')}"` : ''
      command = `/specrails:batch-implement ${issueArgs}${profilesFlag}`
    } else {
      const validItems = state.freeFormItems.filter((item) => item.title.trim())
      if (validItems.length === 0) {
        toast.error('Please enter at least one feature title')
        return
      }
      const featureList = validItems
        .map((item) => `- ${item.title.trim()}${item.description.trim() ? `: ${item.description.trim()}` : ''}`)
        .join('\n')
      command = `/specrails:batch-implement\n${featureList}`
    }

    try {
      const res = await fetch(`${getApiBase()}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, ...selectionToSpawnPayload(profileSelection) }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to queue job')
      toast.success('Batch job queued', {
        description: `${state.path === 'from-issues' ? state.selectedIssues.length : state.freeFormItems.filter((i) => i.title.trim()).length} features`,
      })
      handleClose()
    } catch (err) {
      toast.error('Failed to queue job', { description: (err as Error).message })
    }
  }

  const canSubmit = state.path === 'from-issues'
    ? state.selectedIssues.length > 0
    : state.freeFormItems.some((item) => item.title.trim())

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl glass-card">
        <DialogHeader>
          <DialogTitle>Batch Implement</DialogTitle>
        </DialogHeader>

        {/* Path selection */}
        {!state.path && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <BatchPathCard
              icon="🎯"
              title="From Issues"
              description="Select multiple issues from your tracker"
              onClick={() => dispatch({ type: 'SELECT_PATH', path: 'from-issues' })}
            />
            <BatchPathCard
              icon="📝"
              title="Free Form"
              description="Describe multiple features"
              onClick={() => dispatch({ type: 'SELECT_PATH', path: 'free-form' })}
            />
          </div>
        )}

        {/* Issue picker (multi-select) */}
        {state.path === 'from-issues' && (
          <>
            <IssuePickerStep
              multiSelect={true}
              selectedIssues={state.selectedIssues}
              onSelectionChange={(issues) => dispatch({ type: 'SET_ISSUES', issues })}
            />
            {state.selectedIssues.length > 1 && availableProfiles.length > 0 && (
              <div className="mt-3 rounded-md border border-border bg-muted/20">
                <div className="px-3 py-2 border-b border-border/60 text-[11px] text-muted-foreground uppercase tracking-wide">
                  Per-feature profile override ({state.selectedIssues.length})
                </div>
                <div className="p-2 max-h-40 overflow-auto space-y-1">
                  {state.selectedIssues.map((issue) => {
                    const override = perIssueProfile[issue.number]
                    const effective = override ?? profileSelection
                    const value = effective.kind === 'legacy' ? '__legacy__' : effective.name
                    const isInherited = !override
                    return (
                      <div key={issue.number} className="flex items-center gap-2 text-xs px-1">
                        <span className="text-muted-foreground font-mono w-12">#{issue.number}</span>
                        <span className="flex-1 truncate text-foreground/80">{issue.title}</span>
                        <select
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value
                            setPerIssueProfile((prev) => ({
                              ...prev,
                              [issue.number]: v === '__legacy__'
                                ? { kind: 'legacy' }
                                : { kind: 'profile', name: v },
                            }))
                          }}
                          className="h-6 text-[11px] rounded border border-border bg-background px-1"
                        >
                          {availableProfiles.map((p) => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                          <option value="__legacy__">No profile</option>
                        </select>
                        {!isInherited && (
                          <button
                            type="button"
                            onClick={() => {
                              setPerIssueProfile((prev) => {
                                const next = { ...prev }
                                delete next[issue.number]
                                return next
                              })
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            title="Inherit batch default"
                          >
                            reset
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground">
                  Unchanged rows use the batch-level selection below. Set distinct profiles only when you need a rail to run differently.
                </div>
              </div>
            )}
          </>
        )}

        {/* Batch free form */}
        {state.path === 'free-form' && (
          <BatchFreeFormStep
            items={state.freeFormItems}
            onItemsChange={(items) => dispatch({ type: 'SET_ITEMS', items })}
          />
        )}

        {state.path && (
          <DialogFooter className="gap-2 items-center justify-between">
            <div className="flex-1">
              <ProfilePicker value={profileSelection} onChange={setProfileSelection} />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: 'SELECT_PATH', path: null })}
              >
                Back
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
                Queue Batch Job
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BatchPathCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg border border-border/30 text-left glass-card',
        'hover:border-accent-primary/40 hover:bg-surface/30 transition-all active:scale-[0.98]'
      )}
    >
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  )
}
