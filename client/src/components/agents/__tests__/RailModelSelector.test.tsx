import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../test-utils'
import { RailModelSelector } from '../RailModelSelector'

describe('RailModelSelector', () => {
  it('renders the three model options and defaults to sonnet', () => {
    render(<RailModelSelector value={null} onChange={vi.fn()} />)
    const select = screen.getByTestId('rail-model-selector') as HTMLSelectElement
    expect(select.value).toBe('sonnet')
    expect(screen.getByText('Haiku')).toBeInTheDocument()
    expect(screen.getByText('Sonnet')).toBeInTheDocument()
    expect(screen.getByText('Opus')).toBeInTheDocument()
  })

  it('reflects the selected value', () => {
    render(<RailModelSelector value="opus" onChange={vi.fn()} />)
    expect((screen.getByTestId('rail-model-selector') as HTMLSelectElement).value).toBe('opus')
  })

  it('calls onChange with the chosen model', () => {
    const onChange = vi.fn()
    render(<RailModelSelector value="sonnet" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('rail-model-selector'), { target: { value: 'haiku' } })
    expect(onChange).toHaveBeenCalledWith('haiku')
  })
})
