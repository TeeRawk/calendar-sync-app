'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class AuthErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: `auth-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Authentication Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // Here you could send to Sentry, LogRocket, etc.
      console.log('Error ID:', this.state.errorId);
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReportError = () => {
    const { error, errorInfo, errorId } = this.state;
    const errorReport = {
      errorId,
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    // Copy error details to clipboard
    navigator.clipboard.writeText(JSON.stringify(errorReport, null, 2)).then(() => {
      alert('Error details copied to clipboard. Please share with support.');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(errorReport, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Error details copied to clipboard. Please share with support.');
    });
  };

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorId } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-white p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl border border-red-200 p-6 space-y-6">
            {/* Error Icon and Title */}
            <div className="text-center space-y-3">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                Authentication Error
              </h1>
              <p className="text-sm text-gray-600">
                Something went wrong with the authentication system.
              </p>
            </div>

            {/* Error Details (Development only) */}
            {isDevelopment && error && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-800">
                  Error Details (Development)
                </h3>
                <p className="text-xs text-red-600 font-mono break-all">
                  {error.message}
                </p>
                {error.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                      Stack Trace
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border overflow-x-auto">
                      {error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Error ID for Production */}
            {!isDevelopment && errorId && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">
                  Error ID: <span className="font-mono text-gray-800">{errorId}</span>
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={this.handleRetry}
                className="w-full bg-primary-600 hover:bg-primary-700"
                size="lg"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  size="md"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>

                <Button
                  onClick={this.handleReportError}
                  variant="outline"
                  size="md"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Report Issue
                </Button>
              </div>
            </div>

            {/* Help Text */}
            <div className="text-center space-y-2">
              <p className="text-xs text-gray-500">
                If this problem persists, try signing out and signing back in.
              </p>
              {!isDevelopment && (
                <p className="text-xs text-gray-500">
                  Use "Report Issue" to copy error details for support.
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easy wrapping
export function withAuthErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <AuthErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </AuthErrorBoundary>
  );

  WrappedComponent.displayName = `withAuthErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

// Hook for manual error reporting
export function useAuthErrorReporting() {
  const reportError = (error: Error, context?: string) => {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    console.error('Manual error report:', errorReport);

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to external service
    }
  };

  return { reportError };
}

// Specific error boundary for authentication components
export function AuthComponentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AuthErrorBoundary
      fallback={
        <div className="flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-center space-y-2">
            <AlertTriangle className="h-6 w-6 text-red-600 mx-auto" />
            <p className="text-sm text-red-800 font-medium">
              Authentication Component Error
            </p>
            <p className="text-xs text-red-600">
              Please refresh the page or try signing in again.
            </p>
          </div>
        </div>
      }
      onError={(error, errorInfo) => {
        console.error('Auth component error:', error, errorInfo);
      }}
    >
      {children}
    </AuthErrorBoundary>
  );
}