import { cn } from '../lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { AgentDef } from './AgentSelector'

// ─── Model definitions ────────────────────────────────────────────────────────

export type ModelPreset = 'balanced' | 'budget' | 'max'

export interface ModelOverrides {
  [agentId: string]: string
}

export const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
]

export const CODEX_MODELS = [
  { value: 'codex-mini-latest', label: 'Codex Mini' },
  { value: 'o4-mini', label: 'o4-mini' },
  { value: 'o3', label: 'o3' },
]

// Preset → default model per provider (matches specrails-core MODEL_PRESETS)
export const PRESET_DEFAULTS: Record<ModelPreset, { claude: string; codex: string }> = {
  balanced: { claude: 'claude-sonnet-4-6', codex: 'codex-mini-latest' },
  budget: { claude: 'claude-haiku-4-5-20251001', codex: 'codex-mini-latest' },
  max: { claude: 'claude-sonnet-4-6', codex: 'codex-mini-latest' },
}

// "max" preset: Opus for architect + PM, Sonnet for rest (matches specrails-core)
const MAX_OVERRIDES: Record<string, { claude: string; codex: string }> = {
  'sr-architect': { claude: 'claude-opus-4-6', codex: 'o3' },
  'sr-product-manager': { claude: 'claude-opus-4-6', codex: 'o3' },
}

export function getDefaultModel(
  agentId: string,
  preset: ModelPreset,
  provider: 'claude' | 'codex'
): string {
  if (preset === 'max' && MAX_OVERRIDES[agentId]) {
    return MAX_OVERRIDES[agentId][provider]
  }
  return PRESET_DEFAULTS[preset][provider]
}

// ─── ModelSelector ────────────────────────────────────────────────────────────

interface ModelSelectorProps {
  agents: AgentDef[]
  provider: 'claude' | 'codex'
  preset: ModelPreset
  overrides: ModelOverrides
  onPresetChange: (preset: ModelPreset) => void
  onOverrideChange: (agentId: string, model: string) => void
}

const PRESET_LABELS: Record<ModelPreset, { label: string; description: string }> = {
  balanced: { label: 'Balanced', description: 'Sonnet for all agents (recommended)' },
  budget: { label: 'Budget', description: 'Haiku for all agents — 3x cheaper, faster' },
  max: { label: 'Max', description: 'Opus for architect + PM, Sonnet for rest' },
}

export function ModelSelector({
  agents,
  provider,
  preset,
  overrides,
  onPresetChange,
  onOverrideChange,
}: ModelSelectorProps) {
  const models = provider === 'claude' ? CLAUDE_MODELS : CODEX_MODELS

  function getEffectiveModel(agentId: string): string {
    return overrides[agentId] ?? getDefaultModel(agentId, preset, provider)
  }

  function isOverridden(agentId: string): boolean {
    return agentId in overrides
  }

  function clearOverride(agentId: string) {
    onOverrideChange(agentId, '')
  }

  return (
    <div className="space-y-4">
      {/* Preset selector */}
      <div>
        <p className="text-xs font-medium mb-2">Model preset</p>
        <div className="grid grid-cols-3 gap-2">
          {(['balanced', 'budget', 'max'] as ModelPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => onPresetChange(p)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-left transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                preset === p
                  ? 'border-dracula-purple bg-dracula-purple/10'
                  : 'border-border/30 hover:border-border/60'
              )}
            >
              <span className={cn(
                'text-xs font-semibold',
                preset === p ? 'text-dracula-purple' : 'text-foreground/80'
              )}>
                {PRESET_LABELS[p].label}
              </span>
              <span className="text-[9px] text-muted-foreground text-center leading-tight">
                {PRESET_LABELS[p].description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Per-agent overrides */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium">Per-agent model overrides</p>
          <span className="text-[10px] text-muted-foreground">
            {Object.keys(overrides).length} overridden
          </span>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {agents.map((agent) => {
            const effectiveModel = getEffectiveModel(agent.id)
            const overridden = isOverridden(agent.id)

            return (
              <div
                key={agent.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/20"
              >
                <div className="flex-1 min-w-0">
                  <span className={cn('text-xs', overridden ? 'text-foreground' : 'text-foreground/70')}>
                    {agent.name}
                  </span>
                  {overridden && (
                    <span className="ml-1 text-[9px] text-dracula-orange">custom</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    value={effectiveModel}
                    onValueChange={(val) => onOverrideChange(agent.id, val)}
                  >
                    <SelectTrigger className="h-6 w-44 text-[10px] px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {overridden && (
                    <button
                      onClick={() => clearOverride(agent.id)}
                      className="text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1"
                      title="Reset to preset default"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
