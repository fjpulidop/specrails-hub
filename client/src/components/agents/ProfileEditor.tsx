import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Plus, GripVertical, X, ArrowUp, ArrowDown, Pin, Pencil } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { getApiBase } from '../../lib/api'
import { RoutingRuleDialog } from './RoutingRuleDialog'
import {
  BASELINE_REQUIRED_AGENTS,
  MODEL_ALIASES,
  type ModelAlias,
  type Profile,
  type ProfileAgent,
  type RoutingDefaultRule,
  type RoutingRule,
  type RoutingTagRule,
} from './types'

const ROUTING_TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

interface CatalogAgent {
  id: string
  kind: 'upstream' | 'custom'
}

export function ProfileEditor({
  profile,
  onChange,
  footer,
  onValidityChange,
  onSoftWarningsChange,
}: {
  profile: Profile
  onChange: (p: Profile) => void
  footer?: ReactNode
  onValidityChange?: (issues: string[]) => void
  onSoftWarningsChange?: (warnings: { agentsMissingRouting: string[] }) => void
}) {
  // Baseline agents (architect / developer / reviewer / merge-resolver) are
  // required and pinned in every profile — default and custom alike — because
  // the pipeline relies on all four. Routing rules stay fully flexible.
  const [catalog, setCatalog] = useState<CatalogAgent[]>([])
  const [pickingAgent, setPickingAgent] = useState(false)
  const [addRoutingPrompt, setAddRoutingPrompt] = useState(false)
  const [editRoutingIdx, setEditRoutingIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${getApiBase()}/profiles/catalog`)
      .then((r) => (r.ok ? (r.json() as Promise<{ agents: CatalogAgent[] }>) : { agents: [] }))
      .then((data) => {
        if (!cancelled) setCatalog(data.agents)
      })
      .catch(() => {
        if (!cancelled) setCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = (mutate: (draft: Profile) => void) => {
    const draft = JSON.parse(JSON.stringify(profile)) as Profile
    mutate(draft)
    onChange(draft)
  }

  const selectedIds = new Set(profile.agents.map((a) => a.id))
  const availableToAdd = catalog.filter((c) => !selectedIds.has(c.id))

  // ── Live validation (structural checks beyond the JSON schema) ─────────────
  const validationIssues: string[] = useMemo(() => {
    const issues: string[] = []
    // Baseline is required on every profile — default and custom alike.
    for (const baseline of BASELINE_REQUIRED_AGENTS) {
      if (!profile.agents.some((a) => a.id === baseline)) {
        issues.push(`Missing required baseline agent: ${baseline}`)
      }
    }
    // Routing: at most one default rule, last if present.
    const defaults = profile.routing.filter((r) => 'default' in r && r.default === true)
    if (defaults.length > 1) {
      issues.push(`Routing may have at most one default rule (found ${defaults.length})`)
    }
    if (defaults.length === 1) {
      const last = profile.routing[profile.routing.length - 1]
      if (!('default' in last && last.default === true)) {
        issues.push('The default routing rule must be the last entry')
      }
    }
    for (const rule of profile.routing) {
      if (!profile.agents.some((a) => a.id === rule.agent)) {
        issues.push(`Routing references agent not in the chain: ${rule.agent}`)
      }
      if ('tags' in rule) {
        const invalidTags = rule.tags.filter((tag) => !ROUTING_TAG_PATTERN.test(tag))
        if (invalidTags.length > 0) {
          issues.push(
            `Routing rule ${rule.agent} has invalid tags: ${invalidTags.join(', ')} (use lowercase kebab-case)`,
          )
        }
      }
    }
    return issues
  }, [profile])

  // ── Soft warnings (non-blocking, surfaced at save-time) ─────────────────────
  // Only surface this when explicit routing exists. If routing is empty the
  // runtime falls back to the first developer-shaped agent in the chain.
  const agentsMissingRouting: string[] = useMemo(() => {
    if (profile.routing.length === 0) return []
    const routedIds = new Set(profile.routing.map((r) => r.agent))
    return profile.agents
      .filter((a) => !BASELINE_REQUIRED_AGENTS.has(a.id) && !routedIds.has(a.id))
      .map((a) => a.id)
  }, [profile])

  const hasDefaultRoutingRule = useMemo(
    () => profile.routing.some((r) => 'default' in r && r.default === true),
    [profile.routing],
  )

  useEffect(() => {
    if (onValidityChange) onValidityChange(validationIssues)
  }, [validationIssues, onValidityChange])

  useEffect(() => {
    if (onSoftWarningsChange) onSoftWarningsChange({ agentsMissingRouting })
  }, [agentsMissingRouting, onSoftWarningsChange])

  const addAgent = (id: string) => {
    update((d) => {
      // Insert before sr-merge-resolver if present so the merge row stays
      // pinned last without a manual reorder after every add.
      const row: ProfileAgent = { id, model: 'sonnet' }
      const mergeIdx = d.agents.findIndex((a) => a.id === 'sr-merge-resolver')
      if (mergeIdx >= 0) {
        d.agents.splice(mergeIdx, 0, row)
      } else {
        d.agents.push(row)
      }
    })
    setPickingAgent(false)
  }

  const removeAgent = (idx: number) => {
    const agent = profile.agents[idx]
    // Baseline agents (architect/developer/reviewer/merge-resolver) can't be
    // removed from any profile — the pipeline depends on all four.
    if (BASELINE_REQUIRED_AGENTS.has(agent.id)) return
    update((d) => {
      d.agents.splice(idx, 1)
      // Cascade: drop routing rules that target the removed agent.
      d.routing = d.routing.filter((r) => r.agent !== agent.id)
    })
  }

  const reorderAgents = (activeId: string, overId: string) => {
    if (activeId === overId) return
    const oldIndex = profile.agents.findIndex((a) => a.id === activeId)
    const newIndex = profile.agents.findIndex((a) => a.id === overId)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(profile.agents, oldIndex, newIndex)
    // Pins apply to every profile: architect starts the pipeline, merge runs last.
    const archIdx = reordered.findIndex((a) => a.id === 'sr-architect')
    if (archIdx > 0) {
      const [arch] = reordered.splice(archIdx, 1)
      reordered.unshift(arch)
    }
    const mergeIdx = reordered.findIndex((a) => a.id === 'sr-merge-resolver')
    if (mergeIdx >= 0 && mergeIdx !== reordered.length - 1) {
      const [merge] = reordered.splice(mergeIdx, 1)
      reordered.push(merge)
    }
    update((d) => {
      d.agents = reordered
    })
  }

  const sortableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    reorderAgents(String(active.id), String(over.id))
  }

  const setAgentModel = (idx: number, model: ModelAlias) => {
    update((d) => {
      d.agents[idx].model = model
    })
  }

  const addRoutingRule = (tags: string[], agent: string) => {
    update((d) => {
      const newRule: RoutingTagRule = { tags, agent }
      const defaultIdx = d.routing.findIndex((r) => 'default' in r && r.default === true)
      if (defaultIdx >= 0) {
        d.routing.splice(defaultIdx, 0, newRule)
      } else {
        d.routing.push(newRule)
      }
    })
    setAddRoutingPrompt(false)
  }

  const addDefaultRoutingRule = () => {
    update((d) => {
      if (d.routing.some((r) => 'default' in r && r.default === true)) return
      // Default rule is the pipeline's last-resort fallback — always sr-developer.
      if (!d.agents.some((a) => a.id === 'sr-developer')) return
      const newRule: RoutingDefaultRule = { default: true, agent: 'sr-developer' }
      d.routing.push(newRule)
    })
  }

  const isDefaultRule = (r: RoutingRule): boolean =>
    'default' in r && r.default === true

  const setRoutingRuleAgent = (idx: number, agent: string) => {
    update((d) => {
      const r = d.routing[idx]
      if (!r) return
      // Default rule is pinned to sr-developer — core fallback is not retargetable.
      if (isDefaultRule(r)) return
      r.agent = agent
    })
  }

  const updateTagRule = (idx: number, tags: string[], agent: string) => {
    update((d) => {
      const r = d.routing[idx]
      if (!r) return
      if (isDefaultRule(r)) return
      ;(r as RoutingTagRule).tags = tags
      r.agent = agent
    })
  }

  const removeRoutingRule = (idx: number) => {
    update((d) => {
      const r = d.routing[idx]
      if (!r) return
      if (isDefaultRule(r)) return
      d.routing.splice(idx, 1)
    })
  }

  const moveRoutingRule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= profile.routing.length) return
    const rule = profile.routing[idx]
    const targetRule = profile.routing[target]
    if (isDefaultRule(rule)) return
    if (isDefaultRule(targetRule)) return
    update((d) => {
      const [item] = d.routing.splice(idx, 1)
      d.routing.splice(target, 0, item)
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <RoutingRuleDialog
        open={addRoutingPrompt}
        mode="add"
        chainAgents={profile.agents.map((a) => a.id)}
        onConfirm={addRoutingRule}
        onCancel={() => setAddRoutingPrompt(false)}
      />
      <RoutingRuleDialog
        open={editRoutingIdx !== null}
        mode="edit"
        initial={
          editRoutingIdx !== null && profile.routing[editRoutingIdx] && !('default' in profile.routing[editRoutingIdx])
            ? {
                tags: (profile.routing[editRoutingIdx] as RoutingTagRule).tags,
                agent: profile.routing[editRoutingIdx].agent,
              }
            : undefined
        }
        chainAgents={profile.agents.map((a) => a.id)}
        onConfirm={(tags, agent) => {
          if (editRoutingIdx === null) return
          updateTagRule(editRoutingIdx, tags, agent)
          setEditRoutingIdx(null)
        }}
        onCancel={() => setEditRoutingIdx(null)}
      />
      {/* Live validation summary */}
      {validationIssues.length > 0 && (
        <div className="px-3 py-2 text-xs rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-500">
          <div className="font-medium mb-1">{validationIssues.length} validation {validationIssues.length === 1 ? 'issue' : 'issues'}</div>
          <ul className="list-disc list-inside space-y-0.5">
            {validationIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata */}
      <section className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
          <Input value={profile.name} disabled className="text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
          <Input
            value={profile.description ?? ''}
            onChange={(e) =>
              update((d) => {
                d.description = e.target.value
              })
            }
            className="text-sm"
            placeholder="What is this profile for?"
          />
        </div>
      </section>

      {/* Orchestrator */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Orchestrator
        </h2>
        <div className="flex items-center gap-3 p-3 rounded-md border border-border">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-foreground truncate">
              /specrails:implement · /specrails:batch-implement
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Top-level model for both commands. batch-implement delegates to implement
              per feature, so every rail it spawns inherits this profile's agent chain.
            </div>
          </div>
          <ModelSelect
            value={profile.orchestrator.model}
            onChange={(m) =>
              update((d) => {
                d.orchestrator.model = m
              })
            }
          />
        </div>
      </section>

      {/* Agent chain */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Agent chain ({profile.agents.length})
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPickingAgent((v) => !v)}
            disabled={availableToAdd.length === 0}
            title={availableToAdd.length === 0 ? 'All catalog agents are already in the chain' : 'Add an agent from the catalog'}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>

        {pickingAgent && (
          <div className="mb-2 p-2 rounded-md border border-border bg-muted/30">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] text-muted-foreground">
                Pick from catalog ({availableToAdd.length} available)
              </span>
              <button
                type="button"
                className="p-1 hover:bg-accent rounded"
                onClick={() => setPickingAgent(false)}
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {availableToAdd.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No more agents in the catalog. Add custom agents from the Agents Catalog tab.
              </div>
            ) : (
              <div className="space-y-0.5 max-h-64 overflow-auto">
                {availableToAdd.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addAgent(a.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left rounded hover:bg-accent transition-colors"
                  >
                    <span className="text-sm font-mono">{a.id}</span>
                    <span
                      className={
                        'text-[10px] px-1.5 py-0.5 rounded ' +
                        (a.kind === 'custom'
                          ? 'bg-purple-500/15 text-purple-400'
                          : 'bg-muted text-muted-foreground')
                      }
                    >
                      {a.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <DndContext sensors={sortableSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={profile.agents.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {profile.agents.map((agent, idx) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  canRemove={!BASELINE_REQUIRED_AGENTS.has(agent.id)}
                  onModel={(m) => setAgentModel(idx, m)}
                  onRemove={() => removeAgent(idx)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      {/* Routing */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Routing ({profile.routing.length})
          </h2>
          <div className="flex items-center gap-1">
            {!hasDefaultRoutingRule && (
              <Button
                size="sm"
                variant="ghost"
                onClick={addDefaultRoutingRule}
                disabled={profile.agents.length === 0}
                title={profile.agents.length === 0 ? 'Add at least one agent before creating routing rules' : undefined}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add default
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAddRoutingPrompt(true)}
              disabled={profile.agents.length === 0}
              title={profile.agents.length === 0 ? 'Add at least one agent before creating routing rules' : undefined}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add rule
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          First matching rule wins. Rules are editable and removable, and the default catch-all
          stays last when present. If you leave routing empty, the pipeline falls back to the
          first developer-shaped agent in the chain.
        </p>
        {agentsMissingRouting.length > 0 && (
          <div className="mb-2 px-3 py-2 text-xs rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-500">
            <div className="font-medium mb-1">Untargeted agents in the chain</div>
            <div>
              No routing rule points to: <span className="font-mono">{agentsMissingRouting.join(', ')}</span>.
              Add a tag rule or retarget the default rule if you want them to run.
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {profile.routing.map((rule, idx) => {
            const isDefault = 'default' in rule && rule.default === true
            return (
              <RoutingRow
                key={idx}
                rule={rule}
                ordinal={idx + 1}
                isLast={idx === profile.routing.length - 1}
                canMove={!isDefault}
                canRemove={!isDefault}
                canEdit={!isDefault}
                chainAgents={profile.agents.map((a) => a.id)}
                onAgentChange={(agent) => setRoutingRuleAgent(idx, agent)}
                onEdit={() => setEditRoutingIdx(idx)}
                onUp={() => moveRoutingRule(idx, -1)}
                onDown={() => moveRoutingRule(idx, 1)}
                onRemove={() => removeRoutingRule(idx)}
              />
            )
          })}
        </div>
      </section>

      {footer && <div className="pt-3 border-t border-border">{footer}</div>}
    </div>
  )
}

function AgentRow({
  agent,
  canRemove,
  onModel,
  onRemove,
}: {
  agent: ProfileAgent
  canRemove: boolean
  onModel: (m: ModelAlias) => void
  onRemove: () => void
}) {
  // Baseline is required + pinned on every profile. Architect first,
  // merge-resolver last.
  const isRequired = BASELINE_REQUIRED_AGENTS.has(agent.id)
  const pinnedFirst = agent.id === 'sr-architect'
  const pinnedLast = agent.id === 'sr-merge-resolver'
  // sr-merge-resolver and sr-architect stay draggable like the rest; the
  // ProfileEditor's reorder handler snaps them back to first/last slots
  // after any drop so the pipeline invariant is preserved at the data layer
  // without making the UI feel inconsistent.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border group hover:bg-accent/30 transition-colors bg-background"
    >
      <button
        type="button"
        className="flex-shrink-0 p-0.5 rounded text-muted-foreground cursor-grab active:cursor-grabbing hover:text-foreground"
        title="Drag to reorder"
        aria-label="Drag handle"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-sm font-mono flex-1 truncate">{agent.id}</span>
      {pinnedFirst && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary"
          title="Pinned to first position — pipeline always starts with sr-architect"
        >
          <Pin className="w-2.5 h-2.5 rotate-[135deg]" /> first
        </span>
      )}
      {pinnedLast && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary"
          title="Pinned to last position — merge phase always runs last"
        >
          <Pin className="w-2.5 h-2.5 rotate-45" /> last
        </span>
      )}
      {isRequired && !pinnedFirst && !pinnedLast && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          required
        </span>
      )}
      <ModelSelect value={agent.model ?? 'sonnet'} onChange={onModel} />
      <button
        type="button"
        className="p-1 hover:bg-red-500/20 text-red-400 rounded disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
        disabled={!canRemove}
        title={
          canRemove
            ? 'Remove'
            : 'Required baseline agent — the pipeline depends on this row'
        }
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function RoutingRow({
  rule,
  ordinal,
  isLast,
  canMove,
  canRemove,
  canEdit,
  chainAgents,
  onAgentChange,
  onEdit,
  onUp,
  onDown,
  onRemove,
}: {
  rule: RoutingRule
  ordinal: number
  isLast: boolean
  canMove: boolean
  canRemove: boolean
  canEdit: boolean
  chainAgents: string[]
  onAgentChange: (agent: string) => void
  onEdit: () => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  const isDefault = 'default' in rule && rule.default === true
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border group hover:bg-accent/30 transition-colors">
      <span className="text-[10px] font-mono text-muted-foreground w-5 text-center flex-shrink-0">
        {ordinal}.
      </span>
      {isDefault ? (
        <span className="text-xs text-muted-foreground flex-1">everything else</span>
      ) : (
        <span className="text-xs flex-1 flex gap-1 flex-wrap items-center">
          {(rule as RoutingTagRule).tags.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
              {t}
            </span>
          ))}
        </span>
      )}
      <span className="text-xs text-muted-foreground">→</span>
      {isDefault ? (
        <span
          className="h-7 max-w-[15rem] px-2 text-xs font-mono rounded border border-border bg-muted/40 text-muted-foreground inline-flex items-center"
          aria-label="Default routing target (core, read-only)"
          title="Core fallback — not editable"
        >
          {rule.agent}
        </span>
      ) : (
        <select
          value={rule.agent}
          onChange={(e) => onAgentChange(e.target.value)}
          aria-label={`Routing target for rule ${ordinal}`}
          className="h-7 max-w-[15rem] px-2 text-xs font-mono rounded border border-border bg-background"
        >
          {chainAgents.map((agentId) => (
            <option key={agentId} value={agentId}>
              {agentId}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {canEdit && (
          <button
            type="button"
            className="p-1 hover:bg-accent rounded"
            onClick={onEdit}
            title="Edit rule"
            aria-label={`Edit rule ${ordinal}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {canMove && !isLast && (
          <button type="button" className="p-1 hover:bg-accent rounded" onClick={onDown} title="Move down">
            <ArrowDown className="w-3 h-3" />
          </button>
        )}
        {canMove && ordinal > 1 && (
          <button type="button" className="p-1 hover:bg-accent rounded" onClick={onUp} title="Move up">
            <ArrowUp className="w-3 h-3" />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            className="p-1 hover:bg-red-500/20 text-red-400 rounded"
            onClick={onRemove}
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {isDefault && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          title="Core fallback — the pipeline's last-resort rule, pinned to sr-developer"
        >
          core · default
        </span>
      )}
    </div>
  )
}

function ModelSelect({
  value,
  onChange,
}: {
  value: ModelAlias
  onChange: (m: ModelAlias) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ModelAlias)}
      className="h-7 px-2 text-xs rounded border border-border bg-background"
    >
      {MODEL_ALIASES.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  )
}
