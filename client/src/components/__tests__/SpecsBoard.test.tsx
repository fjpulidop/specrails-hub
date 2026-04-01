import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { SpecsBoard } from '../SpecsBoard'
import type { LocalTicket } from '../../types'

// Mock DnD kit — SpecsBoard uses useDroppable + SortableContext
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
  ProposeSpecModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="propose-spec-modal"><button onClick={onClose}>close modal</button></div> : null,
}))

function makeTicket(overrides: Partial<LocalTicket> = {}): LocalTicket {
  return {
    id: 1,
    title: 'Test Spec',
    description: '',
    status: 'todo',
    priority: 'medium',
    labels: [],
    assignee: null,
    prerequisites: [],
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: 'user',
    source: 'propose-spec',
    ...overrides,
  }
}

describe('SpecsBoard', () => {
  const onTicketClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Specs heading', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('Specs')).toBeInTheDocument()
  })

  it('renders Propose Spec button', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByRole('button', { name: /Propose Spec/i })).toBeInTheDocument()
  })

  it('shows empty state when no tickets', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('No specs yet')).toBeInTheDocument()
    expect(screen.getByText(/Click "Propose Spec" to get started/i)).toBeInTheDocument()
  })

  it('shows loading skeletons when isLoading is true', () => {
    render(<SpecsBoard tickets={[]} isLoading={true} onTicketClick={onTicketClick} />)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders passed tickets', () => {
    const tickets = [
      makeTicket({ id: 1, title: 'Spec One' }),
      makeTicket({ id: 2, title: 'Spec Two' }),
    ]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('Spec One')).toBeInTheDocument()
    expect(screen.getByText('Spec Two')).toBeInTheDocument()
  })

  it('shows ticket count badge when there are tickets', () => {
    const tickets = [makeTicket({ id: 1 }), makeTicket({ id: 2 }), makeTicket({ id: 3 })]
    render(<SpecsBoard tickets={tickets} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not show active specs count badge when no tickets', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    // The Specs header should not show a count badge for 0 active tickets
    // (the Done section always shows its own "0" badge)
    const heading = screen.getByText('Specs')
    const headerDiv = heading.closest('div.flex')!
    expect(headerDiv.querySelector('.rounded-full')).toBeNull()
  })

  it('opens ProposeSpecModal when Propose Spec is clicked', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    expect(screen.queryByTestId('propose-spec-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Propose Spec/i }))
    expect(screen.getByTestId('propose-spec-modal')).toBeInTheDocument()
  })

  it('closes ProposeSpecModal when onClose is called', () => {
    render(<SpecsBoard tickets={[]} isLoading={false} onTicketClick={onTicketClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Propose Spec/i }))
    expect(screen.getByTestId('propose-spec-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('close modal'))
    expect(screen.queryByTestId('propose-spec-modal')).not.toBeInTheDocument()
  })
})
