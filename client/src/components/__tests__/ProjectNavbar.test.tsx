import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test-utils'
import { ProjectNavbar } from '../ProjectNavbar'

vi.mock('../../context/SidebarPinContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/SidebarPinContext')>()
  return {
    ...actual,
    useSidebarPin: () => ({
      leftPinned: false,
      setLeftPinned: vi.fn(),
      rightPinned: false,
      setRightPinned: vi.fn(),
    }),
  }
})

describe('ProjectNavbar', () => {
  it('renders as a nav element', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders Pin left sidebar button', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('button', { name: /Pin left sidebar/i })).toBeInTheDocument()
  })

  it('renders Pin right sidebar button', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('button', { name: /Pin right sidebar/i })).toBeInTheDocument()
  })
})
