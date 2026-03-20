import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  projectName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ProjectErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ProjectErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const { projectName } = this.props
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="text-center space-y-2">
            <h2 className="text-base font-semibold">Something went wrong</h2>
            {projectName && (
              <p className="text-sm text-muted-foreground">
                An error occurred in <span className="font-medium">{projectName}</span>
              </p>
            )}
            {this.state.error && (
              <p className="text-xs text-muted-foreground/60 font-mono">{this.state.error.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
