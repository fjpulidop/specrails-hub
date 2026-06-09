import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { ContextScopeChecks } from '../ContextScopeChecks'
import type { ContextScope } from '../../types/context-scope'

const baseScope: ContextScope = { specrails: false, openspec: false, full: false, mcp: false, contractRefine: false }

describe('ContextScopeChecks', () => {
  it('is collapsed by default and toggles open', () => {
    render(<ContextScopeChecks scope={baseScope} mode="explore" onChange={() => {}} />)
    expect(screen.queryByLabelText('specrails tickets')).toBeNull()
    fireEvent.click(screen.getByTestId('context-scope-toggle'))
    expect(screen.getByLabelText('specrails tickets')).toBeInTheDocument()
  })

  it('renders six toggles when open', () => {
    render(<ContextScopeChecks scope={baseScope} mode="explore" onChange={() => {}} defaultOpen />)
    expect(screen.getByLabelText('specrails tickets')).toBeInTheDocument()
    expect(screen.getByLabelText('openspec specs')).toBeInTheDocument()
    expect(screen.getByLabelText('Full codebase')).toBeInTheDocument()
    expect(screen.getByLabelText('Project MCPs')).toBeInTheDocument()
    expect(screen.getByLabelText('My approved MCPs')).toBeInTheDocument()
    expect(screen.getByLabelText('Enrich with Contract Layer')).toBeInTheDocument()
  })

  it('My approved MCPs toggle is disabled in Quick mode, enabled in Explore', () => {
    const { rerender } = render(<ContextScopeChecks scope={baseScope} mode="quick" onChange={() => {}} defaultOpen />)
    expect((screen.getByLabelText('My approved MCPs') as HTMLButtonElement).disabled).toBe(true)
    rerender(<ContextScopeChecks scope={baseScope} mode="explore" onChange={() => {}} defaultOpen />)
    expect((screen.getByLabelText('My approved MCPs') as HTMLButtonElement).disabled).toBe(false)
  })

  it('emits userMcp partial when the My approved MCPs toggle is clicked', () => {
    const onChange = vi.fn()
    render(<ContextScopeChecks scope={baseScope} mode="explore" onChange={onChange} defaultOpen />)
    fireEvent.click(screen.getByLabelText('My approved MCPs'))
    expect(onChange).toHaveBeenLastCalledWith({ ...baseScope, userMcp: true })
  })

  it('MCPs toggle is disabled in Quick mode', () => {
    render(<ContextScopeChecks scope={baseScope} mode="quick" onChange={() => {}} defaultOpen />)
    const mcp = screen.getByLabelText('Project MCPs') as HTMLButtonElement
    expect(mcp.disabled).toBe(true)
  })

  it('MCPs toggle is enabled in Explore mode', () => {
    render(<ContextScopeChecks scope={baseScope} mode="explore" onChange={() => {}} defaultOpen />)
    const mcp = screen.getByLabelText('Project MCPs') as HTMLButtonElement
    expect(mcp.disabled).toBe(false)
  })

  it('emits the correct partial when toggled independently', () => {
    const onChange = vi.fn()
    render(<ContextScopeChecks scope={baseScope} mode="explore" onChange={onChange} defaultOpen />)
    fireEvent.click(screen.getByLabelText('openspec specs'))
    expect(onChange).toHaveBeenLastCalledWith({ ...baseScope, openspec: true })
    fireEvent.click(screen.getByLabelText('Full codebase'))
    expect(onChange).toHaveBeenLastCalledWith({ ...baseScope, full: true })
  })

  it('does not flip mcp in Quick mode even if scope says true', () => {
    const scope: ContextScope = { specrails: false, openspec: false, full: false, mcp: true, contractRefine: false }
    render(<ContextScopeChecks scope={scope} mode="quick" onChange={() => {}} defaultOpen />)
    const mcp = screen.getByLabelText('Project MCPs')
    expect(mcp).toHaveAttribute('aria-checked', 'false')
  })

  it('shows summary chip when collapsed', () => {
    render(<ContextScopeChecks
      scope={{ specrails: true, openspec: true, full: false, mcp: false, contractRefine: false }}
      mode="explore" onChange={() => {}}
    />)
    const toggle = screen.getByTestId('context-scope-toggle')
    expect(toggle.textContent).toContain('specrails')
    expect(toggle.textContent).toContain('openspec')
  })
})
