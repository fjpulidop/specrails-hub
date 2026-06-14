import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '../../test-utils'
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
  CSS: { Transform: { toString: () => '' }, Translate: { toString: () => '' } },
}))

vi.mock('../ProposeSpecModal', () => ({
  ProposeSpecModal: () => null,
}))

function makeTicket(id: number, title: string, status: LocalTicket['status'] = 'todo'): LocalTicket {
  return {
    id,
    title,
    description: '',
    status,
    priority: 'medium',
    labels: [],
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: 'tester',
    source: 'manual',
  }
}

// The ToDo / Done navbar tabs replaced the old status-filter dropdown so users
// can switch buckets without scrolling the whole list. Default = ToDo.
describe('SpecsBoard ToDo / Done tabs', () => {
  const onTicketClick = vi.fn()

  it('defaults to the ToDo tab — shows active specs, hides the Done bucket', () => {
    const tickets = [makeTicket(1, 'Active one'), makeTicket(2, 'Active two')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(<SpecsBoard tickets={tickets} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('Active one')).toBeInTheDocument()
    expect(screen.getByText('Active two')).toBeInTheDocument()
    expect(screen.queryByText('Done one')).toBeNull()
    expect(screen.queryByTestId('specs-board-done-bucket')).toBeNull()
  })

  it('clicking the Done tab shows the Done bucket and hides active specs', () => {
    const tickets = [makeTicket(1, 'Active one')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(<SpecsBoard tickets={tickets} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />)
    fireEvent.click(screen.getByTestId('specs-tab-done'))
    expect(screen.queryByText('Active one')).toBeNull()
    expect(screen.getByText('Done one')).toBeInTheDocument()
    expect(screen.getByTestId('specs-board-done-bucket')).toBeInTheDocument()
  })

  it('clicking the ToDo tab returns to active specs and hides Done', () => {
    const tickets = [makeTicket(1, 'Active one')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(<SpecsBoard tickets={tickets} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />)
    fireEvent.click(screen.getByTestId('specs-tab-done'))
    fireEvent.click(screen.getByTestId('specs-tab-todo'))
    expect(screen.getByText('Active one')).toBeInTheDocument()
    expect(screen.queryByText('Done one')).toBeNull()
  })

  it('shows per-bucket counts on the tabs', () => {
    const tickets = [makeTicket(1, 'a'), makeTicket(2, 'b')]
    const doneTickets = [makeTicket(10, 'c', 'done')]
    render(<SpecsBoard tickets={tickets} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByTestId('specs-tab-todo')).toHaveTextContent('2')
    expect(screen.getByTestId('specs-tab-done')).toHaveTextContent('1')
  })

  it('renders the Done bucket using the general view tier, with no per-Done controls', () => {
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard
        tickets={[]}
        doneTickets={doneTickets}
        isLoading={false}
        onTicketClick={onTicketClick}
        onMoveToRail={() => {}}
        viewTier="postit"
      />,
    )
    fireEvent.click(screen.getByTestId('specs-tab-done'))
    const doneBucket = screen.getByTestId('specs-board-done-bucket')
    // The general view tier (postit) drives the Done bucket…
    expect(within(doneBucket).getByTestId('specs-board-done-postit-grid')).toBeInTheDocument()
    // …and the Done bucket no longer has its own sort/view controls.
    expect(within(doneBucket).queryByLabelText('Sort mode')).toBeNull()
  })

  it('honours the general row view tier in the Done bucket', () => {
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard
        tickets={[]}
        doneTickets={doneTickets}
        isLoading={false}
        onTicketClick={onTicketClick}
        onMoveToRail={() => {}}
        viewTier="row"
      />,
    )
    fireEvent.click(screen.getByTestId('specs-tab-done'))
    const doneBucket = screen.getByTestId('specs-board-done-bucket')
    expect(within(doneBucket).queryByTestId('specs-board-done-postit-grid')).toBeNull()
    expect(within(doneBucket).getByText('Done one')).toBeInTheDocument()
  })
})
