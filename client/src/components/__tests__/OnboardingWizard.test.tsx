import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { OnboardingWizard, hasSeenOnboarding, resetOnboarding } from '../OnboardingWizard'

const STEP_TITLES = [
  'Welcome to specrails-hub',
  'Turn ideas into specs',
  'Run the pipeline on rails',
  'Bring your own agent',
  'Track every cent',
  'Make it your workspace',
  'Move at the speed of thought',
]

describe('OnboardingWizard', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    localStorage.clear()
  })

  it('renders the first step when open', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    expect(screen.getByText(STEP_TITLES[0])).toBeTruthy()
    expect(screen.getByTestId('onboarding-wizard')).toBeTruthy()
  })

  it('does not render when closed', () => {
    render(<OnboardingWizard open={false} onClose={onClose} />)
    expect(screen.queryByTestId('onboarding-wizard')).toBeNull()
  })

  it('navigates to the next step on Next click', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText(STEP_TITLES[1])).toBeTruthy()
  })

  it('navigates back on Back click', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText(STEP_TITLES[1])).toBeTruthy()
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByText(STEP_TITLES[0])).toBeTruthy()
  })

  it('navigates through all 7 steps', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    expect(screen.getByText(STEP_TITLES[0])).toBeTruthy()
    for (let i = 1; i < STEP_TITLES.length; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'))
      expect(screen.getByText(STEP_TITLES[i])).toBeTruthy()
    }
  })

  it('shows "Get Started" on the last step and dismisses on click', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    for (let i = 0; i < STEP_TITLES.length - 1; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'))
    }
    expect(screen.getByText('Get Started')).toBeTruthy()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(onClose).toHaveBeenCalled()
    // Completing the whole tour counts as "seen".
    expect(hasSeenOnboarding()).toBe(true)
  })

  it('dismisses on skip when "Don\'t show again" is checked', () => {
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

  it('shows Back instead of Skip after the first step', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    expect(screen.getByTestId('onboarding-skip')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-back')).toBeNull()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.queryByTestId('onboarding-skip')).toBeNull()
    expect(screen.getByTestId('onboarding-back')).toBeTruthy()
  })

  it('left-nav step buttons allow jumping to a specific step', () => {
    render(<OnboardingWizard open={true} onClose={onClose} />)
    const navButtons = screen.getAllByRole('button', { name: /^Go to step/ })
    expect(navButtons).toHaveLength(STEP_TITLES.length)
    fireEvent.click(navButtons[STEP_TITLES.length - 1]) // jump to last step
    expect(screen.getByText(STEP_TITLES[STEP_TITLES.length - 1])).toBeTruthy()
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
