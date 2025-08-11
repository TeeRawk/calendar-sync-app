'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Download, 
  Eye, 
  Loader2, 
  Play, 
  RefreshCw, 
  Settings, 
  Trash2,
  Upload,
  XCircle 
} from 'lucide-react';

interface DuplicateGroup {
  primaryEvent: {
    id: string;
    title: string;
    startDateTime: string;
    calendarId: string;
  };
  duplicates: Array<{
    id: string;
    title: string;
    startDateTime: string;
    calendarId: string;
  }>;
  matchType: 'exact' | 'fuzzy' | 'pattern';
  confidence: number;
  groupId: string;
}

interface AnalysisResult {
  totalEvents: number;
  duplicateGroups: DuplicateGroup[];
  summary: {
    exactMatches: number;
    fuzzyMatches: number;
    patternMatches: number;
    totalDuplicates: number;
  };
}

interface CleanupOperation {
  id: string;
  operationId: string;
  mode: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  groupsAnalyzed: number;
  duplicatesFound: number;
  duplicatesDeleted: number;
  errorsCount: number;
  warningsCount: number;
  startedAt: string;
  completedAt?: string;
}

interface CleanupFilters {
  dateRange?: {
    start: string;
    end: string;
  };
  calendarIds?: string[];
  titlePatterns?: string[];
  descriptionPatterns?: string[];
  includePattern?: string;
  excludePattern?: string;
}

interface CleanupOptions {
  mode: 'dry-run' | 'interactive' | 'batch';
  filters?: CleanupFilters;
  preserveNewest?: boolean;
  maxDeletions?: number;
  requireConfirmation?: boolean;
  createBackup?: boolean;
  skipPatterns?: string[];
}

export default function DuplicateCleanupManager() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [operations, setOperations] = useState<CleanupOperation[]>([]);
  const [calendarIds, setCalendarIds] = useState<string[]>(['primary']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingOperations, setIsLoadingOperations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [cleanupOptions, setCleanupOptions] = useState<CleanupOptions>({
    mode: 'dry-run',
    maxDeletions: 50,
    createBackup: true,
    requireConfirmation: true,
  });

  // Load recent operations on mount
  useEffect(() => {
    loadOperations();
  }, []);

  const loadOperations = useCallback(async () => {
    setIsLoadingOperations(true);
    try {
      const response = await fetch('/api/admin/cleanup-duplicates?action=list-operations');
      if (!response.ok) throw new Error('Failed to load operations');
      
      const data = await response.json();
      setOperations(data.operations || []);
    } catch (err) {
      setError(`Failed to load operations: ${err}`);
    } finally {
      setIsLoadingOperations(false);
    }
  }, []);

  const analyzeDuplicates = useCallback(async () => {
    if (calendarIds.length === 0) {
      setError('Please select at least one calendar');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        action: 'analyze',
        ...calendarIds.reduce((acc, id, index) => {
          acc[`calendarId`] = id;
          return acc;
        }, {} as Record<string, string>),
      });

      // Add each calendar ID separately
      const url = new URL('/api/admin/cleanup-duplicates', window.location.origin);
      url.searchParams.set('action', 'analyze');
      calendarIds.forEach(id => url.searchParams.append('calendarId', id));

      if (cleanupOptions.filters) {
        url.searchParams.set('filters', JSON.stringify(cleanupOptions.filters));
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Analysis failed');

      const result = await response.json();
      setAnalysis(result);
      setSelectedGroups(new Set());
    } catch (err) {
      setError(`Analysis failed: ${err}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [calendarIds, cleanupOptions.filters]);

  const performCleanup = useCallback(async (mode: 'dry-run' | 'batch') => {
    if (!analysis || selectedGroups.size === 0) {
      setError('No groups selected for cleanup');
      return;
    }

    try {
      const response = await fetch('/api/admin/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanup',
          calendarIds,
          options: {
            ...cleanupOptions,
            mode,
          },
        }),
      });

      if (!response.ok) throw new Error('Cleanup failed');

      const result = await response.json();
      
      // Refresh operations list
      await loadOperations();
      
      // Show success message based on mode
      if (mode === 'dry-run') {
        setError(null);
        // Analysis results are already shown
      } else {
        setError(null);
        // Refresh analysis
        await analyzeDuplicates();
      }
    } catch (err) {
      setError(`Cleanup failed: ${err}`);
    }
  }, [analysis, selectedGroups, calendarIds, cleanupOptions, loadOperations, analyzeDuplicates]);

  const restoreEvents = useCallback(async (operationId: string) => {
    try {
      const response = await fetch('/api/admin/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          operationId,
        }),
      });

      if (!response.ok) throw new Error('Restore failed');

      const result = await response.json();
      
      // Refresh operations
      await loadOperations();
      
      setError(null);
    } catch (err) {
      setError(`Restore failed: ${err}`);
    }
  }, [loadOperations]);

  const toggleGroupSelection = (groupId: string) => {
    const newSelection = new Set(selectedGroups);
    if (newSelection.has(groupId)) {
      newSelection.delete(groupId);
    } else {
      newSelection.add(groupId);
    }
    setSelectedGroups(newSelection);
  };

  const selectAllGroups = () => {
    if (!analysis) return;
    setSelectedGroups(new Set(analysis.duplicateGroups.map(g => g.groupId)));
  };

  const clearSelection = () => {
    setSelectedGroups(new Set());
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    
    return <Badge className={variants[status as keyof typeof variants] || variants.cancelled}>{status}</Badge>;
  };

  const getMatchTypeColor = (matchType: string) => {
    const colors = {
      exact: 'bg-red-100 text-red-800',
      fuzzy: 'bg-yellow-100 text-yellow-800',
      pattern: 'bg-blue-100 text-blue-800',
    };
    return colors[matchType as keyof typeof colors] || colors.exact;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Duplicate Cleanup Manager
          </CardTitle>
          <CardDescription>
            Analyze and clean up duplicate events in Google Calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="analyze" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="analyze">Analyze</TabsTrigger>
              <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
            </TabsList>

            {/* Analysis Tab */}
            <TabsContent value="analyze" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Calendar IDs (comma separated)
                  </label>
                  <input
                    type="text"
                    value={calendarIds.join(', ')}
                    onChange={(e) => setCalendarIds(
                      e.target.value.split(',').map(id => id.trim()).filter(Boolean)
                    )}
                    className="w-full p-2 border rounded"
                    placeholder="primary, calendar@example.com"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={analyzeDuplicates}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Analyze Duplicates
                  </Button>

                  <Button variant="outline" onClick={() => setAnalysis(null)}>
                    Clear Results
                  </Button>
                </div>

                {error && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {analysis && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold">{analysis.totalEvents}</div>
                          <div className="text-sm text-gray-600">Total Events</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-red-600">{analysis.summary.totalDuplicates}</div>
                          <div className="text-sm text-gray-600">Duplicates Found</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold">{analysis.duplicateGroups.length}</div>
                          <div className="text-sm text-gray-600">Duplicate Groups</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm space-y-1">
                            <div>Exact: {analysis.summary.exactMatches}</div>
                            <div>Fuzzy: {analysis.summary.fuzzyMatches}</div>
                            <div>Pattern: {analysis.summary.patternMatches}</div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {analysis.duplicateGroups.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={selectAllGroups}>
                            Select All
                          </Button>
                          <Button variant="outline" size="sm" onClick={clearSelection}>
                            Clear Selection
                          </Button>
                          <span className="text-sm text-gray-600 flex items-center">
                            {selectedGroups.size} of {analysis.duplicateGroups.length} groups selected
                          </span>
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {analysis.duplicateGroups.map((group) => (
                            <Card 
                              key={group.groupId}
                              className={`cursor-pointer border-2 ${
                                selectedGroups.has(group.groupId) 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200'
                              }`}
                              onClick={() => toggleGroupSelection(group.groupId)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className={getMatchTypeColor(group.matchType)}>
                                      {group.matchType}
                                    </Badge>
                                    <Badge variant="outline">
                                      {group.confidence}% confidence
                                    </Badge>
                                    <span className="text-sm text-gray-600">
                                      {group.duplicates.length} duplicate(s)
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="font-medium text-green-700">
                                    ✓ Keep: {group.primaryEvent.title}
                                    <div className="text-sm text-gray-600">
                                      {formatDate(group.primaryEvent.startDateTime)}
                                    </div>
                                  </div>
                                  
                                  {group.duplicates.map((duplicate, index) => (
                                    <div key={duplicate.id} className="text-red-700 ml-4">
                                      ✗ Delete: {duplicate.title}
                                      <div className="text-sm text-gray-600">
                                        {formatDate(duplicate.startDateTime)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Cleanup Tab */}
            <TabsContent value="cleanup" className="space-y-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Cleanup Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Cleanup Mode
                      </label>
                      <select 
                        value={cleanupOptions.mode}
                        onChange={(e) => setCleanupOptions({
                          ...cleanupOptions,
                          mode: e.target.value as 'dry-run' | 'interactive' | 'batch'
                        })}
                        className="w-full p-2 border rounded"
                      >
                        <option value="dry-run">Dry Run (Preview Only)</option>
                        <option value="batch">Batch (Delete All Selected)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Maximum Deletions
                      </label>
                      <input
                        type="number"
                        value={cleanupOptions.maxDeletions || ''}
                        onChange={(e) => setCleanupOptions({
                          ...cleanupOptions,
                          maxDeletions: parseInt(e.target.value) || undefined
                        })}
                        className="w-full p-2 border rounded"
                        placeholder="50"
                        min="1"
                        max="1000"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cleanupOptions.createBackup || false}
                          onChange={(e) => setCleanupOptions({
                            ...cleanupOptions,
                            createBackup: e.target.checked
                          })}
                        />
                        Create backup before deletion
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cleanupOptions.preserveNewest || false}
                          onChange={(e) => setCleanupOptions({
                            ...cleanupOptions,
                            preserveNewest: e.target.checked
                          })}
                        />
                        Preserve newest events (instead of oldest)
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cleanupOptions.requireConfirmation || false}
                          onChange={(e) => setCleanupOptions({
                            ...cleanupOptions,
                            requireConfirmation: e.target.checked
                          })}
                        />
                        Require confirmation for each deletion
                      </label>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button
                    onClick={() => performCleanup('dry-run')}
                    disabled={!analysis || selectedGroups.size === 0}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Preview Cleanup
                  </Button>

                  <Button
                    onClick={() => performCleanup('batch')}
                    disabled={!analysis || selectedGroups.size === 0 || cleanupOptions.mode === 'dry-run'}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                    Perform Cleanup
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Operations Tab */}
            <TabsContent value="operations" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Recent Operations</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadOperations}
                  disabled={isLoadingOperations}
                  className="flex items-center gap-2"
                >
                  {isLoadingOperations ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>

              <div className="space-y-3">
                {operations.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-gray-500">
                      No cleanup operations found
                    </CardContent>
                  </Card>
                ) : (
                  operations.map((operation) => (
                    <Card key={operation.operationId}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{operation.operationId}</span>
                            {getStatusBadge(operation.status)}
                            <Badge variant="outline">{operation.mode}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatDate(operation.startedAt)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Groups:</span> {operation.groupsAnalyzed}
                          </div>
                          <div>
                            <span className="text-gray-600">Found:</span> {operation.duplicatesFound}
                          </div>
                          <div>
                            <span className="text-gray-600">Deleted:</span> {operation.duplicatesDeleted}
                          </div>
                          <div>
                            <span className="text-gray-600">Errors:</span> 
                            <span className={operation.errorsCount > 0 ? 'text-red-600' : ''}>
                              {operation.errorsCount}
                            </span>
                          </div>
                        </div>

                        {operation.status === 'completed' && operation.duplicatesDeleted > 0 && (
                          <div className="mt-2 pt-2 border-t flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreEvents(operation.operationId)}
                              className="flex items-center gap-1"
                            >
                              <Upload className="h-3 w-3" />
                              Restore Events
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}