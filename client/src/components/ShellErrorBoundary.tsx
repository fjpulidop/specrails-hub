import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, X } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Dismiss the crashed shell and return to the board. */
  onClose?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

// Function-component fallback so it can use i18n hooks (and re-render on a hot
// language switch) while the boundary itself stays a class.
function ShellErrorFallback({
  errorMessage,
  onRetry,
  onClose,
}: {
  errorMessage: string | null
  onRetry: () => void
  onClose?: () => void
}) {
  const { t } = useTranslation('nav')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="text-center space-y-2">
        <h2 className="text-base font-semibold">{t('errorBoundary.title')}</h2>
        {errorMessage && (
          <p className="text-xs text-muted-foreground/60 font-mono max-w-md break-words">{errorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('common:actions.retry')}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted/40 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {t('common:actions.close')}
          </button>
        )}
      </div>
    </div>
  )
}

/// Catches a render/effect crash inside the large interactive overlays
/// (Explore Spec, AI Edit) so a thrown error shows a Retry/Close recovery UI
/// instead of silently unmounting the shell and losing the user's in-progress
/// reply.
export class ShellErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ShellErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ShellErrorFallback
          errorMessage={this.state.error?.message ?? null}
          onRetry={this.handleRetry}
          onClose={this.props.onClose}
        />
      )
    }
    return this.props.children
  }
}
