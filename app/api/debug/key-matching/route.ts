import { NextRequest, NextResponse } from 'next/server';
import { parseICSFromUrlWithExpansion } from '@/lib/ics-parser';
import { getExistingGoogleEvents } from '@/lib/google-calendar';

/**
 * DEBUG ENDPOINT: Compare ICS event keys with Google Calendar keys
 * This helps identify why duplicates aren't being detected properly
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const icsUrl = searchParams.get('icsUrl');
    const calendarId = searchParams.get('calendarId') || 'primary';
    
    if (!icsUrl) {
      return NextResponse.json({
        error: 'Missing icsUrl parameter'
      }, { status: 400 });
    }

    console.log('🔍 DEBUG: Starting key matching analysis');
    console.log(`   ICS URL: ${icsUrl}`);
    console.log(`   Calendar ID: ${calendarId}`);

    // Setup date range (current month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    console.log(`   Date range: ${monthStart.toISOString()} to ${monthEnd.toISOString()}`);

    // Parse ICS events
    const icsEvents = await parseICSFromUrlWithExpansion(icsUrl, monthStart, monthEnd);
    console.log(`   ✅ Found ${icsEvents.length} ICS events`);

    if (icsEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No ICS events found for current month',
        icsEvents: 0,
        googleEvents: 0
      });
    }

    // Get existing Google Calendar events
    const existingEvents = await getExistingGoogleEvents(calendarId, monthStart, monthEnd, 0);
    console.log(`   📊 Found ${Object.keys(existingEvents).length} existing Google events with UID patterns`);

    // Generate ICS keys
    const icsKeys = icsEvents.map(event => {
      const key = `${event.uid}:${event.start.toISOString()}`;
      return {
        key,
        uid: event.uid,
        summary: event.summary,
        start: event.start.toISOString(),
        rawStart: event.start
      };
    });

    // Get Google keys
    const googleKeys = Object.keys(existingEvents).map(key => {
      const [uid, startTime] = key.split(':');
      return {
        key,
        uid,
        eventId: existingEvents[key],
        start: startTime,
        rawStart: new Date(startTime)
      };
    });

    // Find exact matches
    const exactMatches = [];
    const uidMatches = [];
    const missingEvents = [];

    for (const icsKey of icsKeys) {
      // Check for exact match
      const exactMatch = googleKeys.find(gKey => gKey.key === icsKey.key);
      
      if (exactMatch) {
        exactMatches.push({
          icsKey: icsKey.key,
          googleKey: exactMatch.key,
          googleEventId: exactMatch.eventId,
          summary: icsKey.summary
        });
      } else {
        // Check for UID match with different timestamp (timezone issue)
        const uidMatch = googleKeys.filter(gKey => gKey.uid === icsKey.uid);
        
        if (uidMatch.length > 0) {
          uidMatches.push({
            icsKey: icsKey.key,
            icsUid: icsKey.uid,
            summary: icsKey.summary,
            icsStart: icsKey.start,
            googleMatches: uidMatch.map(gKey => ({
              key: gKey.key,
              start: gKey.start,
              eventId: gKey.eventId,
              timeDiffMinutes: Math.abs(icsKey.rawStart.getTime() - gKey.rawStart.getTime()) / 1000 / 60
            }))
          });
        } else {
          missingEvents.push({
            key: icsKey.key,
            uid: icsKey.uid,
            summary: icsKey.summary,
            start: icsKey.start
          });
        }
      }
    }

    // Find extra Google events (not in ICS)
    const extraGoogleEvents = googleKeys.filter(gKey => 
      !icsKeys.some(iKey => iKey.uid === gKey.uid)
    );

    const result = {
      success: true,
      dateRange: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString()
      },
      icsUrl,
      calendarId,
      summary: {
        icsEvents: icsEvents.length,
        googleEvents: Object.keys(existingEvents).length,
        exactMatches: exactMatches.length,
        uidMatches: uidMatches.length,
        missingEvents: missingEvents.length,
        extraGoogleEvents: extraGoogleEvents.length
      },
      analysis: {
        exactMatches: exactMatches.slice(0, 10), // Limit output
        uidMatches: uidMatches.slice(0, 10),
        missingEvents: missingEvents.slice(0, 10),
        extraGoogleEvents: extraGoogleEvents.slice(0, 10)
      },
      debugging: {
        sampleIcsKeys: icsKeys.slice(0, 5),
        sampleGoogleKeys: googleKeys.slice(0, 5)
      }
    };

    console.log('✅ DEBUG: Key matching analysis complete');
    console.log(`   Exact matches: ${exactMatches.length}`);
    console.log(`   UID matches: ${uidMatches.length}`);
    console.log(`   Missing events: ${missingEvents.length}`);
    console.log(`   Extra Google events: ${extraGoogleEvents.length}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ DEBUG: Key matching analysis failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}