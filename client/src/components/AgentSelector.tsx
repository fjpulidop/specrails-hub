import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

// ─── Agent definitions ────────────────────────────────────────────────────────

export interface AgentDef {
  id: string
  name: string
  description: string
  category: string
}

export const ALL_AGENTS: AgentDef[] = [
  // Core Implementation
  { id: 'sr-architect', name: 'Architect', description: 'Architecture design & change specs', category: 'Core' },
  { id: 'sr-developer', name: 'Developer', description: 'Full-stack implementation', category: 'Core' },
  { id: 'sr-frontend-developer', name: 'Frontend Dev', description: 'React/TypeScript implementation', category: 'Core' },
  { id: 'sr-backend-developer', name: 'Backend Dev', description: 'Backend specialization', category: 'Core' },
  // Quality
  { id: 'sr-reviewer', name: 'Reviewer', description: 'General code review', category: 'Quality' },
  { id: 'sr-frontend-reviewer', name: 'Frontend Reviewer', description: 'Frontend review & accessibility', category: 'Quality' },
  { id: 'sr-backend-reviewer', name: 'Backend Reviewer', description: 'N+1 queries, DB indexes, connection pools', category: 'Quality' },
  { id: 'sr-security-reviewer', name: 'Security Reviewer', description: 'Security analysis & vulnerability scanning', category: 'Quality' },
  { id: 'sr-performance-reviewer', name: 'Perf Reviewer', description: 'Performance analysis & optimization', category: 'Quality' },
  // Testing
  { id: 'sr-test-writer', name: 'Test Writer', description: 'Comprehensive test generation', category: 'Testing' },
  // Product
  { id: 'sr-product-manager', name: 'Product Manager', description: 'Product discovery & personas', category: 'Product' },
  { id: 'sr-product-analyst', name: 'Product Analyst', description: 'Backlog analysis & prioritization', category: 'Product' },
  // Operations
  { id: 'sr-doc-sync', name: 'Doc Sync', description: 'Documentation synchronization', category: 'Ops' },
  { id: 'sr-merge-resolver', name: 'Merge Resolver', description: 'Merge conflict resolution', category: 'Ops' },
]

export const AGENT_CATEGORIES = ['Core', 'Quality', 'Testing', 'Product', 'Ops'] as const

const CATEGORY_LABELS: Record<string, string> = {
  Core: 'Core Implementation',
  Quality: 'Quality & Review',
  Testing: 'Testing',
  Product: 'Product',
  Ops: 'Operations',
}

const CATEGORY_COLORS: Record<string, string> = {
  Core: 'text-dracula-purple',
  Quality: 'text-dracula-green',
  Testing: 'text-dracula-cyan',
  Product: 'text-dracula-pink',
  Ops: 'text-dracula-orange',
}

// ─── AgentSelector ────────────────────────────────────────────────────────────

interface AgentSelectorProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function AgentSelector({ selected, onChange }: AgentSelectorProps) {
  const selectedSet = new Set(selected)

  function toggle(agentId: string) {
    const next = new Set(selectedSet)
    if (next.has(agentId)) {
      next.delete(agentId)
    } else {
      next.add(agentId)
    }
    onChange(Array.from(next))
  }

  function toggleCategory(category: string) {
    const categoryAgents = ALL_AGENTS.filter((a) => a.category === category).map((a) => a.id)
    const allSelected = categoryAgents.every((id) => selectedSet.has(id))
    const next = new Set(selectedSet)
    if (allSelected) {
      categoryAgents.forEach((id) => next.delete(id))
    } else {
      categoryAgents.forEach((id) => next.add(id))
    }
    onChange(Array.from(next))
  }

  function selectAll() {
    onChange(ALL_AGENTS.map((a) => a.id))
  }

  function selectNone() {
    onChange([])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {selected.length} / {ALL_AGENTS.length} agents selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-[10px] text-dracula-purple hover:underline"
          >
            Select all
          </button>
          <span className="text-[10px] text-muted-foreground">·</span>
          <button
            onClick={selectNone}
            className="text-[10px] text-muted-foreground hover:underline"
          >
            None
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {AGENT_CATEGORIES.map((category) => {
          const agents = ALL_AGENTS.filter((a) => a.category === category)
          const allSelected = agents.every((a) => selectedSet.has(a.id))
          const someSelected = agents.some((a) => selectedSet.has(a.id))

          return (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="flex items-center gap-2 mb-2 w-full text-left group"
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                  allSelected
                    ? 'bg-dracula-purple border-dracula-purple'
                    : someSelected
                    ? 'bg-dracula-purple/40 border-dracula-purple/60'
                    : 'border-border/60 group-hover:border-dracula-purple/40'
                )}>
                  {(allSelected || someSelected) && (
                    <Check className={cn('w-2.5 h-2.5', allSelected ? 'text-background' : 'text-dracula-purple')} />
                  )}
                </div>
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider', CATEGORY_COLORS[category])}>
                  {CATEGORY_LABELS[category]}
                </span>
              </button>

              {/* Agent rows */}
              <div className="space-y-1 pl-1">
                {agents.map((agent) => {
                  const isSelected = selectedSet.has(agent.id)
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggle(agent.id)}
                      className={cn(
                        'flex items-start gap-2.5 w-full text-left rounded-md px-2 py-1.5 transition-colors',
                        isSelected
                          ? 'bg-dracula-purple/10 hover:bg-dracula-purple/15'
                          : 'hover:bg-muted/30'
                      )}
                    >
                      <div className={cn(
                        'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                        isSelected
                          ? 'bg-dracula-purple border-dracula-purple'
                          : 'border-border/60 hover:border-dracula-purple/40'
                      )}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-background" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-medium', isSelected ? 'text-foreground' : 'text-foreground/80')}>
                            {agent.name}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 font-mono truncate">
                            {agent.id}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          {agent.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
