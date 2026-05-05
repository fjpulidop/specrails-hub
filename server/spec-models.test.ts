import { describe, it, expect } from 'vitest'
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  getModelsForProvider,
  getProviderDefault,
  isValidModelForProvider,
} from './spec-models'

describe('spec-models', () => {
  it('claude default is in claude allow-list', () => {
    expect(isValidModelForProvider(getProviderDefault('claude'), 'claude')).toBe(true)
  })

  it('codex default is in codex allow-list', () => {
    expect(isValidModelForProvider(getProviderDefault('codex'), 'codex')).toBe(true)
  })

  it('rejects cross-provider models', () => {
    expect(isValidModelForProvider('sonnet', 'codex')).toBe(false)
    expect(isValidModelForProvider('gpt-5.4-mini', 'claude')).toBe(false)
  })

  it('rejects empty / non-string values', () => {
    expect(isValidModelForProvider('', 'claude')).toBe(false)
    expect(isValidModelForProvider(undefined, 'claude')).toBe(false)
    expect(isValidModelForProvider(null, 'claude')).toBe(false)
    expect(isValidModelForProvider(42, 'claude')).toBe(false)
  })

  it('getModelsForProvider returns the matching list', () => {
    expect(getModelsForProvider('claude')).toBe(CLAUDE_MODELS)
    expect(getModelsForProvider('codex')).toBe(CODEX_MODELS)
  })
})
