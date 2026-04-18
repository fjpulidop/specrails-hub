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

  it('Full Setup is disabled (coming soon) — onChange is NOT called', () => {
    const onChange = vi.fn()
    render(<TierSelector tier="quick" onChange={onChange} />)
    fireEvent.click(screen.getByText('Full Setup'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Full Setup shows a "Coming soon" badge', () => {
    render(<TierSelector tier="quick" onChange={vi.fn()} />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('Full Setup button has disabled + aria-disabled attributes', () => {
    render(<TierSelector tier="quick" onChange={vi.fn()} />)
    const btn = screen.getByText('Full Setup').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-disabled')).toBe('true')
  })

  it('renders tier taglines', () => {
    render(<TierSelector tier="full" onChange={vi.fn()} />)
    expect(screen.getByText('Agents ready in seconds')).toBeInTheDocument()
    expect(screen.getByText('AI-personalized agents')).toBeInTheDocument()
  })
})
