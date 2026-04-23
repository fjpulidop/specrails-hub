// Shared TypeScript types for the Agents section client code.
// Mirror of server/profile-manager.ts types — kept narrow to avoid a shared package.

export type ModelAlias = 'sonnet' | 'opus' | 'haiku'

export interface ProfileAgent {
  id: string
  model?: ModelAlias
  required?: boolean
}

export interface RoutingTagRule {
  tags: string[]
  agent: string
}

export interface RoutingDefaultRule {
  default: true
  agent: string
}

export type RoutingRule = RoutingTagRule | RoutingDefaultRule

export interface Profile {
  schemaVersion: 1
  name: string
  description?: string
  orchestrator: { model: ModelAlias }
  agents: ProfileAgent[]
  routing: RoutingRule[]
}

export interface ProfileListEntry {
  name: string
  description?: string
  isDefault: boolean
  updatedAt: number
}

export interface UserPreferred {
  profile: string
}

export const BASELINE_REQUIRED_AGENTS = new Set(['sr-architect', 'sr-developer', 'sr-reviewer'])

export const MODEL_ALIASES: ModelAlias[] = ['sonnet', 'opus', 'haiku']
