import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { SpecCard } from '../SpecCard'
import type { LocalTicket } from '../../types'

// SpecCard uses useSortable from @dnd-kit/sortable — must be inside DndContext
// We mock the sortable hook to simplify rendering outside DndContext
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return {
    ...mod,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

function makeTicket(overrides: Partial<LocalTicket> = {}): LocalTicket {
  return {
    id: 42,
    title: 'Build the feature',
    description: 'Some description',
    status: 'todo',
    priority: 'medium',
    labels: ['backend'],
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

describe('SpecCard', () => {
  const onClickMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the ticket title', () => {
    render(<SpecCard ticket={makeTicket()} onClick={onClickMock} />)
    expect(screen.getByText('Build the feature')).toBeInTheDocument()
  })

  it('renders the ticket id', () => {
    render(<SpecCard ticket={makeTicket()} onClick={onClickMock} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('renders the priority badge', () => {
    render(<SpecCard ticket={makeTicket({ priority: 'high' })} onClick={onClickMock} />)
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('renders critical priority badge', () => {
    render(<SpecCard ticket={makeTicket({ priority: 'critical' })} onClick={onClickMock} />)
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('renders low priority badge', () => {
    render(<SpecCard ticket={makeTicket({ priority: 'low' })} onClick={onClickMock} />)
    expect(screen.getByText('low')).toBeInTheDocument()
  })

  it('calls onClick when card is clicked', () => {
    const ticket = makeTicket()
    render(<SpecCard ticket={ticket} onClick={onClickMock} />)
    fireEvent.click(screen.getByText('Build the feature'))
    expect(onClickMock).toHaveBeenCalledWith(ticket)
  })

  it('calls onClick when Enter key is pressed', () => {
    const ticket = makeTicket()
    render(<SpecCard ticket={ticket} onClick={onClickMock} />)
    const card = screen.getByText('Build the feature').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onClickMock).toHaveBeenCalledWith(ticket)
  })

  it('entire card surface is draggable (no separate grip handle)', () => {
    render(<SpecCard ticket={makeTicket()} onClick={onClickMock} />)
    const card = screen.getByText('Build the feature').closest('[role="button"]')!
    expect(card).toHaveClass('cursor-grab')
  })

  it('has correct accessibility role and tabIndex', () => {
    const ticket = makeTicket()
    render(<SpecCard ticket={ticket} onClick={onClickMock} />)
    const card = screen.getByText('Build the feature').closest('[role="button"]')!
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabIndex', '0')
  })
})
