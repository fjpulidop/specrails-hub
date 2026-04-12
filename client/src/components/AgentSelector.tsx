import { Check, Lock } from 'lucide-react'
import { cn } from '../lib/utils'

// ─── Agent definitions (mirrors specrails-core tui-installer.mjs) ────────────

export interface AgentDef {
  id: string
  name: string
  description: string
  category: string
}

export const ALL_AGENTS: AgentDef[] = [
  // Architecture
  { id: 'sr-architect', name: 'Architect', description: 'Architecture design, change specs, implementation planning', category: 'Architecture' },
  // Development
  { id: 'sr-developer', name: 'Developer', description: 'Full-stack implementation across all layers', category: 'Development' },
  { id: 'sr-frontend-developer', name: 'Frontend Dev', description: 'Frontend implementation (React, Vue, Angular, etc.)', category: 'Development' },
  { id: 'sr-backend-developer', name: 'Backend Dev', description: 'Backend specialization (APIs, databases, services)', category: 'Development' },
  // Review
  { id: 'sr-reviewer', name: 'Reviewer', description: 'General code review — the final quality gate', category: 'Review' },
  { id: 'sr-frontend-reviewer', name: 'Frontend Reviewer', description: 'Frontend review (UI, accessibility, performance)', category: 'Review' },
  { id: 'sr-backend-reviewer', name: 'Backend Reviewer', description: 'Backend review (APIs, security, scalability)', category: 'Review' },
  { id: 'sr-security-reviewer', name: 'Security Reviewer', description: 'Security analysis — OWASP, vulnerabilities, hardening', category: 'Review' },
  { id: 'sr-performance-reviewer', name: 'Perf Reviewer', description: 'Performance analysis — profiling, bottlenecks, optimization', category: 'Review' },
  // Product
  { id: 'sr-product-manager', name: 'Product Manager', description: 'Product discovery, VPC personas, backlog management', category: 'Product' },
  { id: 'sr-product-analyst', name: 'Product Analyst', description: 'Backlog analysis, spec gap analysis, reporting', category: 'Product' },
  // Utilities
  { id: 'sr-test-writer', name: 'Test Writer', description: 'Comprehensive test generation (unit, integration, E2E)', category: 'Utilities' },
  { id: 'sr-doc-sync', name: 'Doc Sync', description: 'Documentation sync — keeps docs aligned with code', category: 'Utilities' },
  { id: 'sr-merge-resolver', name: 'Merge Resolver', description: 'Merge conflict resolution with context awareness', category: 'Utilities' },
]

// Core agents cannot be deselected — the implementation pipeline depends on them
export const CORE_AGENTS = new Set([
  'sr-architect',
  'sr-developer',
  'sr-reviewer',
  'sr-merge-resolver',
])

// Default selection: core agents + test-writer + product-manager
export const DEFAULT_SELECTED = new Set([
  ...CORE_AGENTS,
  'sr-test-writer',
  'sr-product-manager',
])

export const AGENT_CATEGORIES = ['Architecture', 'Development', 'Review', 'Product', 'Utilities'] as const

const CATEGORY_LABELS: Record<string, string> = {
  Architecture: 'Architecture',
  Development: 'Development',
  Review: 'Review',
  Product: 'Product',
  Utilities: 'Utilities',
}

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: 'text-dracula-green',
  Development: 'text-dracula-purple',
  Review: 'text-dracula-cyan',
  Product: 'text-dracula-pink',
  Utilities: 'text-dracula-orange',
}

// ─── AgentSelector ────────────────────────────────────────────────────────────

interface AgentSelectorProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function AgentSelector({ selected, onChange }: AgentSelectorProps) {
  const selectedSet = new Set(selected)

  function toggle(agentId: string) {
    if (CORE_AGENTS.has(agentId)) return // core agents cannot be toggled
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
    const toggleable = categoryAgents.filter((id) => !CORE_AGENTS.has(id))
    if (toggleable.length === 0) return // all agents in this category are core
    const allSelected = toggleable.every((id) => selectedSet.has(id))
    const next = new Set(selectedSet)
    if (allSelected) {
      toggleable.forEach((id) => next.delete(id))
    } else {
      toggleable.forEach((id) => next.add(id))
    }
    onChange(Array.from(next))
  }

  function selectAll() {
    onChange(ALL_AGENTS.map((a) => a.id))
  }

  function selectNone() {
    onChange([...CORE_AGENTS]) // core agents always stay selected
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
                  const isCore = CORE_AGENTS.has(agent.id)
                  const isSelected = isCore || selectedSet.has(agent.id)
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggle(agent.id)}
                      disabled={isCore}
                      className={cn(
                        'flex items-start gap-2.5 w-full text-left rounded-md px-2 py-1.5 transition-colors',
                        isCore
                          ? 'bg-dracula-purple/10 cursor-default'
                          : isSelected
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
                          {isCore && (
                            <span className="flex items-center gap-0.5 text-[9px] text-dracula-orange/80">
                              <Lock className="w-2.5 h-2.5" />
                              core
                            </span>
                          )}
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
