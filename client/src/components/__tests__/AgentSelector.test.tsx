import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { AgentSelector, ALL_AGENTS } from '../AgentSelector'

const ALL_IDS = ALL_AGENTS.map((a) => a.id)

describe('AgentSelector', () => {
  it('renders all agents selected count', () => {
    render(<AgentSelector selected={ALL_IDS} onChange={vi.fn()} />)
    expect(screen.getByText(`${ALL_IDS.length} / ${ALL_IDS.length} agents selected`)).toBeInTheDocument()
  })

  it('renders category labels', () => {
    render(<AgentSelector selected={ALL_IDS} onChange={vi.fn()} />)
    expect(screen.getByText('Core Implementation')).toBeInTheDocument()
    expect(screen.getByText('Quality & Review')).toBeInTheDocument()
  })

  it('clicking an agent toggles deselection', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    // Click the Architect agent button to deselect it
    fireEvent.click(screen.getByText('Architect'))
    expect(onChange).toHaveBeenCalledWith(expect.not.arrayContaining(['sr-architect']))
  })

  it('clicking a deselected agent selects it', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('Architect'))
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['sr-architect']))
  })

  it('Select all button selects all agents', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('Select all'))
    expect(onChange).toHaveBeenCalledWith(ALL_IDS)
  })

  it('None button deselects all agents', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    fireEvent.click(screen.getByText('None'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('clicking category header with all selected deselects that category', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={ALL_IDS} onChange={onChange} />)
    // Click "Core Implementation" category header to deselect it
    fireEvent.click(screen.getByText('Core Implementation'))
    const result = onChange.mock.calls[0][0] as string[]
    // Core agents should be removed
    expect(result).not.toContain('sr-architect')
    expect(result).not.toContain('sr-developer')
  })

  it('clicking category header with none selected selects that category', () => {
    const onChange = vi.fn()
    render(<AgentSelector selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('Core Implementation'))
    const result = onChange.mock.calls[0][0] as string[]
    expect(result).toContain('sr-architect')
    expect(result).toContain('sr-developer')
  })
})
