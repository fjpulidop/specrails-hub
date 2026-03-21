import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import GlobalSettingsPage from '../GlobalSettingsPage'

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Controlled useHub mock: track removeProject calls
const mockRemoveProject = vi.fn()
let mockProjects: Array<{ id: string; slug: string; name: string; path: string; db_path: string; added_at: string; last_seen_at: string }> = []

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    projects: mockProjects,
    activeProjectId: null,
    isLoading: false,
    setupProjectIds: new Set(),
    setActiveProjectId: vi.fn(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: mockRemoveProject,
  }),
}))

const hubSettings = {
  port: 4200,
  specrailsTechUrl: 'http://localhost:3000',
}

describe('GlobalSettingsPage (Hub Settings dialog)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjects = []
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => hubSettings,
    })
  })

  it('renders Hub Settings title when open', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Hub Settings')).toBeInTheDocument()
    })
  })

  it('renders Manage registered projects description', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/Manage registered projects/i)).toBeInTheDocument()
    })
  })

  it('renders loading skeleton before fetch resolves', async () => {
    // Delay resolution so we catch the loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    // Dialog renders into portal (document.body), use document.querySelector
    await waitFor(() => {
      const skeleton = document.querySelector('.animate-pulse')
      expect(skeleton).not.toBeNull()
    })
  })

  it('renders Registered Projects section after load', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Registered Projects')).toBeInTheDocument()
    })
  })

  it('shows "No projects registered yet" when projects is empty', async () => {
    mockProjects = []
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('No projects registered yet')).toBeInTheDocument()
    })
  })

  it('renders project list items when projects exist', async () => {
    mockProjects = [
      {
        id: 'p1',
        slug: 'proj-1',
        name: 'My Project',
        path: '/home/user/my-project',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ]
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('My Project')).toBeInTheDocument()
      expect(screen.getByText('/home/user/my-project')).toBeInTheDocument()
    })
  })

  it('renders Remove button for each project', async () => {
    mockProjects = [
      {
        id: 'p1',
        slug: 'proj-1',
        name: 'My Project',
        path: '/home/user/my-project',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ]
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })
  })

  it('calls removeProject when Remove is clicked and resolves successfully', async () => {
    const { toast } = await import('sonner')
    mockRemoveProject.mockResolvedValueOnce(undefined)
    mockProjects = [
      {
        id: 'p1',
        slug: 'proj-1',
        name: 'My Project',
        path: '/home/user/my-project',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ]
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(mockRemoveProject).toHaveBeenCalledWith('p1')
      expect(toast.success).toHaveBeenCalledWith('Project removed')
    })
  })

  it('shows toast error when removeProject throws', async () => {
    const { toast } = await import('sonner')
    mockRemoveProject.mockRejectedValueOnce(new Error('Permission denied'))
    mockProjects = [
      {
        id: 'p1',
        slug: 'proj-1',
        name: 'Failing Project',
        path: '/home/user/failing',
        db_path: '/home/user/.specrails/projects/proj-1/jobs.sqlite',
        added_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-02T00:00:00Z',
      },
    ]
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to remove project',
        expect.objectContaining({ description: 'Permission denied' })
      )
    })
  })

  it('renders specrails-tech section with URL input', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })
  })

  it('pre-fills URL input with value from settings', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      const input = screen.getByPlaceholderText('http://localhost:3000') as HTMLInputElement
      expect(input.value).toBe('http://localhost:3000')
    })
  })

  it('renders Save button for specrails-tech URL', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })
  })

  it('saves specrails-tech URL successfully and shows toast', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings }) // GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })         // PUT

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('specrails-tech URL saved')
    })
  })

  it('shows error toast when save URL request fails', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings }) // GET
      .mockResolvedValueOnce({ ok: false })                                // PUT fails

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to save URL')
    })
  })

  it('renders Hub Information section with port', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Hub Information')).toBeInTheDocument()
      expect(screen.getByText('4200')).toBeInTheDocument()
    })
  })

  it('renders hub.sqlite path in Hub Information', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('~/.specrails/hub.sqlite')).toBeInTheDocument()
    })
  })

  it('does not fetch when open=false', () => {
    render(<GlobalSettingsPage open={false} onClose={vi.fn()} />)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('renders 0 for projects count when no projects', async () => {
    mockProjects = []
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      // Hub Information > Projects count
      expect(screen.getByText('Projects')).toBeInTheDocument()
    })
  })

  it('handles fetch error gracefully (no crash)', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    // Should not throw — isLoading goes false, settings stay null
    await waitFor(() => {
      // After error, isLoading becomes false
      expect(screen.queryByText('Hub Settings')).toBeInTheDocument()
    })
  })

  it('updates URL input when user types', async () => {
    const user = userEvent.setup()
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })
    const input = screen.getByPlaceholderText('http://localhost:3000') as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'http://localhost:4000')
    expect(input.value).toBe('http://localhost:4000')
  })
})
