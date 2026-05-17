import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { SpecSortControl } from '../SpecSortControl'

describe('SpecSortControl', () => {
  it('renders Default label and hides direction arrow when mode is default', () => {
    render(<SpecSortControl mode="default" dir="desc" onChange={() => {}} />)
    expect(screen.getByLabelText('Sort mode')).toHaveTextContent('Default')
    expect(screen.queryByLabelText('Toggle sort direction')).toBeNull()
  })

  it('shows direction arrow when mode is ticket-id', () => {
    render(<SpecSortControl mode="ticket-id" dir="desc" onChange={() => {}} />)
    expect(screen.getByLabelText('Sort mode')).toHaveTextContent('Ticket #')
    expect(screen.getByLabelText('Toggle sort direction')).toBeInTheDocument()
  })

  it('shows direction arrow when mode is priority', () => {
    render(<SpecSortControl mode="priority" dir="asc" onChange={() => {}} />)
    expect(screen.getByLabelText('Sort mode')).toHaveTextContent('Priority')
    expect(screen.getByLabelText('Toggle sort direction')).toBeInTheDocument()
  })

  it('toggles direction from desc to asc on arrow click, preserving mode', () => {
    const onChange = vi.fn()
    render(<SpecSortControl mode="ticket-id" dir="desc" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Toggle sort direction'))
    expect(onChange).toHaveBeenCalledWith('ticket-id', 'asc')
  })

  it('toggles direction from asc to desc on arrow click', () => {
    const onChange = vi.fn()
    render(<SpecSortControl mode="priority" dir="asc" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Toggle sort direction'))
    expect(onChange).toHaveBeenCalledWith('priority', 'desc')
  })
})
