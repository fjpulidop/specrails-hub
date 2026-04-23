import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { ProjectRightSidebar } from '../ProjectRightSidebar'

describe('ProjectRightSidebar', () => {
  it('renders nav items', () => {
    render(<ProjectRightSidebar />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders pin button', () => {
    render(<ProjectRightSidebar />)
    expect(screen.getByRole('button', { name: /pin right sidebar/i })).toBeInTheDocument()
  })

  it('shows Project label after pinning', () => {
    render(<ProjectRightSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /pin right sidebar/i }))
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('shows unpin label after pinning', () => {
    render(<ProjectRightSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /pin right sidebar/i }))
    expect(screen.getByRole('button', { name: /unpin right sidebar/i })).toBeInTheDocument()
  })

  it('expands on mouse enter when not pinned', () => {
    const { container } = render(<ProjectRightSidebar />)
    fireEvent.mouseEnter(container.firstChild as Element)
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('collapses on mouse leave when not pinned', () => {
    const { container } = render(<ProjectRightSidebar />)
    fireEvent.mouseEnter(container.firstChild as Element)
    fireEvent.mouseLeave(container.firstChild as Element)
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
  })
})
