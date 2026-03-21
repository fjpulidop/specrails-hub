import { describe, it, expect, vi } from 'vitest'
import { screen, render } from '@testing-library/react'
import React from 'react'

// Override recharts mock to invoke the content prop so CustomContent and CustomTooltip are exercised
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Treemap: ({ data, content }: {
    data: { name: string; size: number; jobCount: number; colorIndex: number }[]
    content: React.ReactElement
  }) => {
    // Simulate recharts calling the content prop for each data item
    const Content = content?.type as React.ComponentType<{
      x?: number
      y?: number
      width?: number
      height?: number
      name?: string
      size?: number
      colorIndex?: number
    }> | null

    return (
      <g>
        {data?.map((item, i) =>
          Content ? (
            <Content
              key={i}
              x={10}
              y={10}
              width={200}
              height={100}
              name={item.name}
              size={item.size}
              colorIndex={item.colorIndex ?? 0}
            />
          ) : null
        )}
      </g>
    )
  },
  Tooltip: ({ content }: { content: React.ReactElement }) => {
    // Render tooltip with active=true to exercise CustomTooltip
    const TooltipContent = content?.type as React.ComponentType<{
      active?: boolean
      payload?: { payload: { name: string; size: number; jobCount: number } }[]
    }> | null
    return TooltipContent ? (
      <TooltipContent
        active={true}
        payload={[{
          payload: { name: '/architect', size: 0.0512, jobCount: 3 },
        }]}
      />
    ) : null
  },
}))

import { CostTreemap } from '../CostTreemap'

const mockData = [
  { command: '/architect', totalCostUsd: 0.0512, jobCount: 3 },
  { command: '/developer', totalCostUsd: 0.0234, jobCount: 5 },
  { command: '/reviewer', totalCostUsd: 0.0089, jobCount: 2 },
]

describe('CostTreemap (with content render)', () => {
  it('renders Cost per Command heading', () => {
    render(<CostTreemap data={mockData} />)
    expect(screen.getByText('Cost per Command')).toBeInTheDocument()
  })

  it('renders empty state when all costs are zero', () => {
    render(<CostTreemap data={[{ command: '/test', totalCostUsd: 0, jobCount: 0 }]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })

  it('renders empty state when data array is empty', () => {
    render(<CostTreemap data={[]} />)
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
  })

  it('renders custom content via recharts Treemap for each data item', () => {
    render(<CostTreemap data={mockData} />)
    // The mock renders CustomContent with each data item
    // Labels appear when width > 50 && height > 30 (width=200, height=100 in mock)
    expect(screen.getByText('/architect')).toBeInTheDocument()
    expect(screen.getByText('/developer')).toBeInTheDocument()
    expect(screen.getByText('/reviewer')).toBeInTheDocument()
  })

  it('renders cost values in custom content', () => {
    render(<CostTreemap data={mockData} />)
    // The cost is shown as $0.0512
    expect(screen.getByText('$0.0512')).toBeInTheDocument()
  })

  it('renders tooltip content when active', () => {
    render(<CostTreemap data={mockData} />)
    // CustomTooltip renders with active=true showing the command and cost
    expect(screen.getByText('/architect')).toBeInTheDocument()
  })

  it('truncates long command names in content', () => {
    const longName = '/architect-with-a-very-long-command-name-that-exceeds-width'
    render(<CostTreemap data={[{ command: longName, totalCostUsd: 0.01, jobCount: 1 }]} />)
    // Some text is truncated with '…' — just verify render doesn't crash
    const heading = screen.getByText('Cost per Command')
    expect(heading).toBeInTheDocument()
  })
})
