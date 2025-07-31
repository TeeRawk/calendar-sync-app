'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Plus, Settings, LogOut, Play, Trash2, Clock } from 'lucide-react';
import Link from 'next/link';

interface CalendarSync {
  id: string;
  name: string;
  icsUrl: string;
  googleCalendarId: string;
  googleCalendarName: string;
  isActive: boolean;
  lastSync: string | null;
  syncErrors: string[] | null;
}

interface SyncLog {
  id: string;
  eventsProcessed: string;
  eventsCreated: string;
  eventsUpdated: string;
  status: string;
  createdAt: string;
  duration: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      window.location.href = '/';
    },
  });

  const [syncs, setSyncs] = useState<CalendarSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    fetchSyncs();
  }, []);

  const fetchSyncs = async () => {
    try {
      const response = await fetch('/api/syncs');
      if (response.ok) {
        const data = await response.json();
        setSyncs(data);
      }
    } catch (error) {
      console.error('Failed to fetch syncs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async (syncId: string) => {
    setSyncing(syncId);
    try {
      // Get user's timezone
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log(`🌍 Sending user timezone: ${userTimeZone}`);
      
      const response = await fetch(`/api/syncs/${syncId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeZone: userTimeZone,
        }),
      });
      if (response.ok) {
        await fetchSyncs();
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(null);
    }
  };

  const handleDeleteSync = async (syncId: string) => {
    if (!confirm('Are you sure you want to delete this sync?')) return;

    try {
      const response = await fetch(`/api/syncs/${syncId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchSyncs();
      }
    } catch (error) {
      console.error('Failed to delete sync:', error);
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
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600" />
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Calendar Sync</h1>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                {session?.user?.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-gray-600 p-2 sm:px-3"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {session?.user?.name?.split(' ')[0]}!
            </h2>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your calendar syncs and monitor their status.
            </p>
          </div>

          {/* Add New Sync Button */}
          <div className="mb-6 sm:mb-8">
            <Link href="/dashboard/new-sync">
              <Button className="bg-primary-600 hover:bg-primary-700 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add New Calendar Sync
              </Button>
            </Link>
          </div>

          {/* Syncs List */}
          {syncs.length === 0 ? (
            <div className="text-center py-8 sm:py-12 bg-white rounded-lg shadow-sm border">
              <Calendar className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                No Calendar Syncs Yet
              </h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-4">
                Add your first ICS calendar to get started with automatic syncing.
              </p>
              <Link href="/dashboard/new-sync">
                <Button className="bg-primary-600 hover:bg-primary-700 w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Sync
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {syncs.map((sync) => (
                <div key={sync.id} className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 space-y-3 sm:space-y-0">
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-1">
                        {sync.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Syncing to: {sync.googleCalendarName}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 text-sm text-gray-500">
                        <span className={`px-2 py-1 rounded-full w-fit ${
                          sync.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {sync.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {sync.lastSync ? (
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Last sync: {new Date(sync.lastSync).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-yellow-600">Never synced</span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2 sm:flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManualSync(sync.id)}
                        disabled={syncing === sync.id}
                        className="flex-1 sm:flex-initial"
                      >
                        {syncing === sync.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 sm:mr-2" />
                        ) : (
                          <Play className="h-4 w-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">{syncing === sync.id ? 'Syncing...' : 'Sync Now'}</span>
                        <span className="sm:hidden">{syncing === sync.id ? 'Syncing' : 'Sync'}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSync(sync.id)}
                        className="text-red-600 hover:text-red-700 p-2 sm:px-3"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {sync.syncErrors && sync.syncErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-4">
                      <h4 className="text-sm font-medium text-red-800 mb-2">
                        Sync Errors:
                      </h4>
                      <ul className="text-sm text-red-700 space-y-1">
                        {sync.syncErrors.map((error, index) => (
                          <li key={index} className="break-words">• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2 break-all sm:truncate">
                    ICS URL: {sync.icsUrl}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}