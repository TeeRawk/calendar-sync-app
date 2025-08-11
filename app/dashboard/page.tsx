'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
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

function DashboardContent() {
  const { data: session } = useSession();
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
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
      
      const response = await fetch(`/api/syncs/${syncId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeZone: userTimeZone,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const result = await response.json();
        console.log('🎉 Sync completed:', result);
        await fetchSyncs();
      } else {
        const errorData = await response.json();
        console.error('❌ Sync failed:', errorData);
        alert(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('⏰ Sync timeout after 5 minutes');
        alert('Sync is taking longer than expected. Please check back in a few minutes.');
      } else {
        console.error('Sync failed:', error);
        alert('Sync failed. Please try again.');
      }
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center space-mobile">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg sm:text-xl text-gray-600 animate-pulse">Loading your dashboard...</p>
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
            <div className="flex items-center space-x-3">
              <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-primary-600" />
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">Calendar Sync</h1>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <span className="text-sm text-gray-600 hidden sm:block max-w-32 truncate">
                {session?.user?.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-gray-600 min-w-[44px]"
              >
                <LogOut className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-mobile py-4 sm:py-6 lg:py-8">
        <div className="max-w-6xl mx-auto space-mobile">
          {/* Welcome Section */}
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 sm:p-6 border border-primary-100">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
              Welcome back, {session?.user?.name?.split(' ')[0] || 'there'}!
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Manage your calendar syncs and monitor their status.
            </p>
          </div>

          {/* Add New Sync Button */}
          <div className="px-4 sm:px-0">
            <Link href="/dashboard/new-sync" className="block sm:inline-block">
              <Button 
                fullWidth 
                className="bg-primary-600 hover:bg-primary-700 sm:w-auto shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add New Calendar Sync
              </Button>
            </Link>
          </div>

          {/* Syncs List */}
          {syncs.length === 0 ? (
            <div className="card-mobile text-center py-8 sm:py-12">
              <Calendar className="h-16 w-16 sm:h-20 sm:w-20 text-gray-300 mx-auto mb-6" />
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                No Calendar Syncs Yet
              </h3>
              <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed max-w-md mx-auto">
                Add your first ICS calendar to get started with automatic syncing.
              </p>
              <Link href="/dashboard/new-sync" className="block sm:inline-block">
                <Button 
                  fullWidth 
                  className="bg-primary-600 hover:bg-primary-700 sm:w-auto shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Your First Sync
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-mobile">
              {syncs.map((sync) => (
                <div key={sync.id} className="card-mobile hover:shadow-lg transition-all duration-200">
                  <div className="flex flex-col space-y-4">
                    <div className="flex-1">
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                        {sync.name}
                      </h3>
                      <p className="text-base sm:text-lg text-gray-600 mb-3">
                        Syncing to: <span className="font-medium">{sync.googleCalendarName}</span>
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 text-sm text-gray-500">
                        <span className={`px-3 py-2 rounded-full w-fit font-medium text-sm ${
                          sync.isActive 
                            ? 'bg-green-100 text-green-800 border border-green-200' 
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {sync.isActive ? '✓ Active' : '○ Inactive'}
                        </span>
                        {sync.lastSync ? (
                          <span className="flex items-center text-base">
                            <Clock className="h-4 w-4 mr-2" />
                            Last sync: {new Date(sync.lastSync).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium">⚠ Never synced</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                      <Button
                        variant="outline"
                        onClick={() => handleManualSync(sync.id)}
                        disabled={syncing === sync.id}
                        fullWidth
                        className="sm:flex-1 border-primary-200 hover:border-primary-300 hover:bg-primary-50"
                      >
                        {syncing === sync.id ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Play className="h-5 w-5 mr-2" />
                            Sync Now
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDeleteSync(sync.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 min-w-[44px] sm:w-auto"
                      >
                        <Trash2 className="h-5 w-5" />
                        <span className="ml-2 sm:hidden">Delete</span>
                      </Button>
                    </div>
                  </div>

                  {sync.syncErrors && sync.syncErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                      <h4 className="text-base font-bold text-red-800 mb-3">
                        ⚠ Sync Errors:
                      </h4>
                      <ul className="text-sm text-red-700 space-y-2">
                        {sync.syncErrors.map((error, index) => (
                          <li key={index} className="break-words leading-relaxed">• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-sm text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">ICS URL:</span>
                    <div className="break-all mt-1 font-mono text-xs">{sync.icsUrl}</div>
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

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center space-mobile">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg sm:text-xl text-gray-600 animate-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center space-y-4">
          <p className="text-lg text-gray-600">Please sign in to access your dashboard</p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return <DashboardContent />;
}