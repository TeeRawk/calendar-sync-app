import { db } from './db';
import { calendarSyncs, syncLogs, busyFreeSyncs } from './db/schema';
import { eq } from 'drizzle-orm';
import { parseBusyFreeICS, BusyFreeEvent, createPrivacyCompliantEvent } from './busy-free-parser';
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  getExistingGoogleEvents,
} from './google-calendar';
import type { CalendarEvent } from './ics-parser';

export interface BusyFreeSyncResult {
  success: boolean;
  eventsProcessed: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsSkipped: number;
  errors: string[];
  duration: number;
}

export type PrivacyLevel = 'busy_only' | 'show_free_busy' | 'full_details';
export type SyncType = 'full' | 'busy_free';

export async function syncBusyFreeCalendar(
  calendarSyncId: string,
  userTimeZone?: string
): Promise<BusyFreeSyncResult> {
  const startTime = Date.now();
  const result: BusyFreeSyncResult = {
    success: false,
    eventsProcessed: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
    errors: [],
    duration: 0,
  };

  try {
    console.log(`🔒 Starting busy/free sync for calendar sync ID: ${calendarSyncId}`);
    
    // Get calendar sync configuration
    const calendarSync = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.id, calendarSyncId))
      .limit(1);

    if (!calendarSync[0]) {
      throw new Error('Calendar sync configuration not found');
    }

    const config = calendarSync[0] as any;
    console.log(`📋 Config found: ${config.name}, ICS URL: ${config.icsUrl}`);
    
    // Check if calendar sync is active
    if (!config.isActive) {
      console.log('📴 Calendar sync is inactive, skipping');
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Check if this is a busy/free sync
    const syncType: SyncType = config.syncType || 'full';
    const privacyLevel: PrivacyLevel = config.privacyLevel || 'busy_only';
    
    console.log(`🔐 Sync type: ${syncType}, Privacy level: ${privacyLevel}`);

    // Parse busy/free calendar data for the current month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    
    console.log(`📥 Fetching busy/free events from: ${config.icsUrl}`);
    console.log(`📅 Date range: ${monthStart.toISOString().split('T')[0]} to ${monthEnd.toISOString().split('T')[0]}`);
    console.log(`🌍 User timezone: ${userTimeZone || 'default'}`);
    
    const busyFreeData = await parseBusyFreeICS(config.icsUrl, {
      startDate: monthStart,
      endDate: monthEnd,
      includeFreeBusy: privacyLevel !== 'busy_only'
    });
    
    console.log(`📊 Parsed ${busyFreeData.events.length} busy/free events`);
    console.log(`🕰️ Calendar timezone: ${busyFreeData.timezone || 'not specified'}`);
    
    if (busyFreeData.events.length > 0) {
      console.log(`📝 Sample events:`, busyFreeData.events.slice(0, 3).map(e => ({
        summary: e.summary,
        status: e.status,
        start: e.start,
        end: e.end
      })));
    }
    
    result.eventsProcessed = busyFreeData.events.length;

    if (busyFreeData.events.length === 0) {
      result.success = true;
      result.duration = Date.now() - startTime;
      await logBusyFreeSyncResult(calendarSyncId, result);
      return result;
    }

    // Process events in batches with duplicate checking
    console.log(`🔄 Processing ${busyFreeData.events.length} busy/free events...`);
    const BATCH_SIZE = 5;
    const eventBatches = [];
    
    for (let i = 0; i < busyFreeData.events.length; i += BATCH_SIZE) {
      eventBatches.push(busyFreeData.events.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${eventBatches.length} batches of ${BATCH_SIZE} events each`);

    for (let batchIndex = 0; batchIndex < eventBatches.length; batchIndex++) {
      const batch = eventBatches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${eventBatches.length} (${batch.length} events)`);
      
      // Get existing events for duplicate detection
      const existingEvents = await getExistingGoogleEvents(
        config.googleCalendarId,
        monthStart,
        monthEnd,
        0
      );
      console.log(`📊 Found ${Object.keys(existingEvents).length} existing events for comparison`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (busyFreeEvent) => {
        try {
          console.log(`🔒 Processing busy/free event: "${busyFreeEvent.summary}" (${busyFreeEvent.status})`);
          
          // Create privacy-compliant event
          const privacyCompliantEvent = createPrivacyCompliantEvent(busyFreeEvent, privacyLevel);
          
          // Convert to CalendarEvent format for compatibility with existing sync logic
          const calendarEvent: CalendarEvent = {
            uid: busyFreeEvent.uid,
            summary: privacyCompliantEvent.summary || 'Busy',
            description: `${privacyCompliantEvent.description || ''}\n\nBusy/Free Status: ${busyFreeEvent.status}\nOriginal UID: ${busyFreeEvent.uid}`.trim(),
            start: busyFreeEvent.start,
            end: busyFreeEvent.end,
            location: privacyLevel === 'full_details' ? busyFreeEvent.location : undefined,
            status: 'CONFIRMED',
            sourceTimezone: busyFreeData.timezone,
          };

          // TIMEZONE-AWARE DUPLICATE DETECTION:
          // We need to generate the key using the same timezone conversion that createGoogleCalendarEvent will use
          // This ensures duplicate detection matches what gets stored in Google Calendar
          const convertToUserTimezone = (sourceDate: Date, sourceTimezone?: string) => {
            // If we have timezone info from the source calendar, use it for conversion
            if (sourceTimezone && userTimeZone && sourceTimezone !== userTimeZone) {
              // For now, handle common timezone conversions
              // This can be expanded with a proper timezone library if needed
              const hours = sourceDate.getHours();
              const minutes = sourceDate.getMinutes();
              
              // Simple timezone offset conversion (this should ideally use a timezone library)
              if (sourceTimezone === 'America/Phoenix' && userTimeZone) {
                // Arizona is UTC-7 (no DST)
                const arizonaOffset = -7;
                const userOffset = new Date().getTimezoneOffset() / -60;
                const timeDifference = userOffset - arizonaOffset;
                
                const convertedTime = new Date(
                  sourceDate.getFullYear(),
                  sourceDate.getMonth(),
                  sourceDate.getDate(),
                  hours + timeDifference,
                  minutes,
                  sourceDate.getSeconds()
                );
                
                return convertedTime;
              }
            }
            
            // Return original date if no conversion needed
            return sourceDate;
          };
          
          // Generate key using timezone-adjusted time (for duplicate detection only)
          const adjustedStartForKey = convertToUserTimezone(busyFreeEvent.start, busyFreeData.timezone);
          const uniqueKey = `${busyFreeEvent.uid}:${adjustedStartForKey.toISOString()}`;
          console.log(`🔍 Checking for duplicate with timezone-adjusted key: ${uniqueKey}`);

          if (existingEvents[uniqueKey]) {
            // Update existing event
            const existingEventId = existingEvents[uniqueKey];
            console.log(`🔄 Updating existing busy/free event: ${busyFreeEvent.summary} (ID: ${existingEventId})`);
            await updateGoogleCalendarEvent(
              config.googleCalendarId,
              existingEventId,
              calendarEvent,
              userTimeZone
            );
            return { 
              type: 'updated', 
              event: busyFreeEvent.summary,
              status: busyFreeEvent.status
            };
          } else {
            // Create new event
            console.log(`➕ Creating new busy/free event: ${busyFreeEvent.summary} (${busyFreeEvent.status}) in calendar ${config.googleCalendarId}`);
            const createdEventId = await createGoogleCalendarEvent(
              config.googleCalendarId, 
              calendarEvent, 
              userTimeZone
            );
            console.log(`✅ Created busy/free event with ID: ${createdEventId}`);
            
            return { 
              type: 'created', 
              event: busyFreeEvent.summary,
              eventId: createdEventId,
              status: busyFreeEvent.status
            };
          }
        } catch (error) {
          const errorMsg = `Failed to sync busy/free event "${busyFreeEvent.summary}": ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          console.error(`❌ Error syncing busy/free event:`, error);
          return { type: 'error' as const, event: busyFreeEvent.summary, error: errorMsg };
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
        } else if (batchResult.type === 'skipped') {
          result.eventsSkipped++;
        } else if (batchResult.type === 'error') {
          result.errors.push(batchResult.error || 'Unknown error');
        }
      });

      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.length} busy/free events processed`);
      
      // Small delay between batches
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
    await logBusyFreeSyncResult(calendarSyncId, result);

    console.log(`🏁 Busy/free sync completed: ${result.eventsCreated} created, ${result.eventsUpdated} updated, ${result.errors.length} errors`);
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    result.duration = Date.now() - startTime;
    
    await logBusyFreeSyncResult(calendarSyncId, result);
    
    throw error;
  }
}

async function logBusyFreeSyncResult(calendarSyncId: string, result: BusyFreeSyncResult): Promise<void> {
  try {
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

    console.log(`📊 Busy/free sync logged:`);
    console.log(`  • Events processed: ${result.eventsProcessed}`);
    console.log(`  • Events created: ${result.eventsCreated}`);
    console.log(`  • Events updated: ${result.eventsUpdated}`);
    console.log(`  • Events skipped: ${result.eventsSkipped}`);
    console.log(`  • Duration: ${result.duration}ms`);
    console.log(`  • Status: ${result.success ? 'success' : 'error'}`);
    
    if (result.errors.length > 0) {
      console.log(`  • Errors: ${result.errors.length}`);
      result.errors.forEach((error, index) => {
        console.log(`    ${index + 1}. ${error}`);
      });
    }
  } catch (error) {
    console.error('Failed to log busy/free sync result:', error);
  }
}

export async function syncAllActiveBusyFreeCalendars(): Promise<void> {
  try {
    const activeBusyFreeCalendars = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.isActive, true));

    // Filter for busy/free calendars
    const busyFreeCalendars = activeBusyFreeCalendars.filter((calendar: any) => 
      calendar.syncType === 'busy_free' || 
      (calendar.icsUrl && calendar.icsUrl.includes('/basic.ics'))
    );

    console.log(`🔒 Found ${busyFreeCalendars.length} active busy/free calendars to sync`);

    const syncPromises = busyFreeCalendars.map(calendar => 
      syncBusyFreeCalendar(calendar.id).catch(error => {
        console.error(`❌ Failed to sync busy/free calendar ${calendar.name}:`, error);
      })
    );

    await Promise.all(syncPromises);
    console.log(`✅ Completed syncing all active busy/free calendars`);
  } catch (error) {
    console.error('❌ Failed to sync busy/free calendars:', error);
    throw error;
  }
}

export function isBusyFreeCalendar(icsUrl: string): boolean {
  // Check if URL contains indicators of busy/free calendar
  const busyFreeIndicators = [
    '/basic.ics',
    '/freebusy',
    'freebusy=true',
    'privacy=basic'
  ];
  
  return busyFreeIndicators.some(indicator => 
    icsUrl.toLowerCase().includes(indicator.toLowerCase())
  );
}

export function detectPrivacyLevel(icsUrl: string, eventSummaries: string[]): PrivacyLevel {
  // Detect privacy level based on URL and event content
  if (icsUrl.includes('/basic.ics')) {
    return 'busy_only';
  }
  
  // Check if all events have generic summaries
  const genericSummaries = ['busy', 'free', 'unavailable'];
  const hasOnlyGeneric = eventSummaries.every(summary => 
    genericSummaries.includes(summary.toLowerCase())
  );
  
  if (hasOnlyGeneric) {
    return 'show_free_busy';
  }
  
  return 'full_details';
}