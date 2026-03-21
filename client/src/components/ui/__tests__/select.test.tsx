import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../../test-utils'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '../select'

describe('Select components', () => {
  it('renders SelectTrigger with placeholder text', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
      </Select>
    )
    expect(screen.getByText('Choose an option')).toBeInTheDocument()
  })

  it('renders SelectTrigger as a button element', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeInTheDocument()
  })

  it('SelectTrigger accepts custom className', () => {
    render(
      <Select>
        <SelectTrigger className="my-custom-class">
          <SelectValue placeholder="Option" />
        </SelectTrigger>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('my-custom-class')
  })

  it('SelectTrigger is disabled when disabled prop is set', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeDisabled()
  })

  it('SelectTrigger has correct displayName', () => {
    expect(SelectTrigger.displayName).toBeDefined()
  })

  it('SelectScrollUpButton has correct displayName', () => {
    expect(SelectScrollUpButton.displayName).toBeDefined()
  })

  it('SelectScrollDownButton has correct displayName', () => {
    expect(SelectScrollDownButton.displayName).toBeDefined()
  })

  it('SelectContent has correct displayName', () => {
    expect(SelectContent.displayName).toBeDefined()
  })

  it('SelectLabel has correct displayName', () => {
    expect(SelectLabel.displayName).toBeDefined()
  })

  it('SelectItem has correct displayName', () => {
    expect(SelectItem.displayName).toBeDefined()
  })

  it('SelectSeparator has correct displayName', () => {
    expect(SelectSeparator.displayName).toBeDefined()
  })

  it('renders SelectGroup wrapping items', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    )
    // Trigger renders in the DOM
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('Select has an accessible combobox role', () => {
    render(
      <Select defaultValue="opt1">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opt1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
