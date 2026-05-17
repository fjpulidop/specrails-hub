import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test-utils'
import { CostAwarenessMeter } from '../CostAwarenessMeter'

const budget = {
  specrailsTicketsTokens: 1000,
  openspecSpecsTokens: 5000,
  codebaseFileCount: 100,
  codebaseEstimatedTokens: 80_000,
  mcpServers: [],
}

describe('CostAwarenessMeter', () => {
  it('shows Light tier when all off', () => {
    render(
      <CostAwarenessMeter
        scope={{ specrails: false, openspec: false, full: false, mcp: false }}
        budget={budget}
        budgetError={false}
        model="sonnet"
      />
    )
    expect(screen.getByTestId('meter-tier').textContent).toBe('Light')
  })

  it('shows Deep tier when all on', () => {
    render(
      <CostAwarenessMeter
        scope={{ specrails: true, openspec: true, full: true, mcp: true }}
        budget={budget}
        budgetError={false}
        model="sonnet"
      />
    )
    expect(screen.getByTestId('meter-tier').textContent).toBe('Deep')
  })

  it('shows fallback text when budget errors', () => {
    render(
      <CostAwarenessMeter
        scope={{ specrails: true, openspec: false, full: false, mcp: false }}
        budget={null}
        budgetError={true}
        model="sonnet"
      />
    )
    expect(screen.getByTestId('meter-numeric').textContent).toContain('estimate unavailable')
  })

  it('shows numeric estimate when budget loaded', () => {
    render(
      <CostAwarenessMeter
        scope={{ specrails: true, openspec: false, full: false, mcp: false }}
        budget={budget}
        budgetError={false}
        model="sonnet"
      />
    )
    const numeric = screen.getByTestId('meter-numeric').textContent ?? ''
    expect(numeric).toMatch(/tok/)
    expect(numeric).toMatch(/\$/)
    expect(numeric).toMatch(/s$|s ·/)
  })

  it('all four segments rendered', () => {
    render(
      <CostAwarenessMeter
        scope={{ specrails: false, openspec: false, full: false, mcp: false }}
        budget={budget}
        budgetError={false}
        model="sonnet"
      />
    )
    expect(screen.getByTestId('meter-segment-light')).toBeInTheDocument()
    expect(screen.getByTestId('meter-segment-medium')).toBeInTheDocument()
    expect(screen.getByTestId('meter-segment-heavy')).toBeInTheDocument()
    expect(screen.getByTestId('meter-segment-deep')).toBeInTheDocument()
  })
})
