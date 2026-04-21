import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test-utils'
import { ModelCombobox } from '../ModelCombobox'

// ─── ModelCombobox ────────────────────────────────────────────────────────────
//
// ModelCombobox is a Radix Select wrapping the three Claude model aliases:
//   sonnet  → label "Sonnet", tier badge "Balanced", full ID "claude-sonnet-4-6"
//   opus    → label "Opus",   tier badge "Most capable", full ID "claude-opus-4-7"
//   haiku   → label "Haiku",  tier badge "Fastest",     full ID "claude-haiku-4-5-20251001"
//
// Tests verify: static render, option display, onChange callback, disabled state.
// Radix Select portals render in document.body — queried via screen.getByRole.

describe('ModelCombobox', () => {
  it('renders without crashing', () => {
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    // The trigger button must be present
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('displays the current value label in the trigger', () => {
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    // The trigger should show the label for the current alias
    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toMatch(/sonnet/i)
  })

  it('displays "opus" label when value is opus', () => {
    render(<ModelCombobox value="opus" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toMatch(/opus/i)
  })

  it('displays "haiku" label when value is haiku', () => {
    render(<ModelCombobox value="haiku" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toMatch(/haiku/i)
  })

  it('opens the dropdown and shows all three model options', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    // All three aliases should be present in the DOM after opening
    expect(screen.getByRole('option', { name: /sonnet/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /opus/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /haiku/i })).toBeInTheDocument()
  })

  it('shows tier badge "Balanced" for sonnet option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/balanced/i)).toBeInTheDocument()
  })

  it('shows tier badge "Most capable" for opus option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/most capable/i)).toBeInTheDocument()
  })

  it('shows tier badge "Fastest" for haiku option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/fastest/i)).toBeInTheDocument()
  })

  it('shows full model ID for sonnet option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/claude-sonnet-4-6/i)).toBeInTheDocument()
  })

  it('shows full model ID for opus option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/claude-opus-4-7/i)).toBeInTheDocument()
  })

  it('shows full model ID for haiku option', async () => {
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/claude-haiku-4-5-20251001/i)).toBeInTheDocument()
  })

  it('calls onChange with "opus" when opus option is selected', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    const opusOption = screen.getByRole('option', { name: /opus/i })
    await user.click(opusOption)
    expect(onChange).toHaveBeenCalledWith('opus')
  })

  it('calls onChange with "haiku" when haiku option is selected', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelCombobox value="sonnet" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    const haikuOption = screen.getByRole('option', { name: /haiku/i })
    await user.click(haikuOption)
    expect(onChange).toHaveBeenCalledWith('haiku')
  })

  it('calls onChange with "sonnet" when sonnet option is selected', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelCombobox value="opus" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    const sonnetOption = screen.getByRole('option', { name: /sonnet/i })
    await user.click(sonnetOption)
    expect(onChange).toHaveBeenCalledWith('sonnet')
  })

  it('does not call onChange when disabled trigger is clicked', async () => {
    const onChange = vi.fn()
    render(<ModelCombobox value="sonnet" onChange={onChange} disabled />)
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    // The dropdown should not open and onChange should not be called
    expect(onChange).not.toHaveBeenCalled()
  })

  it('trigger has disabled attribute when disabled prop is true', () => {
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('trigger is enabled by default (no disabled prop)', () => {
    render(<ModelCombobox value="sonnet" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).not.toBeDisabled()
  })
})
