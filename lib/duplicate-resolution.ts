import { CalendarEvent } from './ics-parser';
import { getGoogleCalendarClient } from './google-calendar';
import { calendar_v3 } from 'googleapis';

export interface DuplicateResolutionResult {
  isDuplicate: boolean;
  existingEventId?: string;
  action: 'create' | 'update' | 'skip';
  reason: string;
  confidence: number; // 0-1 scale
}

export interface DuplicateDetectionOptions {
  /** Time tolerance in minutes for start/end time matching */
  timeTolerance: number;
  /** Enable fuzzy string matching for titles */
  fuzzyMatching: boolean;
  /** Minimum confidence threshold for considering events as duplicates */
  confidenceThreshold: number;
  /** Maximum number of existing events to compare against */
  maxComparisons: number;
}

export const DEFAULT_DUPLICATE_OPTIONS: DuplicateDetectionOptions = {
  timeTolerance: 5, // 5 minutes tolerance
  fuzzyMatching: true,
  confidenceThreshold: 0.8,
  maxComparisons: 1000,
};

/**
 * Advanced duplicate detection using multiple criteria
 */
export class DuplicateResolver {
  private options: DuplicateDetectionOptions;

  constructor(options: Partial<DuplicateDetectionOptions> = {}) {
    this.options = { ...DEFAULT_DUPLICATE_OPTIONS, ...options };
  }

  /**
   * Find duplicate meetings using comprehensive matching logic
   */
  async findDuplicateMeeting(
    incomingEvent: CalendarEvent,
    calendarId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<DuplicateResolutionResult> {
    try {
      console.log(`🔍 Checking for duplicates: "${incomingEvent.summary}"`);
      
      // Get existing events from Google Calendar
      const existingEvents = await this.getExistingEventsForComparison(
        calendarId,
        timeMin,
        timeMax
      );

      console.log(`📊 Comparing against ${existingEvents.length} existing events`);

      if (existingEvents.length === 0) {
        return {
          isDuplicate: false,
          action: 'create',
          reason: 'No existing events to compare',
          confidence: 1.0,
        };
      }

      // Find the best match among existing events
      let bestMatch: DuplicateResolutionResult = {
        isDuplicate: false,
        action: 'create',
        reason: 'No significant matches found',
        confidence: 0,
      };

      for (const existingEvent of existingEvents) {
        const matchResult = this.compareEvents(incomingEvent, existingEvent);
        
        if (matchResult.confidence > bestMatch.confidence) {
          bestMatch = matchResult;
          
          // Early exit if we find a high-confidence match
          if (matchResult.confidence >= 0.95) {
            console.log(`✨ High-confidence match found (${matchResult.confidence}): ${existingEvent.id}`);
            break;
          }
        }
      }

      // Apply confidence threshold
      if (bestMatch.confidence >= this.options.confidenceThreshold) {
        bestMatch.isDuplicate = true;
        bestMatch.action = 'update';
        console.log(`🎯 Duplicate detected with confidence ${bestMatch.confidence}: ${bestMatch.existingEventId}`);
      } else {
        console.log(`➕ Creating new event (best match confidence: ${bestMatch.confidence})`);
      }

      return bestMatch;

    } catch (error) {
      console.error('❌ Error in duplicate detection:', error);
      
      // Fallback to safe creation on error
      return {
        isDuplicate: false,
        action: 'create',
        reason: `Error in duplicate detection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
      };
    }
  }

  /**
   * Compare two events and calculate match confidence
   */
  private compareEvents(
    incomingEvent: CalendarEvent,
    existingEvent: calendar_v3.Schema$Event
  ): DuplicateResolutionResult {
    let confidenceScore = 0;
    const reasons: string[] = [];

    // 1. UID-based matching (highest priority)
    const uidMatch = this.compareByUID(incomingEvent, existingEvent);
    if (uidMatch.matches) {
      confidenceScore += 0.4;
      reasons.push(`UID match: ${uidMatch.reason}`);
    }

    // 2. Time-based matching
    const timeMatch = this.compareByTime(incomingEvent, existingEvent);
    if (timeMatch.matches) {
      confidenceScore += 0.3;
      reasons.push(`Time match: ${timeMatch.reason}`);
    }

    // 3. Title/summary matching
    const titleMatch = this.compareByTitle(incomingEvent, existingEvent);
    if (titleMatch.matches) {
      confidenceScore += 0.2;
      reasons.push(`Title match: ${titleMatch.reason}`);
    }

    // 4. Location matching (if available)
    const locationMatch = this.compareByLocation(incomingEvent, existingEvent);
    if (locationMatch.matches) {
      confidenceScore += 0.1;
      reasons.push(`Location match: ${locationMatch.reason}`);
    }

    return {
      isDuplicate: confidenceScore >= this.options.confidenceThreshold,
      existingEventId: existingEvent.id || undefined,
      action: confidenceScore >= this.options.confidenceThreshold ? 'update' : 'create',
      reason: reasons.length > 0 ? reasons.join('; ') : 'No matches found',
      confidence: Math.min(confidenceScore, 1.0),
    };
  }

  /**
   * Compare events by UID (most reliable indicator)
   */
  private compareByUID(
    incomingEvent: CalendarEvent,
    existingEvent: calendar_v3.Schema$Event
  ): { matches: boolean; reason: string } {
    if (!existingEvent.description) {
      return { matches: false, reason: 'No description in existing event' };
    }

    // Check for original UID in description
    const uidMatch = existingEvent.description.match(/Original UID: (.+)/);
    if (uidMatch) {
      const existingUID = uidMatch[1].trim();
      
      // Handle recurring event UIDs (remove timestamp suffix)
      const incomingBaseUID = incomingEvent.uid.split('-')[0];
      const existingBaseUID = existingUID.split('-')[0];
      
      if (incomingBaseUID === existingBaseUID) {
        return { matches: true, reason: `Base UID match: ${incomingBaseUID}` };
      }
      
      if (incomingEvent.uid === existingUID) {
        return { matches: true, reason: `Exact UID match: ${incomingEvent.uid}` };
      }
    }

    return { matches: false, reason: 'No UID match found' };
  }

  /**
   * Compare events by start/end times with tolerance
   */
  private compareByTime(
    incomingEvent: CalendarEvent,
    existingEvent: calendar_v3.Schema$Event
  ): { matches: boolean; reason: string } {
    if (!existingEvent.start?.dateTime || !existingEvent.end?.dateTime) {
      return { matches: false, reason: 'Missing datetime in existing event' };
    }

    const existingStart = new Date(existingEvent.start.dateTime);
    const existingEnd = new Date(existingEvent.end.dateTime);
    
    const startDiff = Math.abs(incomingEvent.start.getTime() - existingStart.getTime());
    const endDiff = Math.abs(incomingEvent.end.getTime() - existingEnd.getTime());
    
    const toleranceMs = this.options.timeTolerance * 60 * 1000;
    
    if (startDiff <= toleranceMs && endDiff <= toleranceMs) {
      return { 
        matches: true, 
        reason: `Time within ${this.options.timeTolerance}min tolerance (start: ${Math.round(startDiff/60000)}min, end: ${Math.round(endDiff/60000)}min)`
      };
    }

    return { 
      matches: false, 
      reason: `Time difference too large (start: ${Math.round(startDiff/60000)}min, end: ${Math.round(endDiff/60000)}min)`
    };
  }

  /**
   * Compare events by title/summary with fuzzy matching
   */
  private compareByTitle(
    incomingEvent: CalendarEvent,
    existingEvent: calendar_v3.Schema$Event
  ): { matches: boolean; reason: string } {
    if (!existingEvent.summary) {
      return { matches: false, reason: 'No summary in existing event' };
    }

    const incomingTitle = this.normalizeString(incomingEvent.summary);
    const existingTitle = this.normalizeString(existingEvent.summary);

    // Exact match after normalization
    if (incomingTitle === existingTitle) {
      return { matches: true, reason: 'Exact title match' };
    }

    // Fuzzy matching if enabled
    if (this.options.fuzzyMatching) {
      const similarity = this.calculateStringSimilarity(incomingTitle, existingTitle);
      if (similarity >= 0.85) {
        return { matches: true, reason: `Fuzzy title match (${Math.round(similarity * 100)}% similar)` };
      }
    }

    return { matches: false, reason: 'Title mismatch' };
  }

  /**
   * Compare events by location
   */
  private compareByLocation(
    incomingEvent: CalendarEvent,
    existingEvent: calendar_v3.Schema$Event
  ): { matches: boolean; reason: string } {
    const incomingLocation = this.normalizeString(incomingEvent.location || '');
    const existingLocation = this.normalizeString(existingEvent.location || '');

    if (!incomingLocation && !existingLocation) {
      return { matches: true, reason: 'Both events have no location' };
    }

    if (incomingLocation && existingLocation && incomingLocation === existingLocation) {
      return { matches: true, reason: 'Location match' };
    }

    return { matches: false, reason: 'Location mismatch or missing' };
  }

  /**
   * Get existing events from Google Calendar for comparison
   */
  private async getExistingEventsForComparison(
    calendarId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = await getGoogleCalendarClient();
      
      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: this.options.maxComparisons,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('❌ Error fetching existing events for comparison:', error);
      return [];
    }
  }

  /**
   * Normalize string for comparison (lowercase, trim, remove extra spaces)
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
 * Utility function to create a duplicate resolver with custom options
 */
export function createDuplicateResolver(options?: Partial<DuplicateDetectionOptions>): DuplicateResolver {
  return new DuplicateResolver(options);
}

/**
 * Quick duplicate check function for backward compatibility
 */
export async function findDuplicateMeeting(
  incomingEvent: CalendarEvent,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  options?: Partial<DuplicateDetectionOptions>
): Promise<DuplicateResolutionResult> {
  const resolver = new DuplicateResolver(options);
  return resolver.findDuplicateMeeting(incomingEvent, calendarId, timeMin, timeMax);
}

/**
 * Merge event data preserving important existing information
 */
export function mergeEventData(
  incomingEvent: CalendarEvent,
  existingEvent: calendar_v3.Schema$Event,
  userTimeZone?: string
): calendar_v3.Schema$Event {
  console.log(`🔄 Merging event data for: "${incomingEvent.summary}"`);
  
  // Convert timezone (reuse logic from google-calendar.ts)
  const convertToUserTimezone = (sourceDate: Date) => {
    const hours = sourceDate.getHours();
    const minutes = sourceDate.getMinutes();
    
    // Arizona (MST) is UTC-7, Madrid is UTC+1/+2 (depending on DST)
    const arizonaOffset = -7;
    const madridOffset = new Date().getTimezoneOffset() / -60;
    const timeDifference = madridOffset - arizonaOffset;
    
    return new Date(
      sourceDate.getFullYear(),
      sourceDate.getMonth(),
      sourceDate.getDate(),
      hours + timeDifference,
      minutes,
      sourceDate.getSeconds()
    );
  };

  const adjustedStart = convertToUserTimezone(incomingEvent.start);
  const adjustedEnd = convertToUserTimezone(incomingEvent.end);

  // Preserve existing Google Calendar specific data while updating with incoming event data
  const mergedEvent: calendar_v3.Schema$Event = {
    ...existingEvent, // Keep existing Google Calendar metadata
    summary: incomingEvent.summary,
    description: `${incomingEvent.description || ''}\n\nOriginal UID: ${incomingEvent.uid}`.trim(),
    location: incomingEvent.location,
    start: {
      dateTime: adjustedStart.toISOString(),
      timeZone: existingEvent.start?.timeZone, // Preserve existing timezone
    },
    end: {
      dateTime: adjustedEnd.toISOString(),
      timeZone: existingEvent.end?.timeZone, // Preserve existing timezone
    },
    status: incomingEvent.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed',
    // Keep existing: id, etag, created, creator, organizer, attendees, etc.
  };

  return mergedEvent;
}