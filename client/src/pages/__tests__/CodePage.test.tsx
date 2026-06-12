import React, { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test-utils'
import CodePage from '../CodePage'
import type { CopyPathAction, SummaryAction } from '../../components/code-explorer/FileViewer'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api',
}))

vi.mock('../../hooks/useDesktop', () => ({
  useDesktop: () => ({ activeProjectId: 'project-1' }),
}))

vi.mock('../../components/code-explorer/FileTree', () => ({
  FileTree: ({
    selectedPath,
    filterJobId,
    filterTicketId,
    onOpenFile,
  }: {
    selectedPath: string | null
    filterJobId?: string | null
    filterTicketId?: number | null
    onOpenFile: (path: string) => void
  }) => (
    <div data-testid="file-tree" data-selected={selectedPath ?? ''} data-job={filterJobId ?? ''} data-ticket={filterTicketId ?? ''}>
      <button type="button" onClick={() => onOpenFile('src/a.ts')}>Open A</button>
    </div>
  ),
}))

vi.mock('../../components/code-explorer/FileViewer', async () => {
  const actual = await vi.importActual<typeof import('../../components/code-explorer/FileViewer')>('../../components/code-explorer/FileViewer')
  return {
    ...actual,
    FileViewer: ({
      relPath,
      onSummaryActionChange,
      onCopyPathActionChange,
      onFilterJob,
    }: {
      relPath: string
      onSummaryActionChange?: (action: SummaryAction | null) => void
      onCopyPathActionChange?: (action: CopyPathAction | null) => void
      onFilterJob?: (jobId: string) => void
    }) => {
      useEffect(() => {
        onSummaryActionChange?.({
          hasSummary: relPath.includes('summary'),
          regenerating: false,
          disabledReason: null,
          onClick: vi.fn(),
        })
        onCopyPathActionChange?.({ onClick: vi.fn() })
        return () => {
          onSummaryActionChange?.(null)
          onCopyPathActionChange?.(null)
        }
      }, [onCopyPathActionChange, onSummaryActionChange, relPath])
      return (
        <div data-testid="file-viewer" data-path={relPath}>
          <button type="button" onClick={() => onFilterJob?.('job-1')}>Filter job</button>
        </div>
      )
    },
  }
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { path: 'src/new.ts', kind: 'created', jobId: 'job-1', ticketId: 29, at: 1 },
      { path: 'src/changed.ts', kind: 'modified', jobId: 'job-1', ticketId: 29, at: 2 },
      { path: 'src/gone.ts', kind: 'deleted', jobId: 'job-1', ticketId: 29, at: 3 },
    ],
  })
})

describe('CodePage', () => {
  it('renders scope toolbar and applies a spec filter', async () => {
    render(<CodePage />, { route: '/code' })
    expect(screen.getByTestId('code-provenance-toolbar')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('id'), { target: { value: '29' } })
    fireEvent.click(screen.getByText('Spec'))

    await waitFor(() => {
      expect(screen.getByTestId('provenance-result-panel')).toBeInTheDocument()
    })
    expect(screen.getByText('Spec #29')).toBeInTheDocument()
    expect(screen.getByText('added')).toBeInTheDocument()
    expect(screen.getByText('changed')).toBeInTheDocument()
    expect(screen.getByText('deleted')).toBeInTheDocument()
    expect(screen.getByTestId('file-tree')).toHaveAttribute('data-ticket', '29')
  })

  it('opens a file and surfaces the summary action in the top toolbar', async () => {
    render(<CodePage />, { route: '/code' })
    fireEvent.click(screen.getByText('Open A'))
    await waitFor(() => {
      expect(screen.getByTestId('file-viewer')).toHaveAttribute('data-path', 'src/a.ts')
    })
    expect(screen.getByText('Copy file path')).toBeInTheDocument()
    expect(screen.getByText('Generate summary')).toBeInTheDocument()
  })

  it('can filter by job from the file viewer context while keeping job input hidden', async () => {
    render(<CodePage />, { route: '/code?path=src/summary.ts' })
    await waitFor(() => {
      expect(screen.getByText('Regenerate summary')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Filter job'))
    await waitFor(() => {
      expect(screen.getByTestId('file-tree')).toHaveAttribute('data-job', 'job-1')
    })
    expect(screen.queryByPlaceholderText('job id')).not.toBeInTheDocument()
    expect(screen.getByText('Job context')).toBeInTheDocument()
  })

  it('persists tree width when the splitter is double-clicked', () => {
    localStorage.setItem('specrails-desktop:code-tree-width:project-1', '500')
    render(<CodePage />, { route: '/code' })
    fireEvent.doubleClick(screen.getByTestId('code-tree-resizer'))
    expect(localStorage.getItem('specrails-desktop:code-tree-width:project-1')).toBe('320')
  })
})
