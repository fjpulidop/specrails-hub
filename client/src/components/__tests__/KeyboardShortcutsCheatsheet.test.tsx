import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test-utils'
import { KeyboardShortcutsCheatsheet } from '../KeyboardShortcutsCheatsheet'

describe('KeyboardShortcutsCheatsheet', () => {
  it('renders the cheatsheet when open', () => {
    render(
      <KeyboardShortcutsCheatsheet open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByTestId('shortcuts-cheatsheet')).toBeInTheDocument()
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(
      <KeyboardShortcutsCheatsheet open={false} onOpenChange={vi.fn()} />,
    )
    expect(screen.queryByTestId('shortcuts-cheatsheet')).not.toBeInTheDocument()
  })

  it('displays all shortcut categories', () => {
    render(
      <KeyboardShortcutsCheatsheet open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('displays navigation shortcut descriptions', () => {
    render(
      <KeyboardShortcutsCheatsheet open={true} onOpenChange={vi.fn()} />,
    )
    expect(
      screen.getByText('Navigate to project page (Dashboard/Jobs/Analytics/Agents/Settings)'),
    ).toBeInTheDocument()
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Go to Analytics')).toBeInTheDocument()
    expect(screen.getByText('Go to Settings')).toBeInTheDocument()
  })
})
