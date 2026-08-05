import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {this.props.fallbackMessage || 'An unexpected error occurred. Please try again.'}
            </p>
            {this.state.error && (
              <div className="text-left bg-red-100 p-4 mb-4 rounded overflow-auto text-xs text-red-800 font-mono">
                <strong>{this.state.error.toString()}</strong>
                <br />
                {this.state.error.stack}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="btn-primary text-sm px-4 py-2"
              >
                Try Again
              </button>
              <button
                onClick={() => { window.location.href = '/login'; }}
                className="btn-secondary text-sm px-4 py-2"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
