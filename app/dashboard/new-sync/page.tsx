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
          console.log('🔄 Re-authentication required, triggering Google sign-in...');
          // Automatically trigger re-authentication
          signIn('google', { callbackUrl: window.location.href });
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="p-2 sm:px-3">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 lg:p-8">
            <div className="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-6">
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600" />
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Add New Calendar Sync
              </h1>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 sm:p-4 mb-4 sm:mb-6">
                <h3 className="text-sm font-medium text-red-800 mb-2">
                  Error Loading Calendars
                </h3>
                <p className="text-sm text-red-700 break-words">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchCalendars}
                  className="mt-2 w-full sm:w-auto"
                >
                  Try Again
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              {/* Sync Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Sync Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  className="input w-full px-3 sm:px-4 py-2 sm:py-3"
                  placeholder="e.g., Work Calendar, Personal Events"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Give your sync a memorable name to identify it later.
                </p>
              </div>

              {/* ICS URL */}
              <div>
                <label htmlFor="icsUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  ICS Calendar URL
                </label>
                <input
                  id="icsUrl"
                  type="url"
                  required
                  className="input w-full px-3 sm:px-4 py-2 sm:py-3 text-sm break-all"
                  placeholder="https://outlook.office365.com/owa/calendar/..."
                  value={formData.icsUrl}
                  onChange={(e) => setFormData({ ...formData, icsUrl: e.target.value })}
                />
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  The ICS feed URL from your source calendar (Outlook, etc.).
                </p>
              </div>

              {/* Google Calendar Selection */}
              <div>
                <label htmlFor="googleCalendarId" className="block text-sm font-medium text-gray-700 mb-2">
                  Target Google Calendar
                </label>
                <select
                  id="googleCalendarId"
                  required
                  className="input w-full px-3 sm:px-4 py-2 sm:py-3"
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
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Choose which Google Calendar will receive the synced events.
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 sm:p-4">
                <h3 className="text-sm font-medium text-blue-800 mb-2">
                  How Sync Works:
                </h3>
                <ul className="text-xs sm:text-sm text-blue-700 space-y-1">
                  <li>• Events are copied without attendees for privacy</li>
                  <li>• Only events from the current month are synced</li>
                  <li>• Automatic sync runs on the 1st of each month</li>
                  <li>• You can manually sync anytime from the dashboard</li>
                </ul>
              </div>

              {/* Submit Button */}
              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4 pt-2">
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button variant="outline" type="button" className="w-full">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-primary-600 hover:bg-primary-700 w-full sm:w-auto"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Sync'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}