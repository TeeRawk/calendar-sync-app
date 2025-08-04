'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar } from 'lucide-react';
import Link from 'next/link';

interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
}

export default function NewSyncPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      window.location.href = '/';
    },
  });

  const router = useRouter();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    icsUrl: '',
    googleCalendarId: '',
  });

  useEffect(() => {
    fetchCalendars();
  }, []);

  const fetchCalendars = async () => {
    try {
      setError(null);
      const response = await fetch('/api/calendars');
      if (response.ok) {
        const data = await response.json();
        console.log('📅 Fetched calendars:', data);
        setCalendars(data.filter((cal: GoogleCalendar) => 
          cal.accessRole === 'owner' || cal.accessRole === 'writer'
        ));
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401 && errorData.error === 'REAUTH_REQUIRED') {
          console.log('🔄 Re-authentication required, cleaning up and triggering Google sign-in...');
          
          // First, reset the auth state in the backend
          try {
            await fetch('/api/debug/reset-auth', { method: 'POST' });
          } catch (resetError) {
            console.warn('Could not reset auth state:', resetError);
          }
          
          // Force a completely fresh consent flow
          const authUrl = new URL('https://accounts.google.com/oauth/revoke');
          authUrl.searchParams.set('token', 'dummy'); // This will fail but clears some state
          
          // Try to clear any cached consent
          try {
            await fetch(authUrl.toString(), { mode: 'no-cors' });
          } catch (e) {
            // Expected to fail, but helps clear state
          }
          
          // Force a fresh consent flow with additional parameters
          signIn('google', { 
            callbackUrl: window.location.href,
            // Force consent and approval prompt
            prompt: 'consent select_account',
            access_type: 'offline',
            include_granted_scopes: 'true'
          });
          return;
        } else if (response.status === 401) {
          setError(errorData.message || 'Authentication expired. Please sign out and sign back in.');
        } else {
          setError(errorData.error || 'Failed to load calendars');
        }
      }
    } catch (error) {
      console.error('Failed to fetch calendars:', error);
      setError('Failed to load calendars. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await fetch('/api/syncs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/dashboard');
      } else {
        alert('Failed to create sync. Please try again.');
      }
    } catch (error) {
      console.error('Failed to create sync:', error);
      alert('Failed to create sync. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center space-mobile">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg sm:text-xl text-gray-600 animate-pulse">Loading calendars...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="container-mobile">
          <div className="nav-mobile">
            <Link href="/dashboard" className="block">
              <Button variant="ghost" size="sm" className="min-w-[44px]">
                <ArrowLeft className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </Button>
            </Link>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate ml-2">
              Add New Sync
            </h1>
          </div>
        </div>
      </header>

      <div className="container-mobile py-4 sm:py-6 lg:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="card-mobile lg:p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-primary-100 p-3 rounded-full">
                <Calendar className="h-8 w-8 text-primary-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Add New Calendar Sync
              </h1>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h3 className="text-base font-bold text-red-800 mb-3 flex items-center">
                  ⚠ Error Loading Calendars
                </h3>
                <p className="text-sm text-red-700 break-words leading-relaxed mb-4">{error}</p>
                <div className="space-mobile">
                  <Button 
                    variant="outline" 
                    onClick={fetchCalendars}
                    fullWidth
                    className="border-red-200 hover:border-red-300 hover:bg-red-50 sm:w-auto"
                  >
                    Try Again
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      try {
                        // Force complete logout
                        await fetch('/api/auth/force-logout', { method: 'POST' });
                        
                        // Clear any browser storage
                        localStorage.clear();
                        sessionStorage.clear();
                        
                        // Force browser to go to home page, then redirect to fresh auth
                        window.location.href = '/?reauth=1';
                      } catch (e) {
                        console.error('Reset failed:', e);
                      }
                    }}
                    fullWidth
                    className="border-red-200 hover:border-red-300 hover:bg-red-50 sm:w-auto"
                  >
                    Force Fresh Login
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-mobile">
              {/* Sync Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="block text-base font-bold text-gray-700">
                  Sync Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  className="input w-full"
                  placeholder="e.g., Work Calendar, Personal Events"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p className="text-sm text-gray-600 leading-relaxed">
                  Give your sync a memorable name to identify it later.
                </p>
              </div>

              {/* ICS URL */}
              <div className="space-y-2">
                <label htmlFor="icsUrl" className="block text-base font-bold text-gray-700">
                  ICS Calendar URL
                </label>
                <input
                  id="icsUrl"
                  type="url"
                  required
                  className="input w-full font-mono text-sm"
                  placeholder="https://outlook.office365.com/owa/calendar/..."
                  value={formData.icsUrl}
                  onChange={(e) => setFormData({ ...formData, icsUrl: e.target.value })}
                />
                <p className="text-sm text-gray-600 leading-relaxed">
                  The ICS feed URL from your source calendar (Outlook, etc.).
                </p>
              </div>

              {/* Google Calendar Selection */}
              <div className="space-y-2">
                <label htmlFor="googleCalendarId" className="block text-base font-bold text-gray-700">
                  Target Google Calendar
                </label>
                <select
                  id="googleCalendarId"
                  required
                  className="input w-full"
                  value={formData.googleCalendarId}
                  onChange={(e) => setFormData({ ...formData, googleCalendarId: e.target.value })}
                >
                  <option value="">Select a calendar...</option>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.summary} {calendar.primary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Choose which Google Calendar will receive the synced events.
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-base font-bold text-blue-800 mb-3 flex items-center">
                  ℹ️ How Sync Works:
                </h3>
                <ul className="text-sm text-blue-700 space-y-2 leading-relaxed">
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">✓</span>
                    Events are copied without attendees for privacy
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">✓</span>
                    Only events from the current month are synced
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">✓</span>
                    Automatic sync runs on the 1st of each month
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2 mt-0.5">✓</span>
                    You can manually sync anytime from the dashboard
                  </li>
                </ul>
              </div>

              {/* Submit Button */}
              <div className="space-mobile pt-4">
                <Button
                  type="submit"
                  disabled={creating}
                  fullWidth
                  className="bg-primary-600 hover:bg-primary-700 shadow-lg hover:shadow-xl transition-all duration-200 sm:w-auto"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                      Creating Sync...
                    </>
                  ) : (
                    'Create Calendar Sync'
                  )}
                </Button>
                <Link href="/dashboard" className="block sm:inline-block">
                  <Button 
                    variant="outline" 
                    type="button" 
                    fullWidth
                    className="sm:w-auto"
                  >
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}