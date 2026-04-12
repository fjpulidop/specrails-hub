import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { getDefaultModel, ModelSelector } from '../ModelSelector'
import type { AgentDef } from '../AgentSelector'

const SAMPLE_AGENTS: AgentDef[] = [
  { id: 'sr-developer', name: 'Developer', description: 'Full-stack', category: 'Core' },
  { id: 'sr-architect', name: 'Architect', description: 'Architecture', category: 'Core' },
]

describe('getDefaultModel', () => {
  it('returns sonnet for non-special agents in balanced preset (claude)', () => {
    expect(getDefaultModel('sr-developer', 'balanced', 'claude')).toBe('claude-sonnet-4-6')
  })

  it('returns sonnet for architect in balanced preset (claude)', () => {
    expect(getDefaultModel('sr-architect', 'balanced', 'claude')).toBe('claude-sonnet-4-6')
  })

  it('returns sonnet for product-manager in balanced preset (claude)', () => {
    expect(getDefaultModel('sr-product-manager', 'balanced', 'claude')).toBe('claude-sonnet-4-6')
  })

  it('returns haiku for budget preset (claude)', () => {
    expect(getDefaultModel('sr-developer', 'budget', 'claude')).toBe('claude-haiku-4-5-20251001')
  })

  it('returns sonnet for non-special agents in max preset (claude)', () => {
    expect(getDefaultModel('sr-developer', 'max', 'claude')).toBe('claude-sonnet-4-6')
  })

  it('returns opus for architect in max preset (claude)', () => {
    expect(getDefaultModel('sr-architect', 'max', 'claude')).toBe('claude-opus-4-6')
  })

  it('returns codex-mini-latest for budget preset (codex)', () => {
    expect(getDefaultModel('sr-developer', 'budget', 'codex')).toBe('codex-mini-latest')
  })

  it('returns codex-mini-latest for architect in balanced preset (codex)', () => {
    expect(getDefaultModel('sr-architect', 'balanced', 'codex')).toBe('codex-mini-latest')
  })
})

describe('ModelSelector', () => {
  it('renders preset buttons', () => {
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{}}
        onPresetChange={vi.fn()}
        onOverrideChange={vi.fn()}
      />
    )
    expect(screen.getByText('Balanced')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Max')).toBeInTheDocument()
  })

  it('calls onPresetChange when preset button is clicked', () => {
    const onPresetChange = vi.fn()
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{}}
        onPresetChange={onPresetChange}
        onOverrideChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Budget'))
    expect(onPresetChange).toHaveBeenCalledWith('budget')
  })

  it('renders agent names in the override list', () => {
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{}}
        onPresetChange={vi.fn()}
        onOverrideChange={vi.fn()}
      />
    )
    expect(screen.getByText('Developer')).toBeInTheDocument()
    expect(screen.getByText('Architect')).toBeInTheDocument()
  })

  it('shows "custom" label for overridden agents', () => {
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{ 'sr-developer': 'claude-opus-4-6' }}
        onPresetChange={vi.fn()}
        onOverrideChange={vi.fn()}
      />
    )
    expect(screen.getByText('custom')).toBeInTheDocument()
  })

  it('shows reset button for overridden agent and calls onOverrideChange with empty string', () => {
    const onOverrideChange = vi.fn()
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{ 'sr-developer': 'claude-opus-4-6' }}
        onPresetChange={vi.fn()}
        onOverrideChange={onOverrideChange}
      />
    )
    const resetBtn = screen.getByTitle('Reset to preset default')
    fireEvent.click(resetBtn)
    expect(onOverrideChange).toHaveBeenCalledWith('sr-developer', '')
  })

  it('shows override count', () => {
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="claude"
        preset="balanced"
        overrides={{ 'sr-developer': 'claude-opus-4-6', 'sr-architect': 'claude-haiku-4-5-20251001' }}
        onPresetChange={vi.fn()}
        onOverrideChange={vi.fn()}
      />
    )
    expect(screen.getByText('2 overridden')).toBeInTheDocument()
  })

  it('uses codex models when provider is codex', () => {
    render(
      <ModelSelector
        agents={SAMPLE_AGENTS}
        provider="codex"
        preset="balanced"
        overrides={{}}
        onPresetChange={vi.fn()}
        onOverrideChange={vi.fn()}
      />
    )
    // Codex model names should appear
    expect(screen.getAllByText(/Codex Mini/i).length).toBeGreaterThan(0)
  })
})
