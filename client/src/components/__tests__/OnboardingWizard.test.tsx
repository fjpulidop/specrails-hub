import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { OnboardingWizard, hasSeenOnboarding, resetOnboarding } from '../OnboardingWizard'

describe('OnboardingWizard', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    localStorage.clear()
  })

  it('renders the first step when open', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    expect(screen.getByText('Welcome to specrails-hub')).toBeTruthy()
    expect(screen.getByTestId('onboarding-wizard')).toBeTruthy()
  })

  it('does not render when closed', () => {
    render(<OnboardingWizard open={false} onClose={onClose} />)
    expect(screen.queryByTestId('onboarding-wizard')).toBeNull()
  })

  it('navigates to the next step on Next click', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText('Specialized Agents')).toBeTruthy()
  })

  it('navigates back on Back click', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    // Go to step 2
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText('Specialized Agents')).toBeTruthy()
    // Go back
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByText('Welcome to specrails-hub')).toBeTruthy()
  })

  it('navigates through all 4 steps', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    const titles = [
      'Welcome to specrails-hub',
      'Specialized Agents',
      'Multi-Project Hub',
      'Command Palette',
    ]
    expect(screen.getByText(titles[0])).toBeTruthy()
    for (let i = 1; i < titles.length; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'))
      expect(screen.getByText(titles[i])).toBeTruthy()
    }
  })

  it('closes and dismisses on "Get Started" (last step)', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    // Navigate to the last step (4 steps total, so 3 clicks)
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'))
    }
    expect(screen.getByText('Get Started')).toBeTruthy()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(onClose).toHaveBeenCalled()
  })

  it('dismisses on close when "Don\'t show again" is checked', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-dismiss-checkbox'))
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(onClose).toHaveBeenCalled()
    expect(hasSeenOnboarding()).toBe(true)
  })

  it('does not dismiss on skip when checkbox is unchecked', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(onClose).toHaveBeenCalled()
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('shows the "Don\'t show again" checkbox only on the first step', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    expect(screen.getByTestId('onboarding-dismiss-checkbox')).toBeTruthy()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.queryByTestId('onboarding-dismiss-checkbox')).toBeNull()
  })

  it('step dots allow jumping to a specific step', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    const dots = screen.getAllByRole('button', { name: /Go to step/ })
    expect(dots).toHaveLength(4)
    fireEvent.click(dots[3]) // Jump to step 4
    expect(screen.getByText('Command Palette')).toBeTruthy()
  })
})

describe('hasSeenOnboarding / resetOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns false when not dismissed', () => {
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('returns true after onboarding is dismissed', () => {
    localStorage.setItem('specrails-hub:onboarding-dismissed', 'true')
    expect(hasSeenOnboarding()).toBe(true)
  })

  it('resets the onboarding state', () => {
    localStorage.setItem('specrails-hub:onboarding-dismissed', 'true')
    resetOnboarding()
    expect(hasSeenOnboarding()).toBe(false)
  })
})
