'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'OAuthAccountNotLinked':
        return {
          title: 'Account Linking Issue',
          message: 'There was a problem linking your Google account. This usually happens when there are conflicting user records.',
          action: 'Try signing in again with a fresh authentication flow.'
        };
      case 'OAuthCallback':
        return {
          title: 'OAuth Callback Error',
          message: 'There was an issue during the Google authentication callback.',
          action: 'Please try signing in again.'
        };
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          message: 'You denied access to the required permissions.',
          action: 'Please grant calendar permissions to use this app.'
        };
      default:
        return {
          title: 'Authentication Error',
          message: 'An unexpected error occurred during authentication.',
          action: 'Please try signing in again.'
        };
    }
  };

  const errorInfo = getErrorMessage(error);

  const handleForceReset = async () => {
    try {
      // Clear any stored auth data
      await fetch('/api/debug/reset-auth', { method: 'POST' });
      
      // Clear browser storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Redirect to home page for fresh auth
      window.location.href = '/?reauth=1';
    } catch (e) {
      console.error('Reset failed:', e);
      // Fallback - just go to home page
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-red-100 p-3 rounded-full">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
          {errorInfo.title}
        </h1>
        
        <p className="text-gray-600 text-center mb-6">
          {errorInfo.message}
        </p>
        
        <div className="space-y-3">
          <Button 
            onClick={handleForceReset}
            className="w-full bg-primary-600 hover:bg-primary-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset & Try Again
          </Button>
          
          <Link href="/" className="block">
            <Button variant="outline" className="w-full">
              Back to Home
            </Button>
          </Link>
        </div>
        
        {error && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-500">
            Error code: {error}
          </div>
        )}
      </div>
    </div>
  );
}