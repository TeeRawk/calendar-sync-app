'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { GoogleLoginButton } from './GoogleLoginButton';

interface AuthStatusProps {
  variant?: 'full' | 'compact' | 'minimal';
  showActions?: boolean;
  className?: string;
}

export function AuthStatus({ 
  variant = 'full', 
  showActions = true,
  className = '' 
}: AuthStatusProps) {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    tokenStatus, 
    error, 
    logout, 
    refreshToken,
    clearError 
  } = useAuth();

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (variant === 'minimal') {
      return (
        <div className={`flex items-center space-x-2 ${className}`}>
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-sm text-gray-600">Not signed in</span>
          {showActions && (
            <GoogleLoginButton size="sm" variant="outline">
              Sign In
            </GoogleLoginButton>
          )}
        </div>
      );
    }

    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-sm text-red-800">Not authenticated</span>
          </div>
          {showActions && (
            <GoogleLoginButton size="sm" variant="outline">
              Sign In
            </GoogleLoginButton>
          )}
        </div>
      </div>
    );
  }

  // Authenticated user
  const getTokenStatusColor = () => {
    if (tokenStatus.isExpired) return 'bg-red-500';
    if (tokenStatus.expiringSoon) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTokenStatusText = () => {
    if (tokenStatus.isExpired) return 'Token expired';
    if (tokenStatus.expiringSoon) return 'Token expires soon';
    return 'Token valid';
  };

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className={`w-2 h-2 rounded-full ${getTokenStatusColor()}`} />
        <span className="text-sm text-gray-600">
          {user?.name || user?.email}
        </span>
        {showActions && (
          <button
            onClick={() => logout()}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${getTokenStatusColor()}`} />
            <div>
              <p className="text-sm font-medium text-green-800">
                {user?.name || user?.email}
              </p>
              <p className="text-xs text-green-600">
                {getTokenStatusText()}
              </p>
            </div>
          </div>
          {showActions && (
            <div className="flex items-center space-x-2">
              {(tokenStatus.isExpired || tokenStatus.expiringSoon) && (
                <button
                  onClick={refreshToken}
                  className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded"
                >
                  Refresh
                </button>
              )}
              <button
                onClick={() => logout()}
                className="text-xs text-green-600 hover:text-green-800"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded p-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-red-800">{error}</p>
            <button 
              onClick={clearError}
              className="text-xs text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {user?.image && (
              <img 
                src={user.image} 
                alt={user.name || 'User'} 
                className="w-8 h-8 rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-gray-900">
                {user?.name || 'Unknown User'}
              </p>
              <p className="text-sm text-gray-600">
                {user?.email}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${getTokenStatusColor()}`} />
        </div>

        <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Status:</span> {getTokenStatusText()}
            </div>
            <div>
              <span className="font-medium">Expires:</span>{' '}
              {tokenStatus.expiresAt 
                ? new Date(tokenStatus.expiresAt * 1000).toLocaleString()
                : 'Unknown'}
            </div>
            {tokenStatus.lastRefreshed && (
              <div className="col-span-2">
                <span className="font-medium">Last refreshed:</span>{' '}
                {new Date(tokenStatus.lastRefreshed).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <div className="space-x-2">
              {(tokenStatus.isExpired || tokenStatus.expiringSoon) && (
                <button
                  onClick={refreshToken}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                >
                  Refresh Token
                </button>
              )}
              <button
                onClick={() => logout(false)}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Sign Out
              </button>
            </div>
            <button
              onClick={() => logout(true)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Sign Out & Revoke
            </button>
          </div>
        )}
      </div>
    </div>
  );
}