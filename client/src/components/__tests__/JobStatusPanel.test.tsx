import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { JobStatusPanel } from '../JobStatusPanel'
import type { JobSummary, EventRow } from '../../types'

const completedJob: JobSummary = {
  id: 'job-1',
  command: '/specrails:implement --spec SPEA-001',
  started_at: '2024-03-21T10:00:00Z',
  finished_at: '2024-03-21T10:01:02Z',  // 62s wall-clock
  status: 'completed',
  duration_ms: 62000,
  total_cost_usd: 0.0234,
  tokens_in: 5000,
  tokens_out: 3000,
  num_turns: 8,
}

const failedJob: JobSummary = {
  id: 'job-2',
  command: '/specrails:health-check',
  started_at: '2024-03-21T11:00:00Z',
  finished_at: null,
  status: 'failed',
  duration_ms: null,
  total_cost_usd: null,
  tokens_in: null,
  tokens_out: null,
  num_turns: null,
}

const eventsWithFiles: EventRow[] = [
  {
    id: 1,
    job_id: 'job-1',
    event_type: 'log',
    payload: JSON.stringify({ line: 'Writing file: src/components/MyComponent.tsx' }),
    created_at: '2024-03-21T10:01:00Z',
  },
  {
    id: 2,
    job_id: 'job-1',
    event_type: 'log',
    payload: JSON.stringify({ line: 'Editing src/hooks/useHook.ts' }),
    created_at: '2024-03-21T10:02:00Z',
  },
  {
    id: 3,
    job_id: 'job-1',
    event_type: 'log',
    payload: '{ invalid json }', // Should be skipped gracefully
    created_at: '2024-03-21T10:03:00Z',
  },
  {
    id: 4,
    job_id: 'job-1',
    event_type: 'phase', // Not a log event — should be skipped
    payload: JSON.stringify({ phase: 'developer' }),
    created_at: '2024-03-21T10:04:00Z',
  },
]

describe('JobStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Job completed" for completed status', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    expect(screen.getByText('Job completed')).toBeInTheDocument()
  })

  it('renders "Job failed" for failed status', () => {
    render(<JobStatusPanel job={failedJob} events={[]} />)
    expect(screen.getByText('Job failed')).toBeInTheDocument()
  })

  it('renders duration chip in header for completed job', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    // Wall-clock: 10:00:00 → 10:01:02 = 62s → "1m 2s" — appears in both header chip AND metric card
    const durationTexts = screen.getAllByText('1m 2s')
    expect(durationTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('renders cost chip in header for completed job', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    // $0.0234 appears in both header chip AND metric card
    const costTexts = screen.getAllByText('$0.0234')
    expect(costTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('does not render duration chip when finished_at is null', () => {
    render(<JobStatusPanel job={failedJob} events={[]} />)
    expect(screen.queryByText(/\ds$/)).not.toBeInTheDocument()
  })

  it('does not render cost chip when total_cost_usd is null', () => {
    render(<JobStatusPanel job={failedJob} events={[]} />)
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument()
  })

  it('renders expanded content by default (defaultOpen=true)', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Turns')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('collapses content when defaultOpen=false', () => {
    render(<JobStatusPanel job={completedJob} events={[]} defaultOpen={false} />)
    expect(screen.queryByText('Duration')).not.toBeInTheDocument()
  })

  it('toggles open/closed when header button is clicked', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    // Initially open
    expect(screen.getByText('Duration')).toBeInTheDocument()

    // Click to close
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Duration')).not.toBeInTheDocument()

    // Click to re-open
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Duration')).toBeInTheDocument()
  })

  it('renders metric values in expanded state', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    // Wall-clock duration in metric card: 10:00:00 → 10:01:02 = "1m 2s"
    const durationValues = screen.getAllByText('1m 2s')
    expect(durationValues.length).toBeGreaterThanOrEqual(1)
  })

  it('renders turns value', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders tokens value in k format', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    // tokens_in: 5000 + tokens_out: 3000 = 8000 → 8.0k
    expect(screen.getByText('8.0k')).toBeInTheDocument()
  })

  it('renders "—" for null metric values', () => {
    render(<JobStatusPanel job={failedJob} events={[]} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3) // duration, cost, turns, tokens all null
  })

  it('extracts modified files from log events', () => {
    render(<JobStatusPanel job={completedJob} events={eventsWithFiles} />)
    // The regex extracts the full path like "src/components/MyComponent.tsx"
    expect(screen.getByText('src/components/MyComponent.tsx')).toBeInTheDocument()
  })

  it('shows files count chip in header when files are extracted', () => {
    render(<JobStatusPanel job={completedJob} events={eventsWithFiles} />)
    // 2 files extracted → "2 files" chip
    expect(screen.getByText('2 files')).toBeInTheDocument()
  })

  it('shows singular "file" when only 1 file modified', () => {
    const singleFileEvents: EventRow[] = [{
      id: 1,
      job_id: 'job-1',
      event_type: 'log',
      payload: JSON.stringify({ line: 'Writing index.ts' }),
      created_at: '2024-03-21T10:00:00Z',
    }]
    render(<JobStatusPanel job={completedJob} events={singleFileEvents} />)
    expect(screen.getByText('1 file')).toBeInTheDocument()
  })

  it('does not show files section when no files extracted', () => {
    render(<JobStatusPanel job={completedJob} events={[]} />)
    expect(screen.queryByText('Files modified')).not.toBeInTheDocument()
  })

  it('renders modified file paths in expanded state', () => {
    render(<JobStatusPanel job={completedJob} events={eventsWithFiles} />)
    expect(screen.getByText('src/components/MyComponent.tsx')).toBeInTheDocument()
    expect(screen.getByText('src/hooks/useHook.ts')).toBeInTheDocument()
  })

  it('skips non-log event types when extracting files', () => {
    // Only the log event should be processed
    const nonLogEvents: EventRow[] = [{
      id: 1,
      job_id: 'job-1',
      event_type: 'phase',
      payload: JSON.stringify({ line: 'Writing fake.ts' }),
      created_at: '2024-03-21T10:00:00Z',
    }]
    render(<JobStatusPanel job={completedJob} events={nonLogEvents} />)
    expect(screen.queryByText('fake.ts')).not.toBeInTheDocument()
    expect(screen.queryByText('Files modified')).not.toBeInTheDocument()
  })

  it('skips events with invalid JSON payload', () => {
    const badEvents: EventRow[] = [{
      id: 1,
      job_id: 'job-1',
      event_type: 'log',
      payload: 'not valid json at all',
      created_at: '2024-03-21T10:00:00Z',
    }]
    // Should not throw
    render(<JobStatusPanel job={completedJob} events={badEvents} />)
    expect(screen.queryByText('Files modified')).not.toBeInTheDocument()
  })

  describe('running', () => {
    function makeAssistantEvent(seq: number, input?: number, output?: number): EventRow {
      const message =
        input == null && output == null
          ? {}
          : { usage: { input_tokens: input ?? 0, output_tokens: output ?? 0 } }
      return {
        id: seq,
        job_id: 'job-running',
        seq,
        event_type: 'assistant',
        payload: JSON.stringify({ message }),
        timestamp: new Date(2024, 0, 1, 10, 0, seq).toISOString(),
      } as EventRow
    }

    const runningJob: JobSummary = {
      id: 'job-running',
      command: '/specrails:implement #24',
      started_at: new Date(Date.now() - 65_000).toISOString(),
      finished_at: null,
      status: 'running',
      duration_ms: null,
      total_cost_usd: null,
      tokens_in: null,
      tokens_out: null,
      num_turns: null,
    }

    it('renders "Job in progress" header with spinner', () => {
      render(<JobStatusPanel job={runningJob} events={[]} />)
      expect(screen.getByText('Job in progress')).toBeInTheDocument()
    })

    it('shows em-dash for Cost while running', () => {
      render(<JobStatusPanel job={runningJob} events={[]} />)
      // The Cost cell renders inside the metric grid.
      const costLabel = screen.getByText('Cost')
      const valueEl = costLabel.parentElement?.querySelector('p:last-child')
      expect(valueEl?.textContent).toBe('—')
    })

    it('aggregates Turns and Tokens from streamed assistant events', () => {
      const events: EventRow[] = [
        makeAssistantEvent(1, 100, 50),
        makeAssistantEvent(2, 200, 75),
        makeAssistantEvent(3, 300, 100),
      ]
      render(<JobStatusPanel job={runningJob} events={events} />)
      expect(screen.getByText('3')).toBeInTheDocument() // Turns
      // (100+50) + (200+75) + (300+100) = 825 → "0.8k"
      expect(screen.getByText('0.8k')).toBeInTheDocument()
    })

    it('tolerates missing or partial usage fields without NaN', () => {
      const events: EventRow[] = [
        makeAssistantEvent(1, 100, 50),
        makeAssistantEvent(2), // no usage
        { ...makeAssistantEvent(3, 50, 25), payload: JSON.stringify({ message: { usage: { input_tokens: 50 } } }) },
      ]
      render(<JobStatusPanel job={runningJob} events={events} />)
      expect(screen.getByText('3')).toBeInTheDocument()
      // 100+50 + 0 + 50 = 200 → "0.2k"
      expect(screen.getByText('0.2k')).toBeInTheDocument()
    })

    it('aggregator scales to thousands of events without NaN', () => {
      const events: EventRow[] = []
      let expectedTokens = 0
      for (let i = 1; i <= 1000; i++) {
        const inT = i % 7 === 0 ? undefined : 10 + (i % 5)
        const outT = i % 11 === 0 ? undefined : 5 + (i % 3)
        events.push(makeAssistantEvent(i, inT, outT))
        expectedTokens += (inT ?? 0) + (outT ?? 0)
      }
      render(<JobStatusPanel job={runningJob} events={events} />)
      expect(screen.getByText('1000')).toBeInTheDocument()
      const expectedDisplay = `${(expectedTokens / 1000).toFixed(1)}k`
      expect(screen.getByText(expectedDisplay)).toBeInTheDocument()
    })

    it('switches header from running to completed on status change without remount', () => {
      const startedAt = new Date(Date.now() - 5000).toISOString()
      const events: EventRow[] = [makeAssistantEvent(1, 100, 50)]
      const { rerender } = render(
        <JobStatusPanel
          job={{ ...runningJob, started_at: startedAt }}
          events={events}
        />,
      )
      expect(screen.getByText('Job in progress')).toBeInTheDocument()

      const completed: JobSummary = {
        ...runningJob,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'completed',
        total_cost_usd: 0.42,
        tokens_in: 100,
        tokens_out: 50,
        num_turns: 1,
      }
      rerender(<JobStatusPanel job={completed} events={events} />)
      expect(screen.getByText('Job completed')).toBeInTheDocument()
      // Cost appears in both the header chip and the metric grid.
      expect(screen.getAllByText('$0.4200').length).toBeGreaterThan(0)
    })
  })
})
