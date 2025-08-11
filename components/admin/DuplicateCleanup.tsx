'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DuplicateGroup {
  primaryEvent: {
    id?: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    created?: string;
  };
  duplicates: Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    created?: string;
  }>;
  matchType: 'exact' | 'fuzzy' | 'pattern';
  confidence: number;
}

interface CleanupAnalysis {
  totalEvents: number;
  duplicateGroups: DuplicateGroup[];
  potentialDeletions: number;
  summary: {
    exactMatches: number;
    fuzzyMatches: number;
    patternMatches: number;
  };
}

interface CleanupResult {
  duplicatesFound: number;
  duplicatesDeleted: number;
  eventsPreserved: number;
  deletedEventIds: string[];
  errors: string[];
  duration: number;
}

export function DuplicateCleanup() {
  const [calendarIds, setCalendarIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CleanupAnalysis | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('analyze');
  
  // Cleanup options
  const [maxDeletions, setMaxDeletions] = useState(25);
  const [preserveOldest, setPreserveOldest] = useState(true);
  const [skipWithAttendees, setSkipWithAttendees] = useState(true);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [titlePatterns, setTitlePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');

  const parseCalendarIds = (input: string): string[] => {
    return input
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  };

  const buildCleanupOptions = (mode: 'dry-run' | 'batch' = 'dry-run') => ({
    mode,
    maxDeletions,
    preserveOldest,
    skipWithAttendees,
    ...(dateRangeStart && dateRangeEnd ? {
      dateRange: {
        start: new Date(dateRangeStart).toISOString(),
        end: new Date(dateRangeEnd).toISOString(),
      }
    } : {}),
    ...(titlePatterns.trim() ? {
      titlePatterns: titlePatterns.split(',').map(p => p.trim()).filter(p => p)
    } : {}),
    ...(excludePatterns.trim() ? {
      excludePatterns: excludePatterns.split(',').map(p => p.trim()).filter(p => p)
    } : {}),
  });

  const analyzeHandler = async () => {
    const ids = parseCalendarIds(calendarIds);
    
    if (ids.length === 0) {
      setError('Please enter at least one calendar ID');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/admin/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          calendarIds: ids,
          options: buildCleanupOptions(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysis(data.analysis);
      setActiveTab('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const cleanupHandler = async (dryRun: boolean = true) => {
    const ids = parseCalendarIds(calendarIds);
    
    if (ids.length === 0) {
      setError('Please enter at least one calendar ID');
      return;
    }

    if (!dryRun && !confirm('Are you sure you want to delete duplicate events? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);
    setCleanupResult(null);

    try {
      const options = buildCleanupOptions(dryRun ? 'dry-run' : 'batch');
      
      const response = await fetch('/api/admin/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanup',
          calendarIds: ids,
          options: {
            ...options,
            ...(dryRun ? {} : { confirmDeletion: true }),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Cleanup failed');
      }

      setCleanupResult(data.result);
      setActiveTab('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateTime?: string) => {
    if (!dateTime) return 'Unknown';
    return new Date(dateTime).toLocaleString();
  };

  const getMatchTypeBadgeColor = (matchType: string) => {
    switch (matchType) {
      case 'exact': return 'bg-red-500';
      case 'pattern': return 'bg-orange-500';
      case 'fuzzy': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🧹 Duplicate Calendar Cleanup</CardTitle>
          <CardDescription>
            Analyze and clean up duplicate events in your Google Calendar. Always run analysis first to preview changes.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>📊 Analysis Settings</CardTitle>
              <CardDescription>Configure analysis parameters to find duplicates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Calendar IDs (comma-separated)</label>
                <input
                  type="text"
                  value={calendarIds}
                  onChange={(e) => setCalendarIds(e.target.value)}
                  placeholder="primary, calendar1@gmail.com, calendar2@gmail.com"
                  className="w-full border rounded-md px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use "primary" for your main calendar, or specific calendar IDs
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range Start</label>
                  <input
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range End</label>
                  <input
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Title Patterns (comma-separated)</label>
                <input
                  type="text"
                  value={titlePatterns}
                  onChange={(e) => setTitlePatterns(e.target.value)}
                  placeholder="Meeting, Call, Sync"
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Exclude Patterns (comma-separated)</label>
                <input
                  type="text"
                  value={excludePatterns}
                  onChange={(e) => setExcludePatterns(e.target.value)}
                  placeholder="Important, VIP, Critical"
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={analyzeHandler} 
                disabled={loading || !calendarIds.trim()}
                className="w-full"
              >
                {loading ? '🔍 Analyzing...' : '🔍 Analyze Duplicates'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="cleanup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>🧹 Cleanup Settings</CardTitle>
              <CardDescription>Configure cleanup parameters and safety options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Deletions</label>
                <input
                  type="number"
                  value={maxDeletions}
                  onChange={(e) => setMaxDeletions(parseInt(e.target.value) || 25)}
                  min="1"
                  max="100"
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="preserveOldest"
                    checked={preserveOldest}
                    onChange={(e) => setPreserveOldest(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="preserveOldest" className="text-sm">
                    Preserve oldest event in each duplicate group
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="skipWithAttendees"
                    checked={skipWithAttendees}
                    onChange={(e) => setSkipWithAttendees(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="skipWithAttendees" className="text-sm">
                    Skip events with attendees (safer)
                  </label>
                </div>
              </div>
            </CardContent>
            <CardFooter className="space-x-2">
              <Button 
                onClick={() => cleanupHandler(true)} 
                disabled={loading || !calendarIds.trim()}
                variant="outline"
                className="flex-1"
              >
                {loading ? '👁️ Previewing...' : '👁️ Dry Run (Preview)'}
              </Button>
              <Button 
                onClick={() => cleanupHandler(false)} 
                disabled={loading || !calendarIds.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? '🗑️ Deleting...' : '🗑️ Delete Duplicates'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {analysis && (
            <Card>
              <CardHeader>
                <CardTitle>📊 Analysis Results</CardTitle>
                <CardDescription>Found duplicate groups in your calendar</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold">{analysis.totalEvents}</div>
                    <div className="text-sm text-gray-500">Total Events</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold text-orange-600">{analysis.duplicateGroups.length}</div>
                    <div className="text-sm text-gray-500">Duplicate Groups</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold text-red-600">{analysis.potentialDeletions}</div>
                    <div className="text-sm text-gray-500">Potential Deletions</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold text-green-600">{analysis.totalEvents - analysis.potentialDeletions}</div>
                    <div className="text-sm text-gray-500">Will Preserve</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Duplicate Groups:</h4>
                  {analysis.duplicateGroups.slice(0, 10).map((group, index) => (
                    <div key={index} className="border rounded p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium">Group {index + 1}</h5>
                        <div className="flex space-x-2">
                          <Badge className={getMatchTypeBadgeColor(group.matchType)}>
                            {group.matchType}
                          </Badge>
                          <Badge variant="outline">
                            {Math.round(group.confidence * 100)}% confidence
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="p-2 bg-green-50 border border-green-200 rounded">
                          <div className="font-medium text-green-800">✅ Keep:</div>
                          <div>{group.primaryEvent.summary}</div>
                          <div className="text-xs text-green-600">
                            {formatDateTime(group.primaryEvent.start?.dateTime)}
                          </div>
                        </div>
                        
                        {group.duplicates.map((duplicate, dupIndex) => (
                          <div key={dupIndex} className="p-2 bg-red-50 border border-red-200 rounded">
                            <div className="font-medium text-red-800">🗑️ Delete:</div>
                            <div>{duplicate.summary}</div>
                            <div className="text-xs text-red-600">
                              {formatDateTime(duplicate.start?.dateTime)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {analysis.duplicateGroups.length > 10 && (
                    <p className="text-sm text-gray-500 text-center">
                      ... and {analysis.duplicateGroups.length - 10} more groups
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {cleanupResult && (
            <Card>
              <CardHeader>
                <CardTitle>🎯 Cleanup Results</CardTitle>
                <CardDescription>Summary of the cleanup operation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold">{cleanupResult.duplicatesFound}</div>
                    <div className="text-sm text-gray-500">Found</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold text-red-600">{cleanupResult.duplicatesDeleted}</div>
                    <div className="text-sm text-gray-500">Deleted</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold text-green-600">{cleanupResult.eventsPreserved}</div>
                    <div className="text-sm text-gray-500">Preserved</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-2xl font-bold">{cleanupResult.duration}ms</div>
                    <div className="text-sm text-gray-500">Duration</div>
                  </div>
                </div>

                {cleanupResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <div>Errors occurred during cleanup:</div>
                      <ul className="list-disc pl-4 mt-2">
                        {cleanupResult.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}