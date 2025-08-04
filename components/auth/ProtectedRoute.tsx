'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { GoogleLoginButton } from './GoogleLoginButton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showInline?: boolean;
}

export function ProtectedRoute({ 
  children, 
  fallback,
  redirectTo = '/dashboard',
  showInline = false 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, error, tokenStatus, clearError } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show token error overlay if authenticated but token has issues
  if (isAuthenticated && (tokenStatus.isExpired || error)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Authentication Required
              </h2>
              <p className="text-gray-600 mb-4">
                {error || 'Your session has expired. Please sign in again to continue.'}
              </p>
            </div>
            
            <div className="space-y-3">
              <GoogleLoginButton 
                fullWidth 
                redirectTo={redirectTo}
              >
                Sign in with Google
              </GoogleLoginButton>
              
              <button
                onClick={clearError}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show authentication required state
  if (!isAuthenticated) {
    if (showInline) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-blue-800">
                Please sign in to access this content.
              </p>
            </div>
            <div className="flex-shrink-0">
              <GoogleLoginButton 
                size="sm" 
                redirectTo={redirectTo}
              >
                Sign In
              </GoogleLoginButton>
            </div>
          </div>
        </div>
      );
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Sign In Required
              </h2>
              <p className="text-gray-600">
                Please sign in with your Google account to access this page.
              </p>
            </div>
            
            <GoogleLoginButton 
              fullWidth 
              size="lg"
              redirectTo={redirectTo}
            >
              Sign in with Google
            </GoogleLoginButton>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated and tokens are valid - render protected content
  return <>{children}</>;
}