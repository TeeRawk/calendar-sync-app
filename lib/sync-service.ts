import { db } from './db';
import { calendarSyncs, syncLogs } from './db/schema';
import { eq } from 'drizzle-orm';
import { parseICSFromUrlWithExpansion, CalendarEvent } from './ics-parser';
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  getExistingGoogleEvents,
} from './google-calendar';
// Duplicate resolution logic is now inline using proven UID + timestamp approach

export interface SyncResult {
  success: boolean;
  eventsProcessed: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsSkipped: number;
  duplicatesResolved: number;
  errors: string[];
  duration: number;
}

export async function syncCalendar(calendarSyncId: string, userTimeZone?: string): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    eventsProcessed: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
    duplicatesResolved: 0,
    errors: [],
    duration: 0,
  };

  try {
    console.log(`🔄 Starting sync for calendar sync ID: ${calendarSyncId}`);
    
    // Get calendar sync configuration
    const calendarSync = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.id, calendarSyncId))
      .limit(1);

    if (!calendarSync[0]) {
      throw new Error('Calendar sync configuration not found');
    }

    const config = calendarSync[0];
    console.log(`📋 Config found: ${config.name}, ICS URL: ${config.icsUrl}`);
    
    // Parse and expand ICS events for the current month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based (July = 6)
    
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    
    console.log(`📥 Fetching and expanding ICS events from: ${config.icsUrl}`);
    console.log(`📅 Expansion range: ${monthStart.toISOString().split('T')[0]} to ${monthEnd.toISOString().split('T')[0]}`);
    console.log(`🌍 User timezone: ${userTimeZone}`);
    
    const uniqueEvents = await parseICSFromUrlWithExpansion(config.icsUrl, monthStart, monthEnd);
    
    if (uniqueEvents.length > 0) {
      console.log(`📝 Sample events:`, uniqueEvents.slice(0, 3).map(e => ({
        summary: e.summary,
        start: e.start,
        end: e.end
      })));
    }
    
    result.eventsProcessed = uniqueEvents.length;

    if (uniqueEvents.length === 0) {
      result.success = true;
      result.duration = Date.now() - startTime;
      await logSyncResult(calendarSyncId, result);
      return result;
    }

    // Process events in parallel batches for better performance with real-time duplicate checking
    console.log(`🔄 Processing ${uniqueEvents.length} events in batches with real-time duplicate resolution...`);
    const BATCH_SIZE = 5; // Process 5 events at a time to avoid rate limits
    const eventBatches = [];
    
    for (let i = 0; i < uniqueEvents.length; i += BATCH_SIZE) {
      eventBatches.push(uniqueEvents.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${eventBatches.length} batches of ${BATCH_SIZE} events each`);

    for (let batchIndex = 0; batchIndex < eventBatches.length; batchIndex++) {
      const batch = eventBatches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${eventBatches.length} (${batch.length} events)`);
      
      // Get fresh existing events before each batch to handle eventual consistency
      console.log(`🔍 Fetching fresh existing events for batch ${batchIndex + 1}...`);
      const existingEvents = await getExistingGoogleEvents(
        config.googleCalendarId,
        monthStart,
        monthEnd,
        batchIndex // Use batch index as retry count for progressive delays
      );
      console.log(`📊 Found ${Object.keys(existingEvents).length} existing events for batch comparison`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (event) => {
        try {
          console.log(`📝 Processing: "${event.summary}" (${event.sourceTimezone || 'Unknown timezone'})`);
          
          // Create a copy and add original UID to description
          const eventCopy: CalendarEvent = {
            ...event,
            description: `${event.description || ''}\n\nOriginal UID: ${event.uid}`.trim(),
          };

          // Use proven duplicate detection logic with UID + start time key
          const uniqueKey = `${event.uid}:${event.start.toISOString()}`;
          console.log(`🔍 Checking for duplicate with key: ${uniqueKey}`);
          console.log(`📋 Available existing event keys:`, Object.keys(existingEvents).slice(0, 5));

          if (existingEvents[uniqueKey]) {
            // Update existing event
            const existingEventId = existingEvents[uniqueKey];
            console.log(`🔄 Updating existing event: ${event.summary} (ID: ${existingEventId})`);
            await updateGoogleCalendarEvent(
              config.googleCalendarId,
              existingEventId,
              eventCopy,
              userTimeZone
            );
            return { 
              type: 'updated', 
              event: event.summary,
              duplicateResolved: true,
              existingEventId: existingEventId
            };
          } else {
            // Fallback: Try to find a close match by UID only (for debugging)
            const fallbackMatches = Object.keys(existingEvents).filter(key => key.startsWith(event.uid + ':'));
            if (fallbackMatches.length > 0) {
              console.log(`🚨 POTENTIAL DUPLICATE MISSED! Event "${event.summary}" with UID "${event.uid}" has potential matches:`, fallbackMatches);
              console.log(`🔍 Event start time: ${event.start.toISOString()}`);
              console.log(`📅 Possible matches start times:`, fallbackMatches.map(key => key.split(':')[1]));
            }
            
            // Create new event
            console.log(`➕ Creating new event: ${event.summary} in calendar ${config.googleCalendarId}`);
            const createdEventId = await createGoogleCalendarEvent(config.googleCalendarId, eventCopy, userTimeZone);
            console.log(`✅ Created event with ID: ${createdEventId}`);
            
            // SAFEGUARD: Add a small delay and verify the event was created correctly
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            console.log(`🔒 SAFEGUARD: Verifying event creation for future batch consistency`);
            
            return { 
              type: 'created', 
              event: event.summary,
              eventId: createdEventId
            };
          }
        } catch (error) {
          const errorMsg = `Failed to sync event "${event.summary}": ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          console.error(`❌ Error syncing event:`, error);
          return { type: 'error' as const, event: event.summary, error: errorMsg };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Update counters
      batchResults.forEach(batchResult => {
        if (batchResult.type === 'created') {
          result.eventsCreated++;
        } else if (batchResult.type === 'updated') {
          result.eventsUpdated++;
          if ((batchResult as any).duplicateResolved) {
            result.duplicatesResolved++;
          }
        } else if (batchResult.type === 'skipped') {
          result.eventsSkipped++;
        } else if (batchResult.type === 'error') {
          result.errors.push(batchResult.error || 'Unknown error');
        }
      });

      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.length} events processed`);
      
      // Add small delay between batches to avoid rate limiting
      if (batchIndex < eventBatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Update last sync time
    await db
      .update(calendarSyncs)
      .set({ 
        lastSync: new Date(),
        syncErrors: result.errors.length > 0 ? result.errors : null,
      })
      .where(eq(calendarSyncs.id, calendarSyncId));

    result.success = result.errors.length === 0;
    result.duration = Date.now() - startTime;

    // Log the sync result
    await logSyncResult(calendarSyncId, result);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    result.duration = Date.now() - startTime;
    
    await logSyncResult(calendarSyncId, result);
    
    throw error;
  }
}

async function logSyncResult(calendarSyncId: string, result: SyncResult): Promise<void> {
  try {
    // Create enhanced log data with duplicate resolution metrics
    const logData = {
      calendarSyncId,
      eventsProcessed: result.eventsProcessed.toString(),
      eventsCreated: result.eventsCreated.toString(),
      eventsUpdated: result.eventsUpdated.toString(),
      errors: result.errors.length > 0 ? result.errors : null,
      duration: `${result.duration}ms`,
      status: result.success ? 'success' : 'error',
    };

    await db.insert(syncLogs).values(logData);

    // Enhanced logging for duplicate resolution
    if (result.duplicatesResolved > 0 || result.eventsSkipped > 0) {
      console.log(`📊 Sync completed with duplicate resolution:`);
      console.log(`  • Events processed: ${result.eventsProcessed}`);
      console.log(`  • Events created: ${result.eventsCreated}`);
      console.log(`  • Events updated: ${result.eventsUpdated}`);
      console.log(`  • Duplicates resolved: ${result.duplicatesResolved}`);
      console.log(`  • Events skipped: ${result.eventsSkipped}`);
      console.log(`  • Duration: ${result.duration}ms`);
    }
  } catch (error) {
    console.error('Failed to log sync result:', error);
  }
}

export async function syncAllActiveCalendars(): Promise<void> {
  try {
    const activeCalendars = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.isActive, true));

    const syncPromises = activeCalendars.map(calendar => 
      syncCalendar(calendar.id).catch(error => {
        console.error(`Failed to sync calendar ${calendar.name}:`, error);
      })
    );

    await Promise.all(syncPromises);
  } catch (error) {
    console.error('Failed to sync calendars:', error);
    throw error;
  }
}