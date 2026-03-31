import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test-utils'
import { ProjectNavbar } from '../ProjectNavbar'
import type { HubProject } from '../../hooks/useHub'

vi.mock('../NotificationCenter', () => ({ NotificationCenter: () => null }))

const mockProject: HubProject = {
  id: 'proj-1',
  slug: 'my-project',
  name: 'My Project',
  path: '/home/user/my-project',
  db_path: '/home/user/.specrails/projects/my-project/jobs.sqlite',
  added_at: '2024-01-01T00:00:00Z',
  last_seen_at: '2024-01-02T00:00:00Z',
}

describe('ProjectNavbar', () => {
  it('renders the project path', () => {
    render(<ProjectNavbar project={mockProject} />)
    expect(screen.getByText('/home/user/my-project')).toBeInTheDocument()
  })

  it('renders Home nav link', () => {
    render(<ProjectNavbar project={mockProject} />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
  })

  it('renders Analytics nav link', () => {
    render(<ProjectNavbar project={mockProject} />)
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument()
  })

  it('renders Jobs nav link', () => {
    render(<ProjectNavbar project={mockProject} />)
    expect(screen.getByRole('link', { name: /jobs/i })).toBeInTheDocument()
  })

  it('renders Settings nav link', () => {
    render(<ProjectNavbar project={mockProject} />)
    // The settings icon-only link renders, with tooltip "Project Settings"
    const links = screen.getAllByRole('link')
    const settingsLink = links.find((l) => l.getAttribute('href') === '/settings')
    expect(settingsLink).toBeDefined()
  })

  it('renders as a nav element', () => {
    render(<ProjectNavbar project={mockProject} />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})
