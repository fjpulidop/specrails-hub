import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Plus, GripVertical, X, ArrowUp, ArrowDown } from 'lucide-react'
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

interface CatalogAgent {
  id: string
  kind: 'upstream' | 'custom'
}

export function ProfileEditor({
  profile,
  onChange,
  footer,
  onValidityChange,
}: {
  profile: Profile
  onChange: (p: Profile) => void
  footer?: ReactNode
  onValidityChange?: (issues: string[]) => void
}) {
  const [catalog, setCatalog] = useState<CatalogAgent[]>([])
  const [pickingAgent, setPickingAgent] = useState(false)
  const [addRoutingPrompt, setAddRoutingPrompt] = useState(false)

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
    for (const baseline of BASELINE_REQUIRED_AGENTS) {
      if (!profile.agents.some((a) => a.id === baseline)) {
        issues.push(`Missing required baseline agent: ${baseline}`)
      }
    }
    if (profile.agents.length === 0) {
      issues.push('Agent chain is empty')
    }
    const defaults = profile.routing.filter((r) => 'default' in r && r.default === true)
    if (defaults.length !== 1) {
      issues.push(`Routing needs exactly one default rule (found ${defaults.length})`)
    }
    const last = profile.routing[profile.routing.length - 1]
    if (last && !('default' in last && last.default === true)) {
      issues.push('The default routing rule must be the last entry')
    }
    for (const rule of profile.routing) {
      if (!profile.agents.some((a) => a.id === rule.agent)) {
        issues.push(`Routing references agent not in the chain: ${rule.agent}`)
      }
    }
    return issues
  }, [profile])

  useEffect(() => {
    if (onValidityChange) onValidityChange(validationIssues)
  }, [validationIssues, onValidityChange])

  const addAgent = (id: string) => {
    update((d) => {
      d.agents.push({ id, model: 'sonnet' })
    })
    setPickingAgent(false)
  }

  const removeAgent = (idx: number) => {
    const agent = profile.agents[idx]
    if (BASELINE_REQUIRED_AGENTS.has(agent.id)) return
    update((d) => {
      d.agents.splice(idx, 1)
    })
  }

  const moveAgent = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= profile.agents.length) return
    update((d) => {
      const [item] = d.agents.splice(idx, 1)
      d.agents.splice(target, 0, item)
    })
  }

  const setAgentModel = (idx: number, model: ModelAlias) => {
    update((d) => {
      d.agents[idx].model = model
    })
  }

  const addRoutingRule = (tags: string[], agent: string) => {
    update((d) => {
      const defaultRule = d.routing.pop() as RoutingDefaultRule
      const newRule: RoutingTagRule = { tags, agent }
      d.routing.push(newRule)
      d.routing.push(defaultRule)
    })
    setAddRoutingPrompt(false)
  }

  const removeRoutingRule = (idx: number) => {
    const rule = profile.routing[idx]
    if ('default' in rule && rule.default) return // can't remove terminal default
    update((d) => {
      d.routing.splice(idx, 1)
    })
  }

  const moveRoutingRule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= profile.routing.length - 1) return // can't move past default
    const rule = profile.routing[idx]
    if ('default' in rule && rule.default) return // can't move default
    update((d) => {
      const [item] = d.routing.splice(idx, 1)
      d.routing.splice(target, 0, item)
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <RoutingRuleDialog
        open={addRoutingPrompt}
        chainAgents={profile.agents.map((a) => a.id)}
        onConfirm={addRoutingRule}
        onCancel={() => setAddRoutingPrompt(false)}
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

        <div className="space-y-1.5">
          {profile.agents.map((agent, idx) => (
            <AgentRow
              key={`${agent.id}-${idx}`}
              agent={agent}
              onModel={(m) => setAgentModel(idx, m)}
              onUp={() => moveAgent(idx, -1)}
              onDown={() => moveAgent(idx, 1)}
              onRemove={() => removeAgent(idx)}
            />
          ))}
        </div>
      </section>

      {/* Routing */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Routing ({profile.routing.length})
          </h2>
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
        <p className="text-[11px] text-muted-foreground mb-2">
          First matching rule wins. The <code className="text-foreground">default</code> rule catches
          unmatched tasks and must stay at the end.
        </p>
        <div className="space-y-1.5">
          {profile.routing.map((rule, idx) => (
            <RoutingRow
              key={idx}
              rule={rule}
              ordinal={idx + 1}
              isLast={idx === profile.routing.length - 1}
              onUp={() => moveRoutingRule(idx, -1)}
              onDown={() => moveRoutingRule(idx, 1)}
              onRemove={() => removeRoutingRule(idx)}
            />
          ))}
        </div>
      </section>

      {footer && <div className="pt-3 border-t border-border">{footer}</div>}
    </div>
  )
}

function AgentRow({
  agent,
  onModel,
  onUp,
  onDown,
  onRemove,
}: {
  agent: ProfileAgent
  onModel: (m: ModelAlias) => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  const isRequired = BASELINE_REQUIRED_AGENTS.has(agent.id)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border group hover:bg-accent/30 transition-colors">
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-mono flex-1 truncate">{agent.id}</span>
      {isRequired && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          required
        </span>
      )}
      <ModelSelect value={agent.model ?? 'sonnet'} onChange={onModel} />
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" className="p-1 hover:bg-accent rounded" onClick={onUp} title="Move up">
          <ArrowUp className="w-3 h-3" />
        </button>
        <button type="button" className="p-1 hover:bg-accent rounded" onClick={onDown} title="Move down">
          <ArrowDown className="w-3 h-3" />
        </button>
        <button
          type="button"
          className="p-1 hover:bg-red-500/20 text-red-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={onRemove}
          disabled={isRequired}
          title={isRequired ? 'Required baseline agent' : 'Remove'}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function RoutingRow({
  rule,
  ordinal,
  isLast,
  onUp,
  onDown,
  onRemove,
}: {
  rule: RoutingRule
  ordinal: number
  isLast: boolean
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
      <span className="text-sm font-mono">{rule.agent}</span>
      {!isLast && !isDefault && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" className="p-1 hover:bg-accent rounded" onClick={onUp}>
            <ArrowUp className="w-3 h-3" />
          </button>
          <button type="button" className="p-1 hover:bg-accent rounded" onClick={onDown}>
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="p-1 hover:bg-red-500/20 text-red-400 rounded"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {isDefault && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          default
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
