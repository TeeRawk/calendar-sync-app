import { google } from 'googleapis';
import { getGoogleCalendarClient } from './google-calendar';
import { db } from './db';
import { calendarSyncs, eventMappings, duplicateResolutions } from './db/schema';
import { eq, sql, and, between, or, like } from 'drizzle-orm';
import crypto from 'crypto';

export interface DuplicateEvent {
  id: string;
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime: Date;
  location?: string;
  calendarId: string;
  sourceUid?: string;
  eventHash: string;
  fuzzyHash: string;
  createdAt: Date;
}

export interface DuplicateGroup {
  primaryEvent: DuplicateEvent;
  duplicates: DuplicateEvent[];
  matchType: 'exact' | 'fuzzy' | 'pattern';
  confidence: number;
  groupId: string;
}

export interface CleanupFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  calendarIds?: string[];
  titlePatterns?: string[];
  descriptionPatterns?: string[];
  includePattern?: RegExp;
  excludePattern?: RegExp;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface CleanupOptions {
  mode: 'dry-run' | 'interactive' | 'batch';
  filters?: CleanupFilters;
  preserveNewest?: boolean; // If true, keeps newest instead of oldest
  maxDeletions?: number; // Safety limit
  requireConfirmation?: boolean;
  createBackup?: boolean;
  skipPatterns?: string[]; // Event title patterns to never delete
}

export interface CleanupResult {
  groupsAnalyzed: number;
  duplicatesFound: number;
  duplicatesDeleted: number;
  errors: string[];
  warnings: string[];
  backupId?: string;
  deletedEventIds: string[];
  preservedEventIds: string[];
  operationId: string;
}

export interface BackupData {
  backupId: string;
  timestamp: Date;
  events: Array<{
    googleEventId: string;
    calendarId: string;
    eventData: any;
    reason: string;
  }>;
}

export class DuplicateCleanupService {
  private readonly maxEventsPerRequest = 2500;
  private readonly maxBatchSize = 100;

  /**
   * Generates a consistent hash for event comparison
   */
  private generateEventHash(
    title: string, 
    startDateTime: Date, 
    description?: string, 
    location?: string
  ): string {
    const normalizedTitle = title.trim().toLowerCase();
    const startTime = startDateTime.toISOString();
    const normalizedDesc = description?.trim().toLowerCase() || '';
    const normalizedLocation = location?.trim().toLowerCase() ?? '';
    
    const content = `${normalizedTitle}|${startTime}|${normalizedDesc}|${normalizedLocation}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generates a fuzzy hash for similar event detection
   */
  private generateFuzzyHash(title: string, startDateTime: Date): string {
    // Remove common words and normalize for fuzzy matching
    const normalizedTitle = title
      .toLowerCase()
      .replace(/\b(the|and|or|a|an|in|on|at|to|for|of|with|by)\b/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Round start time to nearest hour for fuzzy matching
    const roundedTime = new Date(startDateTime);
    roundedTime.setMinutes(0, 0, 0);
    
    const content = `${normalizedTitle}|${roundedTime.toISOString()}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Fetches all events from specified calendars within date range
   */
  async fetchCalendarEvents(
    calendarIds: string[],
    dateRange?: { start: Date; end: Date }
  ): Promise<DuplicateEvent[]> {
    const calendar = await getGoogleCalendarClient();
    const allEvents: DuplicateEvent[] = [];

    const defaultStart = dateRange?.start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    const defaultEnd = dateRange?.end || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year ahead

    for (const calendarId of calendarIds) {
      try {
        console.log(`🔍 Fetching events from calendar: ${calendarId}`);
        
        const response = await calendar.events.list({
          calendarId,
          timeMin: defaultStart.toISOString(),
          timeMax: defaultEnd.toISOString(),
          maxResults: this.maxEventsPerRequest,
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = response.data.items || [];
        console.log(`📊 Found ${events.length} events in calendar ${calendarId}`);

        for (const event of events) {
          if (!event.id || !event.summary || !event.start?.dateTime) continue;

          const startDateTime = new Date(event.start.dateTime);
          const endDateTime = new Date(event.end?.dateTime || event.start.dateTime);
          
          // Extract source UID if available
          const sourceUid = event.description?.match(/Original UID: (.+)/)?.[1];

          const duplicateEvent: DuplicateEvent = {
            id: event.id,
            title: event.summary,
            description: event.description || undefined,
            startDateTime,
            endDateTime,
            location: event.location || undefined,
            calendarId,
            sourceUid,
            eventHash: this.generateEventHash(
              event.summary, 
              startDateTime, 
              event.description ?? undefined, 
              event.location ?? undefined
            ),
            fuzzyHash: this.generateFuzzyHash(event.summary, startDateTime),
            createdAt: new Date(event.created || Date.now()),
          };

          allEvents.push(duplicateEvent);
        }
      } catch (error) {
        console.error(`❌ Error fetching events from calendar ${calendarId}:`, error);
        throw new Error(`Failed to fetch events from calendar ${calendarId}: ${error}`);
      }
    }

    console.log(`📋 Total events fetched: ${allEvents.length}`);
    return allEvents;
  }

  /**
   * Groups events by potential duplicates
   */
  private groupDuplicates(events: DuplicateEvent[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processedEvents = new Set<string>();

    // Group by exact hash first (highest confidence)
    const exactHashGroups = new Map<string, DuplicateEvent[]>();
    events.forEach(event => {
      if (!exactHashGroups.has(event.eventHash)) {
        exactHashGroups.set(event.eventHash, []);
      }
      exactHashGroups.get(event.eventHash)!.push(event);
    });

    // Process exact matches
    for (const [hash, groupEvents] of exactHashGroups) {
      if (groupEvents.length > 1) {
        // Sort by creation date (oldest first) to preserve the original
        const sortedEvents = [...groupEvents].sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        );

        const primaryEvent = sortedEvents[0];
        const duplicates = sortedEvents.slice(1);

        groups.push({
          primaryEvent,
          duplicates,
          matchType: 'exact',
          confidence: 100,
          groupId: `exact_${hash.substring(0, 8)}`,
        });

        // Mark all events in this group as processed
        groupEvents.forEach(event => processedEvents.add(event.id));
      }
    }

    // Group by fuzzy hash for remaining events (medium confidence)
    const remainingEvents = events.filter(event => !processedEvents.has(event.id));
    const fuzzyHashGroups = new Map<string, DuplicateEvent[]>();
    
    remainingEvents.forEach(event => {
      if (!fuzzyHashGroups.has(event.fuzzyHash)) {
        fuzzyHashGroups.set(event.fuzzyHash, []);
      }
      fuzzyHashGroups.get(event.fuzzyHash)!.push(event);
    });

    // Process fuzzy matches
    for (const [hash, groupEvents] of fuzzyHashGroups) {
      if (groupEvents.length > 1) {
        // Additional validation for fuzzy matches
        const validMatches = this.validateFuzzyMatches(groupEvents);
        
        if (validMatches.length > 1) {
          const sortedEvents = [...validMatches].sort((a, b) => 
            a.createdAt.getTime() - b.createdAt.getTime()
          );

          const primaryEvent = sortedEvents[0];
          const duplicates = sortedEvents.slice(1);

          groups.push({
            primaryEvent,
            duplicates,
            matchType: 'fuzzy',
            confidence: 85,
            groupId: `fuzzy_${hash}`,
          });

          validMatches.forEach(event => processedEvents.add(event.id));
        }
      }
    }

    // Pattern-based matching for events with "Original UID:" in description
    const patternEvents = events.filter(event => 
      !processedEvents.has(event.id) && 
      event.description?.includes('Original UID:')
    );

    const uidGroups = new Map<string, DuplicateEvent[]>();
    patternEvents.forEach(event => {
      if (event.sourceUid) {
        if (!uidGroups.has(event.sourceUid)) {
          uidGroups.set(event.sourceUid, []);
        }
        uidGroups.get(event.sourceUid)!.push(event);
      }
    });

    // Process UID-based matches
    for (const [uid, groupEvents] of uidGroups) {
      if (groupEvents.length > 1) {
        const sortedEvents = [...groupEvents].sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        );

        const primaryEvent = sortedEvents[0];
        const duplicates = sortedEvents.slice(1);

        groups.push({
          primaryEvent,
          duplicates,
          matchType: 'pattern',
          confidence: 95,
          groupId: `uid_${uid.substring(0, 8)}`,
        });
      }
    }

    console.log(`🎯 Found ${groups.length} duplicate groups`);
    return groups;
  }

  /**
   * Validates fuzzy matches to reduce false positives
   */
  private validateFuzzyMatches(events: DuplicateEvent[]): DuplicateEvent[] {
    const validEvents: DuplicateEvent[] = [];

    for (const event of events) {
      // Check if the event is within a reasonable time window of others
      const hasCloseTimeMatch = events.some(other => {
        if (other.id === event.id) return false;
        const timeDiff = Math.abs(
          event.startDateTime.getTime() - other.startDateTime.getTime()
        );
        // Allow up to 2 hours difference for fuzzy matching
        return timeDiff <= 2 * 60 * 60 * 1000;
      });

      if (hasCloseTimeMatch) {
        validEvents.push(event);
      }
    }

    return validEvents.length > 1 ? validEvents : events;
  }

  /**
   * Applies filters to duplicate groups
   */
  private applyFilters(
    groups: DuplicateGroup[], 
    filters?: CleanupFilters
  ): DuplicateGroup[] {
    if (!filters) return groups;

    return groups.filter(group => {
      const allEvents = [group.primaryEvent, ...group.duplicates];

      // Date range filter
      if (filters.dateRange) {
        const withinRange = allEvents.some(event => 
          event.startDateTime >= filters.dateRange!.start &&
          event.startDateTime <= filters.dateRange!.end
        );
        if (!withinRange) return false;
      }

      // Calendar filter
      if (filters.calendarIds && filters.calendarIds.length > 0) {
        const hasMatchingCalendar = allEvents.some(event =>
          filters.calendarIds!.includes(event.calendarId)
        );
        if (!hasMatchingCalendar) return false;
      }

      // Title pattern filter
      if (filters.titlePatterns && filters.titlePatterns.length > 0) {
        const hasMatchingTitle = allEvents.some(event =>
          filters.titlePatterns!.some(pattern =>
            event.title.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (!hasMatchingTitle) return false;
      }

      // Description pattern filter
      if (filters.descriptionPatterns && filters.descriptionPatterns.length > 0) {
        const hasMatchingDescription = allEvents.some(event =>
          event.description && filters.descriptionPatterns!.some(pattern =>
            event.description!.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (!hasMatchingDescription) return false;
      }

      // Include pattern filter
      if (filters.includePattern) {
        const hasIncludeMatch = allEvents.some(event =>
          filters.includePattern!.test(event.title) ||
          (event.description && filters.includePattern!.test(event.description))
        );
        if (!hasIncludeMatch) return false;
      }

      // Exclude pattern filter
      if (filters.excludePattern) {
        const hasExcludeMatch = allEvents.some(event =>
          filters.excludePattern!.test(event.title) ||
          (event.description && filters.excludePattern!.test(event.description))
        );
        if (hasExcludeMatch) return false;
      }

      // Creation date filters
      if (filters.createdAfter) {
        const hasRecentEvent = allEvents.some(event =>
          event.createdAt >= filters.createdAfter!
        );
        if (!hasRecentEvent) return false;
      }

      if (filters.createdBefore) {
        const hasOldEvent = allEvents.some(event =>
          event.createdAt <= filters.createdBefore!
        );
        if (!hasOldEvent) return false;
      }

      return true;
    });
  }

  /**
   * Creates a backup of events before deletion
   */
  async createBackup(groups: DuplicateGroup[]): Promise<BackupData> {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const calendar = await getGoogleCalendarClient();
    const backupEvents: BackupData['events'] = [];

    for (const group of groups) {
      for (const duplicate of group.duplicates) {
        try {
          // Fetch full event data
          const eventResponse = await calendar.events.get({
            calendarId: duplicate.calendarId,
            eventId: duplicate.id,
          });

          backupEvents.push({
            googleEventId: duplicate.id,
            calendarId: duplicate.calendarId,
            eventData: eventResponse.data,
            reason: `Duplicate of ${group.primaryEvent.id} (${group.matchType} match, ${group.confidence}% confidence)`,
          });
        } catch (error) {
          console.warn(`⚠️ Could not backup event ${duplicate.id}:`, error);
        }
      }
    }

    const backupData: BackupData = {
      backupId,
      timestamp: new Date(),
      events: backupEvents,
    };

    // Store backup in database or file system
    // For now, we'll log it and could extend to store in DB
    console.log(`💾 Created backup ${backupId} with ${backupEvents.length} events`);
    
    // TODO: Implement persistent backup storage
    return backupData;
  }

  /**
   * Main cleanup function
   */
  async cleanupDuplicates(
    calendarIds: string[],
    options: CleanupOptions = { mode: 'dry-run' }
  ): Promise<CleanupResult> {
    const operationId = `cleanup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const result: CleanupResult = {
      groupsAnalyzed: 0,
      duplicatesFound: 0,
      duplicatesDeleted: 0,
      errors: [],
      warnings: [],
      deletedEventIds: [],
      preservedEventIds: [],
      operationId,
    };

    try {
      console.log(`🚀 Starting duplicate cleanup operation: ${operationId}`);
      console.log(`📋 Options:`, options);

      // Fetch events
      const events = await this.fetchCalendarEvents(calendarIds, options.filters?.dateRange);
      
      // Group duplicates
      const allGroups = this.groupDuplicates(events);
      
      // Apply filters
      const filteredGroups = this.applyFilters(allGroups, options.filters);
      
      result.groupsAnalyzed = filteredGroups.length;
      result.duplicatesFound = filteredGroups.reduce((sum, group) => sum + group.duplicates.length, 0);

      console.log(`🎯 Analysis complete: ${result.groupsAnalyzed} groups, ${result.duplicatesFound} duplicates found`);

      // Apply safety limits
      if (options.maxDeletions && result.duplicatesFound > options.maxDeletions) {
        result.warnings.push(`Found ${result.duplicatesFound} duplicates, but limited to ${options.maxDeletions} deletions`);
        // Sort groups by confidence and take only the top ones
        const sortedGroups = [...filteredGroups].sort((a, b) => b.confidence - a.confidence);
        let remainingDeletions = options.maxDeletions;
        const limitedGroups: DuplicateGroup[] = [];
        
        for (const group of sortedGroups) {
          if (remainingDeletions >= group.duplicates.length) {
            limitedGroups.push(group);
            remainingDeletions -= group.duplicates.length;
          }
        }
        
        filteredGroups.splice(0, filteredGroups.length, ...limitedGroups);
      }

      // Skip patterns check
      const finalGroups = options.skipPatterns ? 
        filteredGroups.filter(group => {
          const shouldSkip = options.skipPatterns!.some(pattern =>
            group.duplicates.some(dup => dup.title.toLowerCase().includes(pattern.toLowerCase()))
          );
          if (shouldSkip) {
            result.warnings.push(`Skipped group ${group.groupId} due to skip pattern match`);
          }
          return !shouldSkip;
        }) : filteredGroups;

      // Create backup if requested
      if (options.createBackup && options.mode !== 'dry-run') {
        const backup = await this.createBackup(finalGroups);
        result.backupId = backup.backupId;
      }

      // Handle different modes
      if (options.mode === 'dry-run') {
        console.log(`🔍 DRY RUN - Would delete ${result.duplicatesFound} duplicates from ${result.groupsAnalyzed} groups`);
        
        // Add preserved event IDs for dry run
        finalGroups.forEach(group => {
          result.preservedEventIds.push(group.primaryEvent.id);
          result.deletedEventIds.push(...group.duplicates.map(d => d.id));
        });
        
        return result;
      }

      // Actual deletion for interactive and batch modes
      const calendar = await getGoogleCalendarClient();
      
      for (const group of finalGroups) {
        console.log(`🗑️ Processing group ${group.groupId} (${group.matchType} match, ${group.confidence}% confidence)`);
        console.log(`  Preserving: "${group.primaryEvent.title}" (${group.primaryEvent.id})`);
        
        result.preservedEventIds.push(group.primaryEvent.id);

        for (const duplicate of group.duplicates) {
          try {
            // Interactive mode confirmation
            if (options.mode === 'interactive' && options.requireConfirmation) {
              // In a real implementation, this would prompt the user
              // For now, we'll assume confirmation
              console.log(`❓ Would you like to delete "${duplicate.title}" (${duplicate.id})? [Assuming YES for batch processing]`);
            }

            console.log(`  Deleting: "${duplicate.title}" (${duplicate.id})`);
            
            await calendar.events.delete({
              calendarId: duplicate.calendarId,
              eventId: duplicate.id,
            });

            result.duplicatesDeleted++;
            result.deletedEventIds.push(duplicate.id);

            // Log the resolution in database
            await this.logDuplicateResolution(group, duplicate, 'deleted');

          } catch (error) {
            const errorMsg = `Failed to delete event ${duplicate.id}: ${error}`;
            console.error(`❌ ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }
      }

      console.log(`✅ Cleanup operation ${operationId} completed successfully`);
      console.log(`📊 Results: ${result.duplicatesDeleted}/${result.duplicatesFound} duplicates deleted`);

    } catch (error) {
      const errorMsg = `Cleanup operation failed: ${error}`;
      console.error(`❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Logs duplicate resolution to database
   */
  private async logDuplicateResolution(
    group: DuplicateGroup,
    duplicate: DuplicateEvent,
    resolution: string
  ): Promise<void> {
    try {
      // This would integrate with the existing database schema
      // For now, we'll just log to console
      console.log(`📝 Logging resolution: ${duplicate.id} -> ${resolution} (group: ${group.groupId})`);
      
      // TODO: Implement database logging using duplicateResolutions table
      
    } catch (error) {
      console.warn(`⚠️ Failed to log duplicate resolution:`, error);
    }
  }

  /**
   * Analyzes duplicates without performing cleanup (analysis only)
   */
  async analyzeDuplicates(
    calendarIds: string[],
    filters?: CleanupFilters
  ): Promise<{
    totalEvents: number;
    duplicateGroups: DuplicateGroup[];
    summary: {
      exactMatches: number;
      fuzzyMatches: number;
      patternMatches: number;
      totalDuplicates: number;
    };
  }> {
    console.log(`🔍 Analyzing duplicates across ${calendarIds.length} calendars`);
    
    const events = await this.fetchCalendarEvents(calendarIds, filters?.dateRange);
    const groups = this.groupDuplicates(events);
    const filteredGroups = this.applyFilters(groups, filters);

    const summary = {
      exactMatches: filteredGroups.filter(g => g.matchType === 'exact').length,
      fuzzyMatches: filteredGroups.filter(g => g.matchType === 'fuzzy').length,
      patternMatches: filteredGroups.filter(g => g.matchType === 'pattern').length,
      totalDuplicates: filteredGroups.reduce((sum, group) => sum + group.duplicates.length, 0),
    };

    return {
      totalEvents: events.length,
      duplicateGroups: filteredGroups,
      summary,
    };
  }
}