import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { LogViewer } from '../LogViewer'
import type { EventRow } from '../../types'

// Mock react-markdown and remark-gfm
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))

// Mock the markdown-detect module so all lines are treated as plain
vi.mock('../../lib/markdown-detect', () => ({
  hasMarkdownSyntax: () => false,
}))

function makeLogEvent(line: string, id = 1, source = 'stdout'): EventRow {
  return {
    id,
    job_id: 'job-1',
    seq: id,
    event_type: 'log',
    source,
    payload: JSON.stringify({ line }),
    timestamp: new Date().toISOString(),
  }
}

describe('LogViewer', () => {
  it('shows "No log output yet" when events produce no lines', () => {
    render(<LogViewer events={[]} />)
    expect(screen.getByText(/No log output yet/i)).toBeInTheDocument()
  })

  it('shows "Loading logs..." when isLoading is true', () => {
    render(<LogViewer events={[]} isLoading={true} />)
    expect(screen.getByText(/Loading logs.../i)).toBeInTheDocument()
  })

  it('renders log lines from events', () => {
    const events = [
      makeLogEvent('First log line', 1),
      makeLogEvent('Second log line', 2),
    ]
    render(<LogViewer events={events} />)
    expect(screen.getByText('First log line')).toBeInTheDocument()
    expect(screen.getByText('Second log line')).toBeInTheDocument()
  })

  it('renders filter input when there are log lines', () => {
    const events = [makeLogEvent('some output', 1)]
    render(<LogViewer events={events} />)
    expect(screen.getByPlaceholderText(/Filter logs.../i)).toBeInTheDocument()
  })

  it('shows total line count', () => {
    const events = [
      makeLogEvent('line one', 1),
      makeLogEvent('line two', 2),
      makeLogEvent('line three', 3),
    ]
    render(<LogViewer events={events} />)
    // Count shows "3 / 3 lines"
    expect(screen.getByText(/3 \/ 3 lines/i)).toBeInTheDocument()
  })

  it('filter input filters displayed log lines', async () => {
    const user = userEvent.setup()
    const events = [
      makeLogEvent('error: something went wrong', 1),
      makeLogEvent('info: all good', 2),
    ]
    render(<LogViewer events={events} />)
    const filterInput = screen.getByPlaceholderText(/Filter logs.../i)
    await user.type(filterInput, 'error')
    expect(screen.getByText('error: something went wrong')).toBeInTheDocument()
    expect(screen.queryByText('info: all good')).not.toBeInTheDocument()
  })

  it('shows filtered / total count after filtering', async () => {
    const user = userEvent.setup()
    const events = [
      makeLogEvent('error: something went wrong', 1),
      makeLogEvent('info: all good', 2),
      makeLogEvent('error: another error', 3),
    ]
    render(<LogViewer events={events} />)
    const filterInput = screen.getByPlaceholderText(/Filter logs.../i)
    await user.type(filterInput, 'error')
    // 2 matching out of 3 total
    expect(screen.getByText(/2 \/ 3 lines/i)).toBeInTheDocument()
  })

  it('skips empty log lines', () => {
    const events = [
      makeLogEvent('', 1),
      makeLogEvent('  ', 2),
      makeLogEvent('real line', 3),
    ]
    render(<LogViewer events={events} />)
    expect(screen.getByText('real line')).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 1 lines/i)).toBeInTheDocument()
  })

  it('does not render filter bar when loading', () => {
    render(<LogViewer events={[]} isLoading={true} />)
    expect(screen.queryByPlaceholderText(/Filter logs.../i)).not.toBeInTheDocument()
  })
})
