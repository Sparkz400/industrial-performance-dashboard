import React from 'react';

interface FallbackComponentProps {
  error: Error | null;
  resetErrorBoundary: () => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  FallbackComponent?: React.ComponentType<FallbackComponentProps>;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error to an error reporting service
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    // Optional: log to a service like Sentry or LogRocket
    // if (typeof window.logErrorToService === 'function') {
    //   window.logErrorToService(error, errorInfo);
    // }
  }

  resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });

    // Call the onReset callback if provided
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { FallbackComponent, children } = this.props;

    if (hasError) {
      // You can render any custom fallback UI
      if (FallbackComponent) {
        return <FallbackComponent error={error} resetErrorBoundary={this.resetErrorBoundary} />;
      }

      // Default fallback UI if no component is provided
      return (
        <div
          style={{
            padding: '20px',
            margin: '20px',
            border: '1px solid var(--industrial-edge)',
            borderRadius: '4px',
            backgroundColor: 'var(--industrial-raised)',
            color: 'var(--industrial-ink)',
          }}
        >
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>
            <summary>Show details</summary>
            {error?.toString() || 'Unknown error'}
          </details>
          <button
            onClick={this.resetErrorBoundary}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--industrial-accent)',
              color: 'var(--industrial-on-accent)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
