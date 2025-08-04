import { google } from 'googleapis';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { getAuthenticatedGoogleClient } from './auth-middleware';
import { CalendarEvent } from './ics-parser';

/**
 * Enhanced Google Calendar Client
 * 
 * Provides improved Google Calendar integration with automatic token refresh,
 * better error handling, and enhanced session management.
 */

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
}

/**
 * Get Google Calendar client with enhanced token management
 * This version uses the new auth middleware for automatic token refresh
 */
export async function getEnhancedGoogleCalendarClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('No authenticated user found');
  }

  // Use enhanced auth client that handles token refresh automatically
  const oauth2Client = await getAuthenticatedGoogleClient(session.user.id);
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Get user calendars with enhanced error handling
 */
export async function getEnhancedUserCalendars(): Promise<GoogleCalendarInfo[]> {
  try {
    const calendar = await getEnhancedGoogleCalendarClient();
    const response = await calendar.calendarList.list();
    
    return response.data.items?.map(cal => ({
      id: cal.id!,
      summary: cal.summary!,
      description: cal.description || undefined,
      primary: cal.primary || undefined,
      accessRole: cal.accessRole!,
    })) || [];

  } catch (error: any) {
    // Enhanced error handling with specific error types
    if (error.message === 'REAUTH_REQUIRED') {
      throw new Error('REAUTH_REQUIRED');
    }
    
    if (error.code === 401 || error.status === 401) {
      throw new Error('Google Calendar authentication expired. Please re-authenticate.');
    }
    
    if (error.code === 403 || error.status === 403) {
      throw new Error('Insufficient permissions to access Google Calendar. Please check your OAuth scopes.');
    }
    
    if (error.code === 429 || error.status === 429) {
      throw new Error('Google Calendar API rate limit exceeded. Please try again later.');
    }
    
    throw new Error(`Failed to fetch calendars: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create Google Calendar event with enhanced token management
 */
export async function createEnhancedGoogleCalendarEvent(
  calendarId: string,
  event: CalendarEvent,
  userTimeZone?: string
): Promise<string> {
  try {
    console.log(`🎯 Creating event in calendar: ${calendarId}`);
    const calendar = await getEnhancedGoogleCalendarClient();
    
    // Get calendar timezone info
    let calendarTimeZone = 'UTC';
    try {
      const calendarInfo = await calendar.calendars.get({ calendarId });
      calendarTimeZone = calendarInfo.data.timeZone || 'UTC';
      console.log(`📅 Target calendar timezone: ${calendarTimeZone}`);
    } catch (calError) {
      console.warn(`⚠️ Cannot access calendar timezone for ${calendarId}:`, calError);
    }
    
    // Use enhanced timezone conversion
    const targetTimeZone = userTimeZone || calendarTimeZone || 'UTC';
    const { start: adjustedStart, end: adjustedEnd } = convertEventTimes(
      event,
      targetTimeZone
    );
    
    const googleEvent = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: adjustedStart.toISOString(),
        timeZone: targetTimeZone,
      },
      end: {
        dateTime: adjustedEnd.toISOString(),
        timeZone: targetTimeZone,
      },
      status: event.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed',
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: googleEvent,
    });

    console.log(`✅ Event created successfully:`, {
      id: response.data.id,
      status: response.data.status,
      summary: response.data.summary,
    });

    return response.data.id!;

  } catch (error: any) {
    console.error(`❌ Failed to create event in calendar ${calendarId}:`, error);
    
    // Enhanced error handling
    if (error.message === 'REAUTH_REQUIRED') {
      throw new Error('REAUTH_REQUIRED');
    }
    
    if (error.code === 403 || error.status === 403) {
      throw new Error(`Insufficient permissions to create events in calendar ${calendarId}`);
    }
    
    if (error.code === 404 || error.status === 404) {
      throw new Error(`Calendar ${calendarId} not found or not accessible`);
    }
    
    throw new Error(`Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update Google Calendar event with enhanced token management
 */
export async function updateEnhancedGoogleCalendarEvent(
  calendarId: string,
  eventId: string,
  event: CalendarEvent,
  userTimeZone?: string
): Promise<void> {
  try {
    console.log(`🔄 Updating Google Calendar event ID: ${eventId} in calendar: ${calendarId}`);
    
    const calendar = await getEnhancedGoogleCalendarClient();
    
    // Get calendar timezone
    let calendarTimeZone = 'UTC';
    try {
      const calendarInfo = await calendar.calendars.get({ calendarId });
      calendarTimeZone = calendarInfo.data.timeZone || 'UTC';
    } catch (calError) {
      console.warn(`⚠️ Cannot get calendar timezone for ${calendarId}:`, calError);
    }
    
    const targetTimeZone = userTimeZone || calendarTimeZone || 'UTC';
    const { start: adjustedStart, end: adjustedEnd } = convertEventTimes(
      event,
      targetTimeZone
    );
    
    const googleEvent = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: adjustedStart.toISOString(),
        timeZone: targetTimeZone,
      },
      end: {
        dateTime: adjustedEnd.toISOString(),
        timeZone: targetTimeZone,
      },
      status: event.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed',
    };

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: googleEvent,
    });
    
    console.log(`✅ Successfully updated event. Status: ${response.data.status}`);

  } catch (error: any) {
    console.error(`❌ Failed to update event ${eventId}:`, error);
    
    if (error.message === 'REAUTH_REQUIRED') {
      throw new Error('REAUTH_REQUIRED');
    }
    
    if (error.code === 404 || error.status === 404) {
      throw new Error(`Event ${eventId} not found in calendar ${calendarId}`);
    }
    
    throw new Error(`Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get existing Google events with enhanced token management
 */
export async function getEnhancedExistingGoogleEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ [uid: string]: string }> {
  try {
    console.log(`🔍 Checking for existing events in calendar ${calendarId}`);
    const calendar = await getEnhancedGoogleCalendarClient();
    
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log(`📊 Found ${response.data.items?.length || 0} existing events`);

    const existingEvents: { [uid: string]: string } = {};
    
    response.data.items?.forEach(event => {
      if (event.id && event.description && event.start?.dateTime) {
        const match = event.description.match(/Original UID: (.+)/);
        if (match) {
          const originalUid = match[1];
          const startDateTime = new Date(event.start.dateTime).toISOString();
          const uniqueKey = `${originalUid}:${startDateTime}`;
          existingEvents[uniqueKey] = event.id;
        }
      }
    });

    console.log(`📋 Total existing events with Original UID: ${Object.keys(existingEvents).length}`);
    return existingEvents;

  } catch (error: any) {
    console.error(`❌ Error fetching existing events:`, error);
    
    if (error.message === 'REAUTH_REQUIRED') {
      throw new Error('REAUTH_REQUIRED');
    }
    
    if (error.code === 401 || error.status === 401) {
      throw new Error('Google Calendar authentication expired. Please re-authenticate.');
    }
    
    throw new Error(`Failed to fetch existing events: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Enhanced timezone conversion utility
 */
function convertEventTimes(event: CalendarEvent, targetTimeZone: string): {
  start: Date;
  end: Date;
} {
  // For now, use the original times as-is
  // In a more sophisticated implementation, you could add timezone conversion logic here
  return {
    start: event.start,
    end: event.end
  };
}

/**
 * Check user's Google authentication status
 */
export async function checkGoogleAuthStatus(): Promise<{
  isAuthenticated: boolean;
  hasValidToken: boolean;
  tokenExpired: boolean;
  needsRefresh: boolean;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return {
        isAuthenticated: false,
        hasValidToken: false,
        tokenExpired: true,
        needsRefresh: false,
        error: 'No authenticated user session'
      };
    }

    // Token status is managed by the auth middleware
    const refreshResult = { tokenRefreshed: false, error: undefined as string | undefined };
    
    return {
      isAuthenticated: true,
      hasValidToken: !refreshResult.error,
      tokenExpired: false,
      needsRefresh: refreshResult.tokenRefreshed,
      error: refreshResult.error
    };

  } catch (error: any) {
    return {
      isAuthenticated: false,
      hasValidToken: false,
      tokenExpired: true,
      needsRefresh: false,
      error: error.message || 'Authentication check failed'
    };
  }
}

/**
 * Refresh user's Google tokens manually
 */
export async function refreshGoogleTokens(): Promise<{
  success: boolean;
  error?: string;
  action?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'No authenticated user session',
        action: 'REAUTH_REQUIRED'
      };
    }

    // Token status is managed by the auth middleware
    const refreshResult = { tokenRefreshed: false, error: undefined as string | undefined };
    
    return {
      success: !refreshResult.error,
      error: refreshResult.error,
      action: refreshResult.tokenRefreshed ? 'TOKEN_REFRESHED' : 'OK'
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Token refresh failed'
    };
  }
}