import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { TicketsSection } from '../TicketsSection'
import type { LocalTicket } from '../../types'

// ─── Mock child views ────────────────────────────────────────────────────────

vi.mock('../TicketListView', () => ({
  TicketListView: ({ tickets }: { tickets: LocalTicket[] }) => (
    <div data-testid="list-view">List ({tickets.length})</div>
  ),
}))

vi.mock('../TicketGridView', () => ({
  TicketGridView: ({ tickets }: { tickets: LocalTicket[] }) => (
    <div data-testid="grid-view">Grid ({tickets.length})</div>
  ),
}))

vi.mock('../TicketPostItView', () => ({
  TicketPostItView: ({ tickets }: { tickets: LocalTicket[] }) => (
    <div data-testid="postit-view">PostIt ({tickets.length})</div>
  ),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<LocalTicket> = {}): LocalTicket {
  return {
    id: 1, title: 'Test', description: '', status: 'todo', priority: 'medium',
    labels: [], assignee: null, prerequisites: [], metadata: {},
    created_at: '', updated_at: '', created_by: 'user', source: 'manual',
    ...overrides,
  }
}

const defaultProps = {
  tickets: [makeTicket()],
  isLoading: false,
  onTicketClick: vi.fn(),
  onDelete: vi.fn(),
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders TicketListView by default', () => {
    render(<TicketsSection {...defaultProps} />)
    expect(screen.getByTestId('list-view')).toBeDefined()
    expect(screen.queryByTestId('grid-view')).toBeNull()
    expect(screen.queryByTestId('postit-view')).toBeNull()
  })

  it('switches to TicketGridView when grid button is clicked', () => {
    const { container } = render(<TicketsSection {...defaultProps} />)
    const gridBtn = container.querySelector('.lucide-layout-grid')!.closest('button')!
    fireEvent.click(gridBtn)
    expect(screen.getByTestId('grid-view')).toBeDefined()
    expect(screen.queryByTestId('list-view')).toBeNull()
  })

  it('switches to TicketPostItView when post-it button is clicked', () => {
    const { container } = render(<TicketsSection {...defaultProps} />)
    const postitBtn = container.querySelector('.lucide-sticky-note')!.closest('button')!
    fireEvent.click(postitBtn)
    expect(screen.getByTestId('postit-view')).toBeDefined()
    expect(screen.queryByTestId('list-view')).toBeNull()
  })

  it('can switch back to list view after switching to another mode', () => {
    const { container } = render(<TicketsSection {...defaultProps} />)
    const gridBtn = container.querySelector('.lucide-layout-grid')!.closest('button')!
    fireEvent.click(gridBtn)
    const listBtn = container.querySelector('.lucide-list')!.closest('button')!
    fireEvent.click(listBtn)
    expect(screen.getByTestId('list-view')).toBeDefined()
    expect(screen.queryByTestId('grid-view')).toBeNull()
  })

  it('passes tickets to the active child view', () => {
    const tickets = [makeTicket({ id: 1 }), makeTicket({ id: 2 })]
    render(<TicketsSection {...defaultProps} tickets={tickets} />)
    expect(screen.getByText('List (2)')).toBeDefined()
  })

  it('renders all three view mode toggle buttons', () => {
    const { container } = render(<TicketsSection {...defaultProps} />)
    expect(container.querySelector('.lucide-list')).not.toBeNull()
    expect(container.querySelector('.lucide-layout-grid')).not.toBeNull()
    expect(container.querySelector('.lucide-sticky-note')).not.toBeNull()
  })
})
