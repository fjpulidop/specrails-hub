import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { TierSelector } from '../TierSelector'

describe('TierSelector', () => {
  it('renders Quick Setup and Full Setup options', () => {
    render(<TierSelector tier="full" onChange={vi.fn()} />)
    expect(screen.getByText('Quick Setup')).toBeInTheDocument()
    expect(screen.getByText('Full Setup')).toBeInTheDocument()
  })

  it('calls onChange with quick when Quick Setup is clicked', () => {
    const onChange = vi.fn()
    render(<TierSelector tier="full" onChange={onChange} />)
    fireEvent.click(screen.getByText('Quick Setup'))
    expect(onChange).toHaveBeenCalledWith('quick')
  })

  it('calls onChange with full when Full Setup is clicked', () => {
    const onChange = vi.fn()
    render(<TierSelector tier="quick" onChange={onChange} />)
    fireEvent.click(screen.getByText('Full Setup'))
    expect(onChange).toHaveBeenCalledWith('full')
  })

  it('renders tier taglines', () => {
    render(<TierSelector tier="full" onChange={vi.fn()} />)
    expect(screen.getByText('Agents ready in seconds')).toBeInTheDocument()
    expect(screen.getByText('AI-personalized agents')).toBeInTheDocument()
  })
})
