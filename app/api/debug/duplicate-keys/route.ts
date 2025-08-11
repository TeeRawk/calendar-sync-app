import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendarSyncs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { parseICSFromUrlWithExpansion } from '@/lib/ics-parser';
import { getExistingGoogleEvents } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const syncId = url.searchParams.get('syncId');
    
    if (!syncId) {
      return Response.json({ error: 'syncId parameter required' }, { status: 400 });
    }

    // Get calendar sync configuration
    const calendarSync = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.id, syncId))
      .limit(1);

    if (!calendarSync[0]) {
      return Response.json({ error: 'Calendar sync not found' }, { status: 404 });
    }

    const config = calendarSync[0];
    
    // Get current month date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    console.log(`🔍 Debug: Fetching ICS events from ${config.icsUrl}`);
    
    // Parse ICS events
    const icsEvents = await parseICSFromUrlWithExpansion(config.icsUrl, monthStart, monthEnd);
    console.log(`📥 Found ${icsEvents.length} ICS events`);
    
    // Get existing Google Calendar events
    const existingEvents = await getExistingGoogleEvents(
      config.googleCalendarId,
      monthStart,
      monthEnd
    );
    console.log(`📊 Found ${Object.keys(existingEvents).length} existing Google events with Original UID`);
    
    // Create analysis of keys
    const icsKeys = icsEvents.map(event => ({
      event: event.summary,
      uid: event.uid,
      startTime: event.start.toISOString(),
      key: `${event.uid}:${event.start.toISOString()}`,
      sourceTimezone: event.sourceTimezone
    }));
    
    const googleKeys = Object.keys(existingEvents).map(key => ({
      key,
      googleEventId: existingEvents[key],
      parts: key.split(':')
    }));
    
    // Find potential matches and mismatches
    const matches = [];
    const mismatches = [];
    
    for (const icsKey of icsKeys) {
      const hasMatch = existingEvents[icsKey.key];
      if (hasMatch) {
        matches.push({
          icsEvent: icsKey.event,
          key: icsKey.key,
          googleEventId: hasMatch
        });
      } else {
        // Check for close matches (maybe timezone issues)
        const closeMatches = googleKeys.filter(gKey => 
          gKey.parts[0] === icsKey.uid && // Same UID
          Math.abs(new Date(gKey.parts[1]).getTime() - new Date(icsKey.startTime).getTime()) < 24 * 60 * 60 * 1000 // Within 24 hours
        );
        
        mismatches.push({
          icsEvent: icsKey.event,
          icsKey: icsKey.key,
          icsStartTime: icsKey.startTime,
          sourceTimezone: icsKey.sourceTimezone,
          closeMatches: closeMatches.map(cm => ({
            googleKey: cm.key,
            googleStartTime: cm.parts[1],
            timeDifference: new Date(cm.parts[1]).getTime() - new Date(icsKey.startTime).getTime()
          }))
        });
      }
    }
    
    return Response.json({
      config: {
        name: config.name,
        icsUrl: config.icsUrl,
        googleCalendarId: config.googleCalendarId
      },
      dateRange: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString()
      },
      summary: {
        icsEventsCount: icsEvents.length,
        googleEventsCount: Object.keys(existingEvents).length,
        matchesCount: matches.length,
        mismatchesCount: mismatches.length
      },
      icsKeys,
      googleKeys,
      matches,
      mismatches
    });
    
  } catch (error) {
    console.error('❌ Debug duplicate keys error:', error);
    return Response.json({ 
      error: 'Failed to debug duplicate keys',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}