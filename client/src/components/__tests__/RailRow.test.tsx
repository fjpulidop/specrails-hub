import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '../../test-utils'
import { DndContext } from '@dnd-kit/core'
import { RailRow } from '../RailRow'
import type { LocalTicket } from '../../types'

const defaultProps = {
  id: 'rail-1',
  label: 'Rail 1',
  tickets: [] as LocalTicket[],
  mode: 'implement' as const,
  status: 'idle' as const,
  jiggleMode: false,
  onModeChange: vi.fn(),
  onToggle: vi.fn(),
  onTicketClick: vi.fn(),
  onDelete: vi.fn(),
  onLongPress: vi.fn(),
  onRename: vi.fn(),
}

function renderRailRow(props = defaultProps) {
  return render(
    <DndContext>
      <RailRow {...props} />
    </DndContext>
  )
}

describe('RailRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders label', () => {
    renderRailRow()
    expect(screen.getByText('Rail 1')).toBeInTheDocument()
  })

  it('shows empty drop zone when no tickets', () => {
    renderRailRow()
    expect(screen.getByText('Drag specs here')).toBeInTheDocument()
  })

  it('clicking label enters edit mode', () => {
    renderRailRow()
    const labelBtn = screen.getByRole('button', { name: 'Rail 1' })
    fireEvent.click(labelBtn)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('onChange updates input value', () => {
    renderRailRow()
    fireEvent.click(screen.getByRole('button', { name: 'Rail 1' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2' } })
    expect((input as HTMLInputElement).value).toBe('2')
  })

  it('submit form calls onRename', () => {
    const onRename = vi.fn()
    renderRailRow({ ...defaultProps, onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rail 1' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.submit(input.closest('form')!)
    expect(onRename).toHaveBeenCalledWith('2')
  })

  it('Escape key cancels editing', () => {
    renderRailRow()
    fireEvent.click(screen.getByRole('button', { name: 'Rail 1' }))
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('blur calls onRename with current value', () => {
    const onRename = vi.fn()
    renderRailRow({ ...defaultProps, onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rail 1' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('New Name')
  })

  it('delete button calls onDelete in jiggle mode', () => {
    const onDelete = vi.fn()
    const { container } = renderRailRow({ ...defaultProps, jiggleMode: true, onDelete })
    // Jiggle delete button has only a Trash2 icon, no text — find by svg
    const svgs = container.querySelectorAll('button svg')
    const deleteBtn = Array.from(svgs).map(s => s.closest('button')!).find(
      b => b.classList.contains('bg-red-500')
    )
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn!)
    expect(onDelete).toHaveBeenCalled()
  })

  it('running status disables delete', () => {
    renderRailRow({ ...defaultProps, status: 'running', jiggleMode: true })
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })
})
