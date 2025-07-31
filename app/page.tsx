'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, Shield, Clock } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect authenticated users directly to dashboard
  useEffect(() => {
    if (session) {
      router.push('/dashboard');
    }
  }, [session, router]);

  if (status === 'loading' || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="flex justify-center mb-6">
            <div className="bg-primary-100 p-3 sm:p-4 rounded-full">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-primary-600" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
            Sync Your Calendars
            <span className="text-primary-600 block sm:inline"> Effortlessly</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
            Automatically sync your ICS calendar feeds to Google Calendar every month. 
            Keep all your events in one place without the hassle.
          </p>
          <Button 
            size="lg" 
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
          >
            Get Started with Google
            <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
          <div className="text-center p-4 sm:p-6 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
            <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-4">
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              Automatic Sync
            </h3>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              Set it once and forget it. Your calendars sync automatically every month.
            </p>
          </div>

          <div className="text-center p-4 sm:p-6 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
            <div className="bg-blue-100 p-3 rounded-full w-fit mx-auto mb-4">
              <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              Clean Copies
            </h3>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              Events are copied without attendees, keeping your calendar clean and private.
            </p>
          </div>

          <div className="text-center p-4 sm:p-6 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
            <div className="bg-purple-100 p-3 rounded-full w-fit mx-auto mb-4">
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              Multiple Sources
            </h3>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              Sync from multiple ICS feeds to different Google calendars as needed.
            </p>
          </div>
        </div>

        {/* How it Works */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">How It Works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="flex flex-col items-center">
              <div className="bg-primary-600 text-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-lg sm:text-xl font-bold mb-4">
                1
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">Connect Your Google Account</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">Sign in securely with your Google account to access your calendars.</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-primary-600 text-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-lg sm:text-xl font-bold mb-4">
                2
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">Add Your ICS Links</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">Paste your ICS calendar URLs and choose which Google calendar to sync to.</p>
            </div>
            <div className="flex flex-col items-center sm:col-span-2 lg:col-span-1">
              <div className="bg-primary-600 text-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-lg sm:text-xl font-bold mb-4">
                3
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">Enjoy Automatic Sync</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">Your events sync automatically every month, keeping everything up to date.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary-50 rounded-lg p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
            Ready to Sync Your Calendars?
          </h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 leading-relaxed">
            Join thousands of users who have simplified their calendar management.
          </p>
          <Button 
            size="lg" 
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
          >
            Start Syncing Now
          </Button>
        </div>
      </div>
    </div>
  );
}