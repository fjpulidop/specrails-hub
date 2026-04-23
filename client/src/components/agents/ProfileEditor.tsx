import { ReactNode } from 'react'
import { Plus, GripVertical, X, ArrowUp, ArrowDown } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
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

export function ProfileEditor({
  profile,
  onChange,
  footer,
}: {
  profile: Profile
  onChange: (p: Profile) => void
  footer?: ReactNode
}) {
  const update = (mutate: (draft: Profile) => void) => {
    const draft = JSON.parse(JSON.stringify(profile)) as Profile
    mutate(draft)
    onChange(draft)
  }

  const addAgent = () => {
    const id = prompt('Agent id (e.g. sr-data-engineer or custom-pentester):')
    if (!id) return
    update((d) => {
      d.agents.push({ id: id.trim(), model: 'sonnet' })
    })
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

  const addRoutingRule = () => {
    const tags = prompt('Tags (comma-separated, e.g. frontend,ui):')
    if (!tags) return
    const agent = prompt('Route to agent id:', 'sr-developer')
    if (!agent) return
    update((d) => {
      const defaultRule = d.routing.pop() as RoutingDefaultRule
      const newRule: RoutingTagRule = {
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        agent: agent.trim(),
      }
      d.routing.push(newRule)
      d.routing.push(defaultRule)
    })
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
          <span className="text-sm font-mono text-foreground flex-1">implement.md</span>
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
          <Button size="sm" variant="ghost" onClick={addAgent}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
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
          <Button size="sm" variant="ghost" onClick={addRoutingRule}>
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
