import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { ProjectRightSidebar } from '../ProjectRightSidebar'

beforeEach(() => {
  window.localStorage.clear()
})

describe('ProjectRightSidebar', () => {
  it('renders nav items', () => {
    render(<ProjectRightSidebar />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders pin button in unpinned default state', () => {
    render(<ProjectRightSidebar />)
    expect(screen.getByRole('button', { name: /Pin right sidebar open/i })).toBeInTheDocument()
  })

  it('cycle unpinned → pinned-open expands and labels collapse', () => {
    render(<ProjectRightSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /Pin right sidebar open/i }))
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Collapse right sidebar/i })).toBeInTheDocument()
  })

  it('cycle pinned-open → pinned-collapsed collapses and labels unpin', () => {
    render(<ProjectRightSidebar />)
    const btn = () => screen.getByRole('button', { name: /sidebar/i })
    fireEvent.click(btn()) // pinned-open
    fireEvent.click(btn()) // pinned-collapsed
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unpin right sidebar/i })).toBeInTheDocument()
  })

  it('expands on mouse enter when unpinned', () => {
    const { container } = render(<ProjectRightSidebar />)
    fireEvent.mouseEnter(container.firstChild as Element)
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('collapses on mouse leave when unpinned', () => {
    const { container } = render(<ProjectRightSidebar />)
    fireEvent.mouseEnter(container.firstChild as Element)
    fireEvent.mouseLeave(container.firstChild as Element)
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
  })

  it('does not expand on hover when pinned-collapsed', () => {
    const { container } = render(<ProjectRightSidebar />)
    const btn = () => screen.getByRole('button', { name: /sidebar/i })
    fireEvent.click(btn()) // pinned-open
    fireEvent.click(btn()) // pinned-collapsed
    fireEvent.mouseEnter(container.firstChild as Element)
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
  })
})
