'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { Calendar, Shield, Clock } from 'lucide-react';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-mobile py-6 sm:py-12 lg:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12 lg:mb-16 space-mobile">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="bg-primary-100 p-4 sm:p-5 lg:p-6 rounded-full shadow-sm">
              <Calendar className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-primary-600" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight tracking-tight">
            Sync Your Calendars
            <span className="text-primary-600 block mt-1 sm:mt-0 sm:inline"> Effortlessly</span>
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed px-4 sm:px-0">
            Automatically sync your ICS calendar feeds to Google Calendar every month. 
            Keep all your events in one place without the hassle.
          </p>
          <div className="px-4 sm:px-0">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg border border-blue-600 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Get Started with Google
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid-mobile grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8 sm:mb-12 lg:mb-16">
          <div className="card-mobile text-center hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
            <div className="bg-green-100 p-4 rounded-full w-fit mx-auto mb-4 shadow-sm">
              <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Automatic Sync
            </h3>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
              Set it once and forget it. Your calendars sync automatically every month.
            </p>
          </div>

          <div className="card-mobile text-center hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
            <div className="bg-blue-100 p-4 rounded-full w-fit mx-auto mb-4 shadow-sm">
              <Shield className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Clean Copies
            </h3>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
              Events are copied without attendees, keeping your calendar clean and private.
            </p>
          </div>

          <div className="card-mobile text-center hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1 sm:col-span-2 lg:col-span-1">
            <div className="bg-purple-100 p-4 rounded-full w-fit mx-auto mb-4 shadow-sm">
              <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-purple-600" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Multiple Sources
            </h3>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
              Sync from multiple ICS feeds to different Google calendars as needed.
            </p>
          </div>
        </div>

        {/* How it Works */}
        <div className="text-center mb-8 sm:mb-12 lg:mb-16 space-mobile">
          <h2 className="heading-mobile font-bold text-gray-900 mb-6 sm:mb-8">How It Works</h2>
          <div className="grid-mobile grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col items-center p-4 sm:p-6">
              <div className="bg-primary-600 text-white rounded-full w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-xl sm:text-2xl font-bold mb-4 shadow-lg">
                1
              </div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 text-gray-900">Connect Your Google Account</h3>
              <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-sm">Sign in securely with your Google account to access your calendars.</p>
            </div>
            <div className="flex flex-col items-center p-4 sm:p-6">
              <div className="bg-primary-600 text-white rounded-full w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-xl sm:text-2xl font-bold mb-4 shadow-lg">
                2
              </div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 text-gray-900">Add Your ICS Links</h3>
              <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-sm">Paste your ICS calendar URLs and choose which Google calendar to sync to.</p>
            </div>
            <div className="flex flex-col items-center p-4 sm:p-6 sm:col-span-2 lg:col-span-1">
              <div className="bg-primary-600 text-white rounded-full w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-xl sm:text-2xl font-bold mb-4 shadow-lg">
                3
              </div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 text-gray-900">Enjoy Automatic Sync</h3>
              <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-sm">Your events sync automatically every month, keeping everything up to date.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 sm:p-8 lg:p-10 shadow-lg border border-primary-100">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
            Ready to Sync Your Calendars?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 leading-relaxed max-w-3xl mx-auto px-4 sm:px-0">
            Join thousands of users who have simplified their calendar management.
          </p>
          <div className="px-4 sm:px-0">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg border border-blue-600 transition-colors transform hover:-translate-y-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Start Syncing Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}