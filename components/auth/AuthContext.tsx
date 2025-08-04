'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Session } from 'next-auth';

interface AuthContextType {
  // Authentication state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: Session['user'] | null;
  session: Session | null;
  
  // Token management
  tokenStatus: {
    isExpired: boolean;
    expiringSoon: boolean;
    expiresAt?: number;
    lastRefreshed?: number;
  };
  
  // Authentication actions
  login: (returnUrl?: string) => Promise<void>;
  logout: (revokeToken?: boolean) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  
  // Error handling
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: session, status, update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<{
    isExpired: boolean;
    expiringSoon: boolean;
    expiresAt?: number;
    lastRefreshed?: number;
  }>({
    isExpired: false,
    expiringSoon: false,
    expiresAt: undefined,
    lastRefreshed: undefined
  });

  // Automatic token refresh interval (every 30 minutes)
  useEffect(() => {
    if (!session?.user?.id) return;

    const checkAndRefreshToken = async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'GET',
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          setTokenStatus({
            isExpired: data.token?.isExpired || false,
            expiringSoon: data.token?.expiringSoon || false,
            expiresAt: data.token?.expiresAt,
            lastRefreshed: data.token?.refreshed ? Date.now() : tokenStatus.lastRefreshed
          });

          // Update session if token was refreshed
          if (data.token?.refreshed) {
            await update();
          }
        } else if (response.status === 401) {
          const errorData = await response.json();
          if (errorData.requiresReauth) {
            setError('Authentication expired. Please sign in again.');
          }
        }
      } catch (error) {
        console.error('Token status check failed:', error);
      }
    };

    // Check immediately and then every 30 minutes
    checkAndRefreshToken();
    const interval = setInterval(checkAndRefreshToken, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session?.user?.id, update, tokenStatus.lastRefreshed]);

  // Focus-based token validation
  useEffect(() => {
    const handleFocus = async () => {
      if (session?.user?.id && !document.hidden) {
        try {
          const response = await fetch('/api/auth/refresh', {
            method: 'GET',
            credentials: 'include'
          });

          if (!response.ok && response.status === 401) {
            const errorData = await response.json();
            if (errorData.requiresReauth) {
              setError('Your session has expired. Please sign in again.');
            }
          }
        } catch (error) {
          console.error('Focus token check failed:', error);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [session?.user?.id]);

  // Login function
  const login = async (returnUrl?: string) => {
    try {
      setError(null);
      
      // Use NextAuth's built-in signIn with Google provider
      await signIn('google', { 
        callbackUrl: returnUrl || '/dashboard',
        redirect: true 
      });
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to start authentication process');
    }
  };

  // Logout function
  const logout = async (revokeToken: boolean = false) => {
    try {
      setError(null);
      
      // Call our custom logout endpoint
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokeToken }),
        credentials: 'include'
      });

      // Sign out from NextAuth
      await signOut({ 
        callbackUrl: '/',
        redirect: true 
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Still attempt NextAuth signout
      await signOut({ callbackUrl: '/' });
    }
  };

  // Manual token refresh
  const refreshToken = async (): Promise<boolean> => {
    try {
      setError(null);
      
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setTokenStatus(prev => ({
          ...prev,
          lastRefreshed: Date.now(),
          isExpired: false,
          expiringSoon: false,
          expiresAt: data.expiresAt
        }));

        // Update session
        await update();
        return true;
      } else {
        const errorData = await response.json();
        if (errorData.requiresReauth) {
          setError('Authentication expired. Please sign in again.');
        }
        return false;
      }
    } catch (error) {
      console.error('Manual token refresh failed:', error);
      setError('Failed to refresh authentication');
      return false;
    }
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  const contextValue: AuthContextType = {
    // Authentication state
    isAuthenticated: !!session?.user,
    isLoading: status === 'loading',
    user: session?.user || null,
    session,
    
    // Token management
    tokenStatus,
    
    // Authentication actions
    login,
    logout,
    refreshToken,
    
    // Error handling
    error,
    clearError
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}