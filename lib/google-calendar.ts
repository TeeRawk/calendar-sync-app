import { google } from 'googleapis';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { CalendarEvent } from './ics-parser';
// Remove date-fns-tz dependency for now - using native JS approach

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
}

export async function getGoogleCalendarClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('No authenticated user found');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Get access token from database
  const { db } = await import('./db');
  const { accounts } = await import('./db/schema');
  const { eq } = await import('drizzle-orm');

  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, session.user.id))
    .limit(1);

  if (!account[0]?.access_token) {
    throw new Error('No Google account connected');
  }

  // Check if refresh token is missing - only delete account in this case
  const noRefreshToken = !account[0]?.refresh_token;
  
  if (noRefreshToken) {
    // Delete the account only when there's no way to refresh the token
    await db
      .delete(accounts)
      .where(eq(accounts.userId, session.user.id));
    
    throw new Error('REAUTH_REQUIRED');
  }

  oauth2Client.setCredentials({
    access_token: account[0].access_token,
    refresh_token: account[0].refresh_token,
  });

  // Check if token needs refresh and handle it
  const tokenExpired = account[0].expires_at && account[0].expires_at < Math.floor(Date.now() / 1000);
  
  if (tokenExpired) {
    try {
      console.log('🔄 Token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update database with new tokens
      await db
        .update(accounts)
        .set({
          access_token: credentials.access_token,
          expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
        })
        .where(eq(accounts.userId, session.user.id));
      
      oauth2Client.setCredentials(credentials);
      console.log('✅ Token refreshed successfully');
    } catch (refreshError) {
      console.error('❌ Token refresh failed:', refreshError);
      // Delete account when refresh fails completely  
      await db
        .delete(accounts)
        .where(eq(accounts.userId, session.user.id));
      
      throw new Error('Google Calendar authentication expired. Please go to https://myaccount.google.com/permissions, revoke Calendar Sync App access, then sign out and sign back in to re-authenticate.');
    }
  }

  // Set up automatic token refresh for future requests
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(accounts)
        .set({
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        })
        .where(eq(accounts.userId, session.user.id));
    }
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function getUserCalendars(): Promise<GoogleCalendarInfo[]> {
  try {
    const calendar = await getGoogleCalendarClient();
    const response = await calendar.calendarList.list();
    
    return response.data.items?.map(cal => ({
      id: cal.id!,
      summary: cal.summary!,
      description: cal.description || undefined,
      primary: cal.primary || undefined,
      accessRole: cal.accessRole!,
    })) || [];
  } catch (error: any) {
    
    // Handle authentication errors specifically
    if (error.code === 401 || error.status === 401) {
      throw new Error('Google Calendar authentication expired. Please sign out and sign back in to re-authenticate.');
    }
    
    throw new Error(`Failed to fetch calendars: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createGoogleCalendarEvent(
  calendarId: string,
  event: CalendarEvent,
  userTimeZone?: string
): Promise<string> {
  try {
    console.log(`🎯 Creating event in calendar: ${calendarId}`);
    const calendar = await getGoogleCalendarClient();
    
    // Get calendar timezone
    let calendarTimeZone = 'UTC';
    try {
      const calendarInfo = await calendar.calendars.get({ calendarId });
      calendarTimeZone = calendarInfo.data.timeZone || 'UTC';
      console.log(`📅 Target calendar info:`, {
        id: calendarInfo.data.id,
        summary: calendarInfo.data.summary,
        timeZone: calendarTimeZone
      });
    } catch (calError) {
      console.error(`❌ Cannot access calendar ${calendarId}:`, calError);
    }
    
    console.log(`\n🌍 Converting "${event.summary}" from ${event.sourceTimezone || 'Unknown'} to ${userTimeZone}`);
    
    // Use the user's timezone (this is the key - we want events to show in user's timezone)
    const targetTimeZone = userTimeZone || 'UTC';
    
    // Function to convert Windows/ICS timezone names to IANA timezone identifiers
    const normalizeTimezone = (timezone: string): string => {
      // Try to use Intl.supportedValuesOf to check if it's already a valid IANA timezone
      try {
        // Test if this timezone works with Intl.DateTimeFormat
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        console.log(`✅ Timezone "${timezone}" is valid IANA identifier`);
        return timezone;
      } catch (error) {
        console.log(`🔍 Timezone "${timezone}" is not IANA format, attempting conversion...`);
        
        // Common mappings for Windows timezone names
        const commonMappings: { [key: string]: string } = {
          'US Mountain Standard Time': 'America/Denver',
          'US Eastern Standard Time': 'America/New_York', 
          'US Pacific Standard Time': 'America/Los_Angeles',
          'US Central Standard Time': 'America/Chicago',
          'GMT Standard Time': 'Europe/London',
          'Central European Standard Time': 'Europe/Berlin',
          'UTC': 'UTC'
        };
        
        if (commonMappings[timezone]) {
          console.log(`🗺️ Mapped "${timezone}" to "${commonMappings[timezone]}"`);
          return commonMappings[timezone];
        }
        
        // If no mapping found, try to extract from the name
        if (timezone.includes('Mountain')) return 'America/Denver';
        if (timezone.includes('Eastern')) return 'America/New_York';
        if (timezone.includes('Pacific')) return 'America/Los_Angeles';
        if (timezone.includes('Central') && timezone.includes('US')) return 'America/Chicago';
        if (timezone.includes('GMT') || timezone.includes('UTC')) return 'UTC';
        
        console.log(`⚠️ Could not map timezone "${timezone}", using as-is`);
        return timezone;
      }
    };
    
    
    // Convert Arizona time to Madrid time
    const convertToUserTimezone = (sourceDate: Date) => {
      const hours = sourceDate.getHours();
      const minutes = sourceDate.getMinutes();
      
      // Arizona (MST) is UTC-7, Madrid is UTC+1/+2 (depending on DST)
      const arizonaOffset = -7; // Arizona is UTC-7 (no DST)
      const madridOffset = new Date().getTimezoneOffset() / -60; // Madrid offset in hours
      const timeDifference = madridOffset - arizonaOffset;
      
      // Convert Arizona time to Madrid time
      const convertedTime = new Date(
        sourceDate.getFullYear(),
        sourceDate.getMonth(),
        sourceDate.getDate(),
        hours + timeDifference,
        minutes,
        sourceDate.getSeconds()
      );
      
      console.log(`  ${hours}:${String(minutes).padStart(2, '0')} Arizona → ${convertedTime.getHours()}:${String(convertedTime.getMinutes()).padStart(2, '0')} Madrid`);
      
      return convertedTime;
    };
    
    const adjustedStart = convertToUserTimezone(event.start);
    const adjustedEnd = convertToUserTimezone(event.end);
    
    const googleEvent = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: adjustedStart.toISOString(),
        // No timeZone specified - Google Calendar will treat as user's local time
      },
      end: {
        dateTime: adjustedEnd.toISOString(),
        // No timeZone specified - Google Calendar will treat as user's local time
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
      htmlLink: response.data.htmlLink
    });

    return response.data.id!;
  } catch (error) {
    console.error(`❌ Failed to create event in calendar ${calendarId}:`, error);
    throw new Error(`Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function updateGoogleCalendarEvent(
  calendarId: string,
  eventId: string,
  event: CalendarEvent,
  userTimeZone?: string
): Promise<void> {
  try {
    console.log(`🔄 Updating Google Calendar event ID: ${eventId} in calendar: ${calendarId}`);
    console.log(`📝 Event details:`, {
      summary: event.summary,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      description: event.description?.substring(0, 100) + '...'
    });
    
    const calendar = await getGoogleCalendarClient();
    
    // Get calendar timezone
    let calendarTimeZone = 'UTC';
    try {
      const calendarInfo = await calendar.calendars.get({ calendarId });
      calendarTimeZone = calendarInfo.data.timeZone || 'UTC';
    } catch (calError) {
      console.error(`❌ Cannot get calendar timezone for ${calendarId}:`, calError);
    }
    
    // Use the same timezone normalization as in create function
    const targetTimeZone = userTimeZone || 'UTC';
    
    // Function to normalize timezone (same as in create function)
    const normalizeTimezone = (timezone: string): string => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return timezone;
      } catch (error) {
        const commonMappings: { [key: string]: string } = {
          'US Mountain Standard Time': 'America/Denver',
          'US Eastern Standard Time': 'America/New_York', 
          'US Pacific Standard Time': 'America/Los_Angeles',
          'US Central Standard Time': 'America/Chicago',
          'GMT Standard Time': 'Europe/London',
          'Central European Standard Time': 'Europe/Berlin',
          'UTC': 'UTC'
        };
        
        if (commonMappings[timezone]) return commonMappings[timezone];
        if (timezone.includes('Mountain')) return 'America/Denver';
        if (timezone.includes('Eastern')) return 'America/New_York';
        if (timezone.includes('Pacific')) return 'America/Los_Angeles';
        if (timezone.includes('Central') && timezone.includes('US')) return 'America/Chicago';
        if (timezone.includes('GMT') || timezone.includes('UTC')) return 'UTC';
        
        return timezone;
      }
    };
    
    const convertToUserTimezone = (sourceDate: Date) => {
      return sourceDate; // Keep original for now
    };
    
    const adjustedStart = convertToUserTimezone(event.start);
    const adjustedEnd = convertToUserTimezone(event.end);
    
    const googleEvent = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: adjustedStart.toISOString(),
        // No timeZone specified - Google Calendar will treat as user's local time
      },
      end: {
        dateTime: adjustedEnd.toISOString(),
        // No timeZone specified - Google Calendar will treat as user's local time
      },
      status: event.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed',
    };

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: googleEvent,
    });
    
    console.log(`✅ Successfully updated event. New event ID: ${response.data.id}, Status: ${response.data.status}`);
  } catch (error) {
    console.error(`❌ Failed to update event ${eventId}:`, error);
    throw new Error(`Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getExistingGoogleEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  retryCount: number = 0
): Promise<{ [uid: string]: string }> {
  try {
    console.log(`🔍 Checking for existing events in calendar ${calendarId} from ${timeMin.toISOString()} to ${timeMax.toISOString()} (attempt ${retryCount + 1})`);
    const calendar = await getGoogleCalendarClient();
    
    // Add a small delay on retries to handle eventual consistency
    if (retryCount > 0) {
      console.log(`⏳ Waiting ${retryCount * 2} seconds for eventual consistency...`);
      await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
    }
    
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
      // Force fresh data, not cached
      showDeleted: false,
    });

    console.log(`📊 Found ${response.data.items?.length || 0} existing events in Google Calendar`);

    const existingEvents: { [uid: string]: string } = {};
    
    response.data.items?.forEach(event => {
      console.log(`🔍 Checking event: "${event.summary}" - Description: ${event.description?.substring(0, 100)}...`);
      if (event.id && event.description && event.start?.dateTime) {
        const match = event.description.match(/Original UID: (.+)/);
        if (match) {
          // Create unique key combining UID and start datetime for recurring events
          const originalUid = match[1].trim(); // Trim whitespace
          const startDateTime = new Date(event.start.dateTime).toISOString();
          const uniqueKey = `${originalUid}:${startDateTime}`;
          console.log(`✅ Found existing event: ${uniqueKey} -> Google Event ID: ${event.id}`);
          existingEvents[uniqueKey] = event.id;
        } else {
          console.log(`⚠️  Event "${event.summary}" has no Original UID pattern in description`);
        }
      } else {
        console.log(`⚠️  Skipping event "${event.summary}" - missing required fields (ID: ${!!event.id}, Description: ${!!event.description}, DateTime: ${!!event.start?.dateTime})`);
      }
    });

    console.log(`📋 Total existing events with Original UID: ${Object.keys(existingEvents).length}`);
    return existingEvents;
  } catch (error: any) {
    console.error(`❌ Error fetching existing events:`, error);
    
    // Handle authentication errors specifically
    if (error.code === 401 || error.status === 401) {
      throw new Error('Google Calendar authentication expired. Please sign out and sign back in to re-authenticate.');
    }
    
    throw new Error(`Failed to fetch existing events: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}