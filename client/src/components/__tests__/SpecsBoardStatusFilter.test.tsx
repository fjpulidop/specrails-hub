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

describe('SpecsBoard status filter', () => {
  const onTicketClick = vi.fn()

  it('defaults to "All" and renders both active and Done buckets', () => {
    const tickets = [makeTicket(1, 'Active one'), makeTicket(2, 'Active two')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard
        tickets={tickets}
        doneTickets={doneTickets}
        isLoading={false}
        onTicketClick={onTicketClick}
      />,
    )
    expect(screen.getByText('Active one')).toBeInTheDocument()
    expect(screen.getByText('Active two')).toBeInTheDocument()
    expect(screen.getByText('Done one')).toBeInTheDocument()
    expect(screen.getByTestId('specs-board-done-bucket')).toBeInTheDocument()
  })

  it('switching to "ToDo" hides the Done bucket', () => {
    const tickets = [makeTicket(1, 'Active one')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard
        tickets={tickets}
        doneTickets={doneTickets}
        isLoading={false}
        onTicketClick={onTicketClick}
      />,
    )
    fireEvent.click(screen.getByTestId('spec-status-filter'))
    fireEvent.click(screen.getByRole('option', { name: /todo/i }))
    expect(screen.getByText('Active one')).toBeInTheDocument()
    expect(screen.queryByText('Done one')).toBeNull()
    expect(screen.queryByTestId('specs-board-done-bucket')).toBeNull()
  })

  it('switching to "Done" hides the active bucket', () => {
    const tickets = [makeTicket(1, 'Active one')]
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard
        tickets={tickets}
        doneTickets={doneTickets}
        isLoading={false}
        onTicketClick={onTicketClick}
      />,
    )
    fireEvent.click(screen.getByTestId('spec-status-filter'))
    fireEvent.click(screen.getByRole('option', { name: /^done/i }))
    expect(screen.queryByText('Active one')).toBeNull()
    expect(screen.getByText('Done one')).toBeInTheDocument()
    expect(screen.getByTestId('specs-board-done-bucket')).toBeInTheDocument()
  })

  it('done bucket renders even when there are no active specs in "All" mode', () => {
    const doneTickets = [makeTicket(10, 'Done one', 'done')]
    render(
      <SpecsBoard tickets={[]} doneTickets={doneTickets} isLoading={false} onTicketClick={onTicketClick} />,
    )
    expect(screen.getByText('Done one')).toBeInTheDocument()
    expect(screen.getByTestId('specs-board-done-bucket')).toBeInTheDocument()
  })
})
