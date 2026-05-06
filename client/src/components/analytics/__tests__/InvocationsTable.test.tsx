import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../test-utils'
import { InvocationsTable } from '../InvocationsTable'
import type { InvocationRow } from '../../../types/spending'

function row(overrides: Partial<InvocationRow> = {}): InvocationRow {
  return {
    id: 'r1', project_id: 'p1', surface: 'job', surface_ref_id: null, ticket_id: null,
    conversation_id: null, model: 'sonnet', status: 'success',
    started_at: '2026-05-06T10:00:00Z', finished_at: null,
    duration_ms: 1000, duration_api_ms: null,
    tokens_in: 10, tokens_out: 5, tokens_cache_read: 0, tokens_cache_create: 0,
    total_cost_usd: 0.1, num_turns: 1, session_id: null,
    created_at: '2026-05-06T10:00:00Z', ticket_title: null,
    ...overrides,
  }
}

describe('InvocationsTable', () => {
  it('shows empty state when no rows', () => {
    render(
      <InvocationsTable rows={[]} loading={false} truncated={false} totalAvailable={0}
        tableFilters={{}} onTableFiltersChange={() => {}} />
    )
    expect(screen.getByText(/No invocations match/i)).toBeInTheDocument()
  })

  it('renders one row per invocation', () => {
    render(
      <InvocationsTable
        rows={[row({ id: 'a' }), row({ id: 'b', surface: 'explore-spec', ticket_id: 7, ticket_title: 'auth' })]}
        loading={false} truncated={false} totalAvailable={2}
        tableFilters={{}} onTableFiltersChange={() => {}}
      />
    )
    expect(screen.getByText(/auth/)).toBeInTheDocument()
  })

  it('applies status filter via select', () => {
    const onChange = vi.fn()
    render(
      <InvocationsTable rows={[row()]} loading={false} truncated={false} totalAvailable={1}
        tableFilters={{}} onTableFiltersChange={onChange} />
    )
    const select = screen.getByLabelText('Status filter') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'failed' } })
    expect(onChange).toHaveBeenCalledWith({ status: 'failed' })
  })

  it('shows truncation note when truncated', () => {
    render(
      <InvocationsTable rows={[row()]} loading={false} truncated totalAvailable={50000}
        tableFilters={{}} onTableFiltersChange={() => {}} />
    )
    expect(screen.getByText(/Showing first 1 of 50,000/)).toBeInTheDocument()
  })
})
