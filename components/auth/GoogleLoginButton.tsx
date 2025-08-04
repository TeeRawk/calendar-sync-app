'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContext';

interface GoogleLoginButtonProps {
  children?: React.ReactNode;
  redirectTo?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

const variantStyles = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300',
  outline: 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'
};

const sizeStyles = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg'
};

export function GoogleLoginButton({
  children = 'Sign in with Google',
  redirectTo = '/dashboard',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  className = ''
}: GoogleLoginButtonProps) {
  const { login, isLoading, error } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async () => {
    if (disabled || isLoading || isAuthenticating) return;
    
    setIsAuthenticating(true);
    try {
      await login(redirectTo);
    } catch (error) {
      console.error('Google login failed:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const isDisabled = disabled || isLoading || isAuthenticating;

  return (
    <div className="space-y-2">
      <button
        onClick={handleLogin}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center gap-3 font-medium rounded-lg border transition-colors
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${className}
        `}
      >
        {isAuthenticating ? (
          <>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <GoogleIcon />
            {children}
          </>
        )}
      </button>
      
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

// Pre-built variants
export function PrimaryGoogleButton(props: Omit<GoogleLoginButtonProps, 'variant'>) {
  return <GoogleLoginButton {...props} variant="primary" />;
}

export function SecondaryGoogleButton(props: Omit<GoogleLoginButtonProps, 'variant'>) {
  return <GoogleLoginButton {...props} variant="secondary" />;
}

export function OutlineGoogleButton(props: Omit<GoogleLoginButtonProps, 'variant'>) {
  return <GoogleLoginButton {...props} variant="outline" />;
}

// Google Icon component
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}