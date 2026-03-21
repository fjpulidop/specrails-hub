import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { TemplateLibrary } from '../TemplateLibrary'
import type { JobTemplate } from '../../types'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api/projects/proj-1',
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const { toast } = await import('sonner')

function makeTemplate(overrides: Partial<JobTemplate> = {}): JobTemplate {
  return {
    id: 'tpl-1',
    name: 'Full pipeline',
    description: 'Does everything',
    commands: ['/sr:implement #1', '/sr:review #1'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('TemplateLibrary', () => {
  const onTemplatesChanged = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  // ─── Loading state ───────────────────────────────────────────────────────────

  it('shows skeleton cards when isLoading=true', () => {
    const { container } = render(
      <TemplateLibrary templates={[]} isLoading={true} onTemplatesChanged={onTemplatesChanged} />
    )
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // ─── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when templates is empty', () => {
    render(
      <TemplateLibrary templates={[]} isLoading={false} onTemplatesChanged={onTemplatesChanged} />
    )
    expect(screen.getByText('No templates yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create template/i })).toBeInTheDocument()
  })

  it('opens CreateTemplateDialog from empty state button', async () => {
    const user = userEvent.setup()
    render(
      <TemplateLibrary templates={[]} isLoading={false} onTemplatesChanged={onTemplatesChanged} />
    )
    await user.click(screen.getByRole('button', { name: /Create template/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Template')).toBeInTheDocument()
  })

  // ─── With templates ──────────────────────────────────────────────────────────

  it('renders template cards when templates are provided', () => {
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    expect(screen.getByText('Full pipeline')).toBeInTheDocument()
    expect(screen.getByText('Does everything')).toBeInTheDocument()
    expect(screen.getByText('2 steps')).toBeInTheDocument()
  })

  it('shows "+ N more" when template has more than 3 commands', () => {
    const template = makeTemplate({
      commands: ['/cmd1', '/cmd2', '/cmd3', '/cmd4', '/cmd5'],
    })
    render(
      <TemplateLibrary
        templates={[template]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows "New template" button when templates exist', () => {
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    expect(screen.getByRole('button', { name: /New template/i })).toBeInTheDocument()
  })

  it('truncates long commands in the badge', () => {
    const longCmd = '/sr:implement #1234567890123456789012345678901234567890'
    render(
      <TemplateLibrary
        templates={[makeTemplate({ commands: [longCmd] })]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    // The truncated badge should be present
    expect(screen.getByText(longCmd.slice(0, 28) + '…')).toBeInTheDocument()
  })

  // ─── Run template ────────────────────────────────────────────────────────────

  it('calls API and shows success toast when Run is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobIds: ['job-1', 'job-2'] }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Run/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1/run'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(toast.success).toHaveBeenCalledWith('Queued 2 jobs from "Full pipeline"')
    })
  })

  it('shows singular "job" when only 1 job is queued', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobIds: ['job-1'] }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Run/i }))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Queued 1 job from "Full pipeline"')
    })
  })

  it('shows error toast when run API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Queue is paused' }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Run/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Queue is paused')
    })
  })

  // ─── Delete template ─────────────────────────────────────────────────────────

  it('deletes template when confirmed and calls onTemplatesChanged', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Delete template/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(toast.success).toHaveBeenCalledWith('Template "Full pipeline" deleted')
      expect(onTemplatesChanged).toHaveBeenCalled()
    })
  })

  it('does not delete when user cancels confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Delete template/i }))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(onTemplatesChanged).not.toHaveBeenCalled()
  })

  it('shows error toast when delete API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Not found' }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Delete template/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Not found')
    })
  })

  // ─── Edit template ───────────────────────────────────────────────────────────

  it('opens Edit dialog when pencil button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /Edit template/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Edit Template')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Full pipeline')).toBeInTheDocument()
  })

  it('opens New Template dialog from "New template" button', async () => {
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    await user.click(screen.getByRole('button', { name: /New template/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Template')).toBeInTheDocument()
  })

  it('renders template without description gracefully', () => {
    render(
      <TemplateLibrary
        templates={[makeTemplate({ description: null })]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    expect(screen.getByText('Full pipeline')).toBeInTheDocument()
    // No description text rendered
    expect(screen.queryByText('Does everything')).not.toBeInTheDocument()
  })

  it('calls onTemplatesChanged via onSaved when creating a template from empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: makeTemplate() }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary templates={[]} isLoading={false} onTemplatesChanged={onTemplatesChanged} />
    )
    // Open create dialog from empty state
    await user.click(screen.getByRole('button', { name: /Create template/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Fill in name and command
    await user.type(screen.getByPlaceholderText('e.g. Full pipeline'), 'My Runbook')
    await user.type(screen.getByPlaceholderText('/sr:implement #42'), '/sr:implement #1')

    // Submit
    await user.click(screen.getByRole('button', { name: /Create/i }))

    await waitFor(() => {
      expect(onTemplatesChanged).toHaveBeenCalled()
    })
  })

  it('calls onTemplatesChanged via onSaved when editing a template', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: makeTemplate({ name: 'Updated' }) }),
    })
    const user = userEvent.setup()
    render(
      <TemplateLibrary
        templates={[makeTemplate()]}
        isLoading={false}
        onTemplatesChanged={onTemplatesChanged}
      />
    )
    // Open edit dialog
    await user.click(screen.getByRole('button', { name: /Edit template/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Submit
    await user.click(screen.getByRole('button', { name: /Update/i }))

    await waitFor(() => {
      expect(onTemplatesChanged).toHaveBeenCalled()
    })
  })
})
