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
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/hub/webhooks')) {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
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
      const saveButtons = screen.getAllByRole('button', { name: /save/i })
      expect(saveButtons[0]).toBeInTheDocument()
    })
  })

  it('saves specrails-tech URL successfully and shows toast', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })          // GET settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })   // GET webhooks
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })                 // PUT settings

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })

    await user.click(screen.getAllByRole('button', { name: /save/i })[0])

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('specrails-tech URL saved')
    })
  })

  it('shows error toast when save URL request fails', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })          // GET settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })   // GET webhooks
      .mockResolvedValueOnce({ ok: false })                                         // PUT fails

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument()
    })

    await user.click(screen.getAllByRole('button', { name: /save/i })[0])

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

  it('renders Cost Alerts section', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Cost Alerts')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/e\.g\. 0\.50/i)).toBeInTheDocument()
    })
  })

  it('saves cost alert threshold successfully', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })          // GET settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })   // GET webhooks
      .mockResolvedValueOnce({ ok: true })                                          // PUT threshold
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 0\.50/i)).toBeInTheDocument()
    })
    const input = screen.getByPlaceholderText(/e\.g\. 0\.50/i) as HTMLInputElement
    await user.type(input, '0.50')
    await user.click(screen.getAllByRole('button', { name: /save/i })[1])
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Alert set for jobs over $0.5')
    })
  })

  it('disables cost alert when threshold is blank', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })          // GET settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })   // GET webhooks
      .mockResolvedValueOnce({ ok: true })                                          // PUT threshold
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 0\.50/i)).toBeInTheDocument()
    })
    await user.click(screen.getAllByRole('button', { name: /save/i })[1])
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Cost alerts disabled')
    })
  })

  it('shows error when cost alert threshold is invalid', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/hub/webhooks')) {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
    })
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 0\.50/i)).toBeInTheDocument()
    })
    const input = screen.getByPlaceholderText(/e\.g\. 0\.50/i) as HTMLInputElement
    await user.type(input, '-1')
    await user.click(screen.getAllByRole('button', { name: /save/i })[1])
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Enter a positive number or leave blank to disable')
    })
  })
})

// ─── Outbound Webhooks section ────────────────────────────────────────────────

const mockWebhook = {
  id: 'wh-1',
  project_id: null,
  url: 'https://example.com/hook',
  secret: '',
  events: JSON.stringify(['job.completed']),
  enabled: 1,
  created_at: '2024-01-01T00:00:00Z',
}

function makeFetchWithWebhooks(webhooks: typeof mockWebhook[]) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url === '/api/hub/webhooks') {
      return Promise.resolve({ ok: true, json: async () => ({ webhooks }) })
    }
    return Promise.resolve({ ok: true, json: async () => hubSettings })
  })
}

describe('GlobalSettingsPage — Outbound Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjects = []
    global.fetch = makeFetchWithWebhooks([])
  })

  it('renders Outbound Webhooks section header', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Outbound Webhooks')).toBeInTheDocument()
    })
  })

  it('renders the Add webhook URL input', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\/hooks\.example\.com/)).toBeInTheDocument()
    })
  })

  it('disables Add Webhook button when URL is empty', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add webhook/i })).toBeInTheDocument()
    })
    const btn = screen.getByRole('button', { name: /add webhook/i })
    expect(btn).toBeDisabled()
  })

  it('adds a webhook successfully and reloads list', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })            // GET settings
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })     // GET webhooks (initial)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhook: mockWebhook }) }) // POST webhook
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [mockWebhook] }) }) // GET webhooks (reload)

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\/hooks\.example\.com/)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/https:\/\/hooks\.example\.com/), 'https://example.com/hook')
    await user.click(screen.getByRole('button', { name: /add webhook/i }))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Webhook added')
    })
  })

  it('shows error when adding webhook fails with server message', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hubSettings })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webhooks: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid URL' }) })

    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\/hooks\.example\.com/)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/https:\/\/hooks\.example\.com/), 'https://example.com/hook')
    await user.click(screen.getByRole('button', { name: /add webhook/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid URL')
    })
  })

  it('renders a listed webhook URL', async () => {
    global.fetch = makeFetchWithWebhooks([mockWebhook])
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('https://example.com/hook')).toBeInTheDocument()
    })
  })

  it('toggles a webhook on/off', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/hub/webhooks') {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [mockWebhook] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
    })
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTitle('Disable')).toBeInTheDocument()
    })
    await user.click(screen.getByTitle('Disable'))
    // Patch call should have been made
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/hub/webhooks/wh-1'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('deletes a webhook and shows success toast', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/hub/webhooks') {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [mockWebhook] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
    })
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTitle('Remove')).toBeInTheDocument()
    })
    await user.click(screen.getByTitle('Remove'))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Webhook removed')
    })
  })

  it('sends a test ping and shows success toast', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/hub/webhooks') {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [mockWebhook] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
    })
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTitle('Send test ping')).toBeInTheDocument()
    })
    await user.click(screen.getByTitle('Send test ping'))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Test ping sent')
    })
  })

  it('toggles event checkbox selection', async () => {
    const user = userEvent.setup()
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Outbound Webhooks')).toBeInTheDocument()
    })
    // Find the "Daily budget exceeded" checkbox and toggle it
    const checkbox = screen.getByRole('checkbox', { name: /daily budget exceeded/i })
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    await user.click(checkbox)
    expect((checkbox as HTMLInputElement).checked).toBe(true)
  })
})

// ─── OS Notifications section ────────────────────────────────────────────────

describe('GlobalSettingsPage — OS Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockProjects = []
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/hub/webhooks')) {
        return Promise.resolve({ ok: true, json: async () => ({ webhooks: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => hubSettings })
    })
  })

  it('renders OS Notifications section header', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('OS Notifications')).toBeInTheDocument()
    })
  })

  it('renders enable checkbox checked by default', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Enable OS Notifications')).toBeInTheDocument()
    })
    const toggle = screen.getByTestId('notif-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('shows filter options when notifications are enabled', async () => {
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('All (completed & failed)')).toBeInTheDocument()
      expect(screen.getByText('Completed only')).toBeInTheDocument()
      expect(screen.getByText('Failed only')).toBeInTheDocument()
    })
  })

  it('hides filter options when notifications are disabled', async () => {
    const user = userEvent.setup()
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('notif-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('notif-toggle'))
    expect(screen.queryByText('All (completed & failed)')).not.toBeInTheDocument()
  })

  it('persists toggle to localStorage', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('notif-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('notif-toggle'))
    const stored = JSON.parse(localStorage.getItem('specrails-os-notifications')!)
    expect(stored.enabled).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('OS notifications disabled')
  })

  it('changes filter to failed-only via radio', async () => {
    const user = userEvent.setup()
    render(<GlobalSettingsPage open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Failed only')).toBeInTheDocument()
    })
    const failedRadio = screen.getByRole('radio', { name: /failed only/i })
    await user.click(failedRadio)
    const stored = JSON.parse(localStorage.getItem('specrails-os-notifications')!)
    expect(stored.filter).toBe('failed')
  })
})
