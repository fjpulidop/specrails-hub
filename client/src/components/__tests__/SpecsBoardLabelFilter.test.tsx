import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { SpecsBoard } from '../SpecsBoard'
import type { LocalTicket } from '../../types'

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

vi.mock('../ProposeSpecModal', () => ({
  ProposeSpecModal: () => null,
}))

function makeTicket(id: number, title: string, labels: string[]): LocalTicket {
  return {
    id,
    title,
    description: '',
    status: 'todo',
    priority: 'medium',
    labels,
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: 'tester',
    source: 'manual',
  }
}

describe('SpecsBoard label filter', () => {
  const onTicketClick = vi.fn()

  it('renders pills derived from active tickets and filters on click', () => {
    const tickets = [
      makeTicket(1, 'Auth one', ['auth']),
      makeTicket(2, 'Auth two', ['auth']),
      makeTicket(3, 'Api one', ['api']),
      makeTicket(4, 'Ui one', ['ui']),
    ]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('Auth one')).toBeInTheDocument()
    expect(screen.getByText('Api one')).toBeInTheDocument()
    expect(screen.getByText('Ui one')).toBeInTheDocument()

    const authPill = screen.getByRole('button', { name: /^auth\s*2$/, pressed: false })
    fireEvent.click(authPill)

    expect(screen.getByText('Auth one')).toBeInTheDocument()
    expect(screen.getByText('Auth two')).toBeInTheDocument()
    expect(screen.queryByText('Api one')).toBeNull()
    expect(screen.queryByText('Ui one')).toBeNull()
  })

  it('multi-select uses OR semantics across both active and Done sections', () => {
    const tickets = [
      makeTicket(1, 'Auth one', ['auth']),
      makeTicket(2, 'Api one', ['api']),
      makeTicket(3, 'Ui one', ['ui']),
    ]
    const doneTickets = [
      makeTicket(10, 'Done auth', ['auth']),
      makeTicket(11, 'Done api', ['api']),
      makeTicket(12, 'Done ui', ['ui']),
    ]
    render(
      <SpecsBoard tickets={tickets} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^auth\s*\d/ }))
    fireEvent.click(screen.getByRole('button', { name: /^api\s*\d/ }))

    expect(screen.getByText('Auth one')).toBeInTheDocument()
    expect(screen.getByText('Api one')).toBeInTheDocument()
    expect(screen.queryByText('Ui one')).toBeNull()
    expect(screen.getByText('Done auth')).toBeInTheDocument()
    expect(screen.getByText('Done api')).toBeInTheDocument()
    expect(screen.queryByText('Done ui')).toBeNull()
  })

  it('shows filtered/total in the count chip when filter is active and resets via clear', () => {
    const tickets = [
      makeTicket(1, 'Auth one', ['auth']),
      makeTicket(2, 'Auth two', ['auth']),
      makeTicket(3, 'Api one', ['api']),
      makeTicket(4, 'Ui one', ['ui']),
    ]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('4')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^auth\s*\d/ }))
    expect(screen.getByText('2/4')).toBeInTheDocument()
    expect(screen.queryByText('Api one')).toBeNull()

    const clear = screen.getByTestId('spec-label-filter-clear')
    fireEvent.click(clear)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Api one')).toBeInTheDocument()
  })

  it('toggling the same pill twice clears the filter', () => {
    const tickets = [
      makeTicket(1, 'Auth one', ['auth']),
      makeTicket(2, 'Api one', ['api']),
    ]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)

    const auth = () => screen.getByRole('button', { name: /^auth\s*\d/ })
    fireEvent.click(auth())
    expect(screen.queryByText('Api one')).toBeNull()
    fireEvent.click(auth())
    expect(screen.getByText('Api one')).toBeInTheDocument()
  })

  it('does not render the strip when no tickets carry labels', () => {
    const tickets = [makeTicket(1, 'Plain one', []), makeTicket(2, 'Plain two', [])]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.queryByTestId('spec-label-filter-strip')).toBeNull()
  })

  it('shows a no-match empty state when the filter matches nothing', () => {
    const tickets = [makeTicket(1, 'Auth one', ['auth'])]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    fireEvent.click(screen.getByRole('button', { name: /^auth\s*\d/ }))
    fireEvent.click(screen.getByRole('button', { name: /^auth\s*\d/ }))
    // Clear → list visible again
    expect(screen.getByText('Auth one')).toBeInTheDocument()
  })

  it('does not introduce dracula-* tokens in the rendered strip', () => {
    const tickets = [
      makeTicket(1, 'Auth one', ['auth']),
      makeTicket(2, 'Api one', ['api']),
    ]
    const { container } = render(
      <SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />,
    )
    const strip = container.querySelector('[data-testid="spec-label-filter-strip"]')
    expect(strip).not.toBeNull()
    expect(strip!.outerHTML).not.toMatch(/dracula-/)
  })
})
