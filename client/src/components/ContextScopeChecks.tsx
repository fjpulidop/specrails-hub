import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { tierFromScope, type ContextScope, type SpecMode } from '../types/context-scope'

interface Props {
  scope: ContextScope
  mode: SpecMode
  onChange: (next: ContextScope) => void
  /** Default collapsed state — defaults to true (collapsed). */
  defaultOpen?: boolean
  label?: string
  showSummary?: boolean
}

interface CheckRowProps {
  id: string
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  tooltip?: string
  onChange: (v: boolean) => void
}

function CheckRow({ id, label, hint, checked, disabled, tooltip, onChange }: CheckRowProps) {
  return (
    <div
      title={tooltip}
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border/40 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-card/60'
      }`}
    >
      <label htmlFor={id} className="flex flex-col gap-0.5 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function ContextScopeChecks({
  scope,
  mode,
  onChange,
  defaultOpen = false,
  label = 'Context scope',
  showSummary = true,
}: Props) {
  const mcpDisabled = mode === 'quick'
  const userMcpDisabled = mode === 'quick'
  const [open, setOpen] = useState(defaultOpen)
  const activeScopes = [
    scope.specrails && 'specrails',
    scope.openspec && 'openspec',
    scope.full && 'codebase',
    scope.mcp && !mcpDisabled && 'mcp',
    scope.userMcp && !userMcpDisabled && 'my-mcp',
    scope.contractRefine && 'contract',
  ].filter(Boolean) as string[]
  const summary = activeScopes.length === 0 ? 'minimal' : activeScopes.join(', ')
  const tier = tierFromScope(scope)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ctx-scope-body"
        data-testid="context-scope-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {label}
        </span>
        {!open && showSummary ? (
          <span className="text-[10px] normal-case tracking-normal text-muted-foreground/80">
            {summary} · {tier}
          </span>
        ) : null}
      </button>
      {open ? (
      <div id="ctx-scope-body" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CheckRow
          id="ctx-specrails"
          label="specrails tickets"
          hint=".specrails/local-tickets.json"
          checked={scope.specrails}
          onChange={(v) => onChange({ ...scope, specrails: v })}
        />
        <CheckRow
          id="ctx-openspec"
          label="openspec specs"
          hint="openspec/specs/*"
          checked={scope.openspec}
          onChange={(v) => onChange({ ...scope, openspec: v })}
        />
        <CheckRow
          id="ctx-full"
          label="Full codebase"
          hint="Read · Grep · Glob"
          checked={scope.full}
          onChange={(v) => onChange({ ...scope, full: v })}
        />
        <CheckRow
          id="ctx-mcp"
          label="Project MCPs"
          hint=".mcp.json servers"
          checked={scope.mcp && !mcpDisabled}
          disabled={mcpDisabled}
          tooltip={mcpDisabled ? 'Explore mode only' : undefined}
          onChange={(v) => onChange({ ...scope, mcp: v })}
        />
        <CheckRow
          id="ctx-user-mcp"
          label="My approved MCPs"
          hint="~/.claude · ~/.codex servers"
          checked={!!scope.userMcp && !userMcpDisabled}
          disabled={userMcpDisabled}
          tooltip={userMcpDisabled ? 'Explore mode only' : 'Your locally-approved MCP servers (claude mcp add / codex mcp add)'}
          onChange={(v) => onChange({ ...scope, userMcp: v })}
        />
        <CheckRow
          id="ctx-contract-refine"
          label="Enrich with Contract Layer"
          hint="post-commit refinement · enables SMASH"
          checked={scope.contractRefine}
          onChange={(v) => onChange({ ...scope, contractRefine: v })}
        />
      </div>
      ) : null}
    </div>
  )
}
