export type SpecProvider = 'claude' | 'codex'

export interface SpecModelOption {
  value: string
  label: string
}

export const CLAUDE_MODELS: SpecModelOption[] = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus', label: 'Claude Opus' },
  { value: 'haiku', label: 'Claude Haiku' },
]

export const CODEX_MODELS: SpecModelOption[] = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
]

export const PROVIDER_DEFAULT_MODEL: Record<SpecProvider, string> = {
  claude: 'sonnet',
  codex: 'gpt-5.4-mini',
}

export function getModelsForProvider(provider: SpecProvider): SpecModelOption[] {
  return provider === 'codex' ? CODEX_MODELS : CLAUDE_MODELS
}

export function isValidModelForProvider(model: unknown, provider: SpecProvider): model is string {
  if (typeof model !== 'string' || model.length === 0) return false
  return getModelsForProvider(provider).some((m) => m.value === model)
}

export function getProviderDefault(provider: SpecProvider): string {
  return PROVIDER_DEFAULT_MODEL[provider]
}
