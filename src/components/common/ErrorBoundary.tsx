import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text-main)] mb-1">Something went wrong</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-2">
            <Button onClick={this.handleRetry} icon={<RefreshCw className="w-4 h-4" />}>
              Try Again
            </Button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <pre className="mt-6 p-4 bg-[var(--color-surface)] rounded-xl text-xs text-[var(--color-text-muted)] text-left max-w-lg overflow-auto max-h-48">
              {this.state.error?.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
