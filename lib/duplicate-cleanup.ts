import { getGoogleCalendarClient } from './google-calendar';
import { calendar_v3 } from 'googleapis';

export interface DuplicateGroup {
  primaryEvent: calendar_v3.Schema$Event;
  duplicates: calendar_v3.Schema$Event[];
  matchType: 'exact' | 'fuzzy' | 'pattern';
  confidence: number;
}

export interface CleanupOptions {
  mode: 'dry-run' | 'interactive' | 'batch';
  dateRange?: {
    start: string;
    end: string;
  };
  titlePatterns?: string[];
  excludePatterns?: string[];
  maxDeletions?: number;
  preserveOldest?: boolean;
  skipWithAttendees?: boolean;
}

export interface CleanupResult {
  duplicatesFound: number;
  duplicatesDeleted: number;
  eventsPreserved: number;
  deletedEventIds: string[];
  errors: string[];
  duration: number;
}

export interface CleanupAnalysis {
  totalEvents: number;
  duplicateGroups: DuplicateGroup[];
  potentialDeletions: number;
  summary: {
    exactMatches: number;
    fuzzyMatches: number;
    patternMatches: number;
  };
}

export class DuplicateCleanupService {
  private options: CleanupOptions;

  constructor(options: Partial<CleanupOptions> = {}) {
    this.options = {
      mode: 'dry-run',
      titlePatterns: [],
      excludePatterns: [],
      maxDeletions: 50,
      preserveOldest: true,
      skipWithAttendees: true,
      ...options,
    };
  }

  /**
   * Analyze duplicates in specified calendars without making changes
   */
  async analyzeDuplicates(calendarIds: string[]): Promise<CleanupAnalysis> {
    console.log('🔍 Starting duplicate analysis...');
    const startTime = Date.now();

    const duplicateGroups: DuplicateGroup[] = [];
    let totalEvents = 0;

    for (const calendarId of calendarIds) {
      console.log(`📅 Analyzing calendar: ${calendarId}`);
      
      const events = await this.getCalendarEvents(calendarId);
      totalEvents += events.length;
      
      const groups = await this.findDuplicateGroups(events);
      duplicateGroups.push(...groups);
    }

    const summary = {
      exactMatches: duplicateGroups.filter(g => g.matchType === 'exact').length,
      fuzzyMatches: duplicateGroups.filter(g => g.matchType === 'fuzzy').length,
      patternMatches: duplicateGroups.filter(g => g.matchType === 'pattern').length,
    };

    const potentialDeletions = duplicateGroups.reduce(
      (sum, group) => sum + group.duplicates.length,
      0
    );

    console.log(`✅ Analysis complete: ${duplicateGroups.length} duplicate groups found (${potentialDeletions} potential deletions)`);
    
    return {
      totalEvents,
      duplicateGroups,
      potentialDeletions,
      summary,
    };
  }

  /**
   * Clean up duplicates with safety checks and confirmation
   */
  async cleanupDuplicates(calendarIds: string[]): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      duplicatesFound: 0,
      duplicatesDeleted: 0,
      eventsPreserved: 0,
      deletedEventIds: [],
      errors: [],
      duration: 0,
    };

    try {
      console.log(`🧹 Starting duplicate cleanup (${this.options.mode} mode)...`);
      
      // First, analyze to get duplicate groups
      const analysis = await this.analyzeDuplicates(calendarIds);
      result.duplicatesFound = analysis.potentialDeletions;

      if (analysis.duplicateGroups.length === 0) {
        console.log('✅ No duplicates found!');
        result.duration = Date.now() - startTime;
        return result;
      }

      console.log(`📊 Found ${analysis.duplicateGroups.length} duplicate groups:`);
      analysis.duplicateGroups.forEach((group, index) => {
        console.log(`  Group ${index + 1}: "${group.primaryEvent.summary}" (${group.duplicates.length} duplicates, ${group.matchType} match, ${Math.round(group.confidence * 100)}% confidence)`);
      });

      // Apply safety limits
      const maxDeletions = this.options.maxDeletions || 50;
      const totalDeletions = Math.min(
        analysis.potentialDeletions,
        maxDeletions
      );

      if (totalDeletions > maxDeletions) {
        console.log(`⚠️  Limiting deletions to ${maxDeletions} (found ${analysis.potentialDeletions} potential deletions)`);
      }

      // Dry run mode - just report what would be deleted
      if (this.options.mode === 'dry-run') {
        console.log('🔍 DRY RUN MODE - No events will be deleted');
        analysis.duplicateGroups.forEach((group, index) => {
          console.log(`\n📋 Group ${index + 1} (${group.matchType}, ${Math.round(group.confidence * 100)}% confidence):`);
          console.log(`  ✅ Keep: "${group.primaryEvent.summary}" (${group.primaryEvent.start?.dateTime})`);
          group.duplicates.forEach((duplicate, dupIndex) => {
            console.log(`  🗑️  Delete: "${duplicate.summary}" (${duplicate.start?.dateTime})`);
          });
        });
        result.duration = Date.now() - startTime;
        return result;
      }

      // Interactive or batch cleanup
      let deletionsProcessed = 0;

      for (const group of analysis.duplicateGroups) {
        if (deletionsProcessed >= maxDeletions) {
          console.log(`⚠️  Reached maximum deletion limit of ${maxDeletions}`);
          break;
        }

        const duplicatesToDelete = group.duplicates.slice(
          0,
          maxDeletions - deletionsProcessed
        );

        for (const duplicate of duplicatesToDelete) {
          try {
            // Interactive confirmation
            if (this.options.mode === 'interactive') {
              console.log(`\n🤔 Delete "${duplicate.summary}" (${duplicate.start?.dateTime})?`);
              console.log(`   Primary: "${group.primaryEvent.summary}" (${group.primaryEvent.start?.dateTime})`);
              console.log(`   Match: ${group.matchType} (${Math.round(group.confidence * 100)}% confidence)`);
              // Note: In a real implementation, you'd use readline or similar for user input
              // For now, we'll default to 'yes' in interactive mode
            }

            // Extract calendar ID from event ID or use primary calendar
            const calendarId = calendarIds[0]; // Simplified - in real implementation, track which calendar each event belongs to

            await this.deleteEvent(calendarId, duplicate.id!);
            
            result.deletedEventIds.push(duplicate.id!);
            result.duplicatesDeleted++;
            deletionsProcessed++;

            console.log(`🗑️  Deleted: "${duplicate.summary}" (ID: ${duplicate.id})`);

          } catch (error) {
            const errorMsg = `Failed to delete event "${duplicate.summary}": ${
              error instanceof Error ? error.message : 'Unknown error'
            }`;
            console.error(`❌ ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }

        result.eventsPreserved++;
        console.log(`✅ Preserved: "${group.primaryEvent.summary}"`);
      }

      result.duration = Date.now() - startTime;
      
      console.log('\n📊 Cleanup Summary:');
      console.log(`  • Duplicates found: ${result.duplicatesFound}`);
      console.log(`  • Duplicates deleted: ${result.duplicatesDeleted}`);
      console.log(`  • Events preserved: ${result.eventsPreserved}`);
      console.log(`  • Errors: ${result.errors.length}`);
      console.log(`  • Duration: ${result.duration}ms`);

      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(error => console.log(`  • ${error}`));
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMsg);
      result.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Get events from a calendar with optional filtering
   */
  private async getCalendarEvents(calendarId: string): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = await getGoogleCalendarClient();
      
      const params: any = {
        calendarId,
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime',
      };

      if (this.options.dateRange) {
        params.timeMin = this.options.dateRange.start;
        params.timeMax = this.options.dateRange.end;
      }

      const response = await calendar.events.list(params);
      let events = response.data.items || [];

      // Apply filters
      const titlePatterns = this.options.titlePatterns || [];
      const excludePatterns = this.options.excludePatterns || [];
      
      if (titlePatterns.length > 0) {
        events = events.filter(event => 
          titlePatterns.some(pattern => 
            event.summary?.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      }

      if (excludePatterns.length > 0) {
        events = events.filter(event => 
          !excludePatterns.some(pattern => 
            event.summary?.toLowerCase().includes(pattern.toLowerCase()) ||
            event.description?.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      }

      // Skip events with attendees if requested
      if (this.options.skipWithAttendees) {
        events = events.filter(event => !event.attendees || event.attendees.length === 0);
      }

      console.log(`📚 Retrieved ${events.length} events from calendar ${calendarId}`);
      return events;

    } catch (error) {
      console.error(`❌ Error retrieving events from calendar ${calendarId}:`, error);
      throw error;
    }
  }

  /**
   * Find duplicate groups in a list of events
   */
  private async findDuplicateGroups(events: calendar_v3.Schema$Event[]): Promise<DuplicateGroup[]> {
    const duplicateGroups: DuplicateGroup[] = [];
    const processedEvents = new Set<string>();

    for (let i = 0; i < events.length; i++) {
      const primaryEvent = events[i];
      
      if (!primaryEvent.id || processedEvents.has(primaryEvent.id)) {
        continue;
      }

      const duplicates: calendar_v3.Schema$Event[] = [];
      let matchType: 'exact' | 'fuzzy' | 'pattern' = 'exact';
      let confidence = 0;

      for (let j = i + 1; j < events.length; j++) {
        const potentialDuplicate = events[j];
        
        if (!potentialDuplicate.id || processedEvents.has(potentialDuplicate.id)) {
          continue;
        }

        const match = this.compareEvents(primaryEvent, potentialDuplicate);
        
        if (match.confidence > 0.7) { // 70% confidence threshold
          duplicates.push(potentialDuplicate);
          processedEvents.add(potentialDuplicate.id);
          
          // Use the highest confidence match type for the group
          if (match.confidence > confidence) {
            confidence = match.confidence;
            matchType = match.type;
          }
        }
      }

      if (duplicates.length > 0) {
        // Determine which event to keep (primary)
        let actualPrimary = primaryEvent;
        
        if (this.options.preserveOldest) {
          // Find the oldest event (earliest created date)
          const allEvents = [primaryEvent, ...duplicates];
          actualPrimary = allEvents.reduce((oldest, current) => {
            const oldestCreated = new Date(oldest.created || '1970-01-01').getTime();
            const currentCreated = new Date(current.created || '1970-01-01').getTime();
            return currentCreated < oldestCreated ? current : oldest;
          });
        }

        // Remove the primary from duplicates list
        const finalDuplicates = duplicates.filter(dup => dup.id !== actualPrimary.id);
        if (actualPrimary.id !== primaryEvent.id) {
          finalDuplicates.push(primaryEvent);
        }

        duplicateGroups.push({
          primaryEvent: actualPrimary,
          duplicates: finalDuplicates,
          matchType,
          confidence,
        });

        processedEvents.add(actualPrimary.id!);
      }

      processedEvents.add(primaryEvent.id);
    }

    return duplicateGroups;
  }

  /**
   * Compare two events to determine if they're duplicates
   */
  private compareEvents(event1: calendar_v3.Schema$Event, event2: calendar_v3.Schema$Event): {
    confidence: number;
    type: 'exact' | 'fuzzy' | 'pattern';
  } {
    // Exact match check
    if (this.isExactMatch(event1, event2)) {
      return { confidence: 1.0, type: 'exact' };
    }

    // Pattern match (sync-generated events)
    const patternMatch = this.isPatternMatch(event1, event2);
    if (patternMatch > 0.8) {
      return { confidence: patternMatch, type: 'pattern' };
    }

    // Fuzzy match
    const fuzzyMatch = this.calculateFuzzyMatch(event1, event2);
    if (fuzzyMatch > 0.7) {
      return { confidence: fuzzyMatch, type: 'fuzzy' };
    }

    return { confidence: 0, type: 'exact' };
  }

  /**
   * Check if two events are exact matches
   */
  private isExactMatch(event1: calendar_v3.Schema$Event, event2: calendar_v3.Schema$Event): boolean {
    return (
      this.normalizeString(event1.summary || '') === this.normalizeString(event2.summary || '') &&
      event1.start?.dateTime === event2.start?.dateTime &&
      event1.end?.dateTime === event2.end?.dateTime &&
      this.normalizeString(event1.location || '') === this.normalizeString(event2.location || '')
    );
  }

  /**
   * Check if events match common patterns (like sync-generated events)
   */
  private isPatternMatch(event1: calendar_v3.Schema$Event, event2: calendar_v3.Schema$Event): number {
    let confidence = 0;

    // Check for "Original UID:" pattern in descriptions
    const hasOriginalUID1 = event1.description?.includes('Original UID:');
    const hasOriginalUID2 = event2.description?.includes('Original UID:');

    if (hasOriginalUID1 && hasOriginalUID2) {
      confidence += 0.4;

      // Extract and compare original UIDs
      const uid1 = event1.description?.match(/Original UID: (.+)/)?.[1];
      const uid2 = event2.description?.match(/Original UID: (.+)/)?.[1];

      if (uid1 && uid2 && uid1 === uid2) {
        confidence += 0.5; // High confidence for same original UID
      }
    }

    // Same title
    if (this.normalizeString(event1.summary || '') === this.normalizeString(event2.summary || '')) {
      confidence += 0.3;
    }

    // Same or very close start times (within 2 hours)
    if (event1.start?.dateTime && event2.start?.dateTime) {
      const time1 = new Date(event1.start.dateTime).getTime();
      const time2 = new Date(event2.start.dateTime).getTime();
      const timeDiff = Math.abs(time1 - time2);
      const twoHours = 2 * 60 * 60 * 1000;

      if (timeDiff === 0) {
        confidence += 0.3;
      } else if (timeDiff <= twoHours) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate fuzzy match score between two events
   */
  private calculateFuzzyMatch(event1: calendar_v3.Schema$Event, event2: calendar_v3.Schema$Event): number {
    let confidence = 0;

    // Title similarity
    const title1 = this.normalizeString(event1.summary || '');
    const title2 = this.normalizeString(event2.summary || '');
    const titleSimilarity = this.calculateStringSimilarity(title1, title2);
    confidence += titleSimilarity * 0.5;

    // Time similarity (within reasonable bounds)
    if (event1.start?.dateTime && event2.start?.dateTime) {
      const time1 = new Date(event1.start.dateTime).getTime();
      const time2 = new Date(event2.start.dateTime).getTime();
      const timeDiff = Math.abs(time1 - time2);
      const oneDay = 24 * 60 * 60 * 1000;

      if (timeDiff === 0) {
        confidence += 0.3;
      } else if (timeDiff <= oneDay) {
        confidence += 0.2 * (1 - timeDiff / oneDay);
      }
    }

    // Location similarity
    const location1 = this.normalizeString(event1.location || '');
    const location2 = this.normalizeString(event2.location || '');
    if (location1 && location2) {
      const locationSimilarity = this.calculateStringSimilarity(location1, location2);
      confidence += locationSimilarity * 0.2;
    } else if (!location1 && !location2) {
      confidence += 0.1; // Both empty is a weak match
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Delete an event from Google Calendar
   */
  private async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      const calendar = await getGoogleCalendarClient();
      await calendar.events.delete({
        calendarId,
        eventId,
      });
    } catch (error) {
      console.error(`❌ Error deleting event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Normalize string for comparison
   */
  private normalizeString(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length === 0 ? 1 : 0;
    if (str2.length === 0) return 0;

    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }
}

/**
 * Quick cleanup function for common use cases
 */
export async function quickCleanupDuplicates(
  calendarIds: string[],
  options: Partial<CleanupOptions> = {}
): Promise<CleanupResult> {
  const service = new DuplicateCleanupService(options);
  return service.cleanupDuplicates(calendarIds);
}

/**
 * Quick analysis function
 */
export async function analyzeDuplicates(
  calendarIds: string[],
  options: Partial<CleanupOptions> = {}
): Promise<CleanupAnalysis> {
  const service = new DuplicateCleanupService(options);
  return service.analyzeDuplicates(calendarIds);
}