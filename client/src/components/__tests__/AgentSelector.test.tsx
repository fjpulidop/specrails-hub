import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { AgentSelector, ALL_AGENTS, CORE_AGENTS } from '../AgentSelector'

const ALL_IDS = ALL_AGENTS.map((a) => a.id)
const CORE_IDS = [...CORE_AGENTS]

describe('AgentSelector', () => {
  it('renders all agents selected count', () => {
    render(<AgentSelector selected={ALL_IDS} onChange={vi.fn()} />)
    expect(screen.getByText(`${ALL_IDS.length} / ${ALL_IDS.length} agents selected`)).toBeInTheDocument()
  })

  it('renders category labels', () => {
    render(<AgentSelector selected={ALL_IDS} onChange={vi.fn()} />)
    expect(screen.getByText('Architecture')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Utilities')).toBeInTheDocument()
  })

  it('core agents cannot be toggled (clicking does nothing)', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    // sr-architect is a core agent — clicking should not trigger onChange
    fireEvent.click(screen.getByText('Architect'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clicking a non-core agent toggles deselection', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    // sr-frontend-developer is not core — clicking should deselect
    fireEvent.click(screen.getByText('Frontend Dev'))
    expect(onChange).toHaveBeenCalledWith(expect.not.arrayContaining(['sr-frontend-developer']))
  })

  it('clicking a deselected non-core agent selects it', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={CORE_IDS} onChange={onChange} />)
    fireEvent.click(screen.getByText('Frontend Dev'))
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['sr-frontend-developer']))
  })

  it('Select all button selects all agents', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('Select all'))
    expect(onChange).toHaveBeenCalledWith(ALL_IDS)
  })

  it('None button keeps only core agents selected', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    fireEvent.click(screen.getByText('None'))
    const result = onChange.mock.calls[0][0] as string[]
    expect(result).toEqual(expect.arrayContaining(CORE_IDS))
    expect(result.length).toBe(CORE_IDS.length)
  })

  it('clicking category header with all selected deselects non-core agents in that category', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    // Click "Review" category header — contains both core (sr-reviewer) and non-core agents
    fireEvent.click(screen.getByText('Review'))
    const result = onChange.mock.calls[0][0] as string[]
    // Core agent sr-reviewer should still be present
    expect(result).toContain('sr-reviewer')
    // Non-core review agents should be removed
    expect(result).not.toContain('sr-frontend-reviewer')
    expect(result).not.toContain('sr-backend-reviewer')
  })

  it('clicking category header with none selected selects non-core agents in that category', () => {
    const onChange = vi.fn()
    // Start with only core agents
    render(<AgentSelector selected={CORE_IDS} onChange={onChange} />)
    // Click "Review" — should add non-core review agents
    fireEvent.click(screen.getByText('Review'))
    const result = onChange.mock.calls[0][0] as string[]
    expect(result).toContain('sr-frontend-reviewer')
    expect(result).toContain('sr-backend-reviewer')
  })
})
