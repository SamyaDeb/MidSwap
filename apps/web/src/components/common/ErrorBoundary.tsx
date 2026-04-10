import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface rounded-2xl border border-white/10 p-6 text-center">
            <div className="text-red-400 text-5xl mb-4">⚠</div>
            <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
            <p className="text-white/60 text-sm mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <details className="text-left mb-4">
              <summary className="text-xs text-white/40 cursor-pointer mb-1">Stack trace</summary>
              <pre className="text-xs text-white/30 overflow-auto max-h-40 bg-midnight rounded-lg p-2 whitespace-pre-wrap">
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-accent-primary/20 text-accent-primary rounded-lg hover:bg-accent-primary/30 transition-colors text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
