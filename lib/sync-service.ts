import { db } from './db';
import { calendarSyncs, syncLogs } from './db/schema';
import { eq } from 'drizzle-orm';
import { parseICSFromUrlWithExpansion, CalendarEvent } from './ics-parser';
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  getExistingGoogleEvents,
} from './google-calendar';

export interface SyncResult {
  success: boolean;
  eventsProcessed: number;
  eventsCreated: number;
  eventsUpdated: number;
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

    const existingEvents = await getExistingGoogleEvents(
      config.googleCalendarId,
      monthStart,
      monthEnd
    );

    // Process each event
    console.log(`🔄 Processing ${uniqueEvents.length} events...`);
    for (const event of uniqueEvents) {
      try {
        console.log(`📝 Processing: "${event.summary}" (${event.sourceTimezone || 'Unknown timezone'})`);
        
        // Create a copy without attendees and add original UID to description
        const eventCopy: CalendarEvent = {
          ...event,
          description: `${event.description || ''}\n\nOriginal UID: ${event.uid}`.trim(),
        };

        // Create unique key combining UID and start datetime for recurring events
        const uniqueKey = `${event.uid}:${event.start.toISOString()}`;

        if (existingEvents[uniqueKey]) {
          // Update existing event
          console.log(`🔄 Updating existing event: ${event.summary} (${uniqueKey})`);
          await updateGoogleCalendarEvent(
            config.googleCalendarId,
            existingEvents[uniqueKey],
            eventCopy,
            userTimeZone
          );
          result.eventsUpdated++;
        } else {
          // Create new event
          console.log(`➕ Creating new event: ${event.summary} (${uniqueKey}) in calendar ${config.googleCalendarId}`);
          const createdEventId = await createGoogleCalendarEvent(config.googleCalendarId, eventCopy, userTimeZone);
          console.log(`✅ Created event with ID: ${createdEventId}`);
          result.eventsCreated++;
        }
      } catch (error) {
        const errorMsg = `Failed to sync event "${event.summary}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        console.error(`❌ Error syncing event:`, error);
        result.errors.push(errorMsg);
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
    await db.insert(syncLogs).values({
      calendarSyncId,
      eventsProcessed: result.eventsProcessed.toString(),
      eventsCreated: result.eventsCreated.toString(),
      eventsUpdated: result.eventsUpdated.toString(),
      errors: result.errors.length > 0 ? result.errors : null,
      duration: `${result.duration}ms`,
      status: result.success ? 'success' : 'error',
    });
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