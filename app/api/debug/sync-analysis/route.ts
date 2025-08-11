import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendarSyncs, syncLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
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
    const performDryRun = url.searchParams.get('dryRun') === 'true';
    
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
    
    console.log('🔍 SYNC ANALYSIS - Starting comprehensive analysis');
    console.log('⚙️ Config:', {
      id: config.id,
      name: config.name,
      icsUrl: config.icsUrl,
      googleCalendarId: config.googleCalendarId,
      lastSync: config.lastSync
    });

    // Get current month date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    console.log('📅 Date range:', {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString()
    });

    // Step 1: Parse ICS events
    console.log('📥 STEP 1: Parsing ICS events...');
    const icsEvents = await parseICSFromUrlWithExpansion(config.icsUrl, monthStart, monthEnd);
    console.log(`✅ Found ${icsEvents.length} ICS events`);

    // Step 2: Get existing Google Calendar events
    console.log('🔍 STEP 2: Getting existing Google Calendar events...');
    const existingEventsMap = await getExistingGoogleEvents(
      config.googleCalendarId,
      monthStart,
      monthEnd
    );
    console.log(`✅ Found ${Object.keys(existingEventsMap).length} existing Google events with Original UID`);

    // Step 3: Analyze each ICS event for duplicate detection
    console.log('🎯 STEP 3: Analyzing duplicate detection for each event...');
    
    const analysis = {
      totalIcsEvents: icsEvents.length,
      existingGoogleEvents: Object.keys(existingEventsMap).length,
      duplicatesWouldUpdate: 0,
      newEventsWouldCreate: 0,
      potentialIssues: [] as any[],
      eventAnalysis: [] as any[],
      keyComparisons: {
        exactMatches: [] as any[],
        missedDuplicates: [] as any[],
        suspiciousPatterns: [] as any[]
      }
    };

    // Analyze each event
    icsEvents.slice(0, 20).forEach((event, index) => { // Limit to first 20 for API response size
      const uniqueKey = `${event.uid}:${event.start.toISOString()}`;
      const existingEventId = existingEventsMap[uniqueKey];
      const isDuplicate = !!existingEventId;
      
      const eventAnalysis = {
        index: index + 1,
        summary: event.summary,
        uid: event.uid,
        start: event.start.toISOString(),
        uniqueKey,
        keyLength: uniqueKey.length,
        isDuplicate,
        existingEventId: existingEventId || null,
        action: isDuplicate ? 'UPDATE' : 'CREATE',
        sourceTimezone: event.sourceTimezone
      };

      analysis.eventAnalysis.push(eventAnalysis);

      if (isDuplicate) {
        analysis.duplicatesWouldUpdate++;
        analysis.keyComparisons.exactMatches.push(eventAnalysis);
      } else {
        analysis.newEventsWouldCreate++;
        
        // Check for potential missed duplicates (same UID, different time)
        const sameUidKeys = Object.keys(existingEventsMap).filter(key => 
          key.startsWith(event.uid + ':')
        );
        
        if (sameUidKeys.length > 0) {
          const suspiciousPattern = {
            ...eventAnalysis,
            suspiciousMatches: sameUidKeys.map(key => {
              const [uid, timeStr] = key.split(':');
              const existingTime = new Date(timeStr);
              const timeDiff = existingTime.getTime() - event.start.getTime();
              return {
                existingKey: key,
                existingTime: timeStr,
                timeDifferenceMs: timeDiff,
                timeDifferenceHours: timeDiff / (1000 * 60 * 60),
                googleEventId: existingEventsMap[key]
              };
            })
          };
          
          analysis.keyComparisons.suspiciousPatterns.push(suspiciousPattern);
          analysis.potentialIssues.push(`Event "${event.summary}" has same UID but different time than ${sameUidKeys.length} existing events`);
        }
      }

      console.log(`${index + 1}. "${event.summary}"`);
      console.log(`   Key: ${uniqueKey}`);
      console.log(`   Action: ${isDuplicate ? '🔄 UPDATE' : '➕ CREATE'}`);
      if (isDuplicate) {
        console.log(`   Google ID: ${existingEventId}`);
      }
    });

    // Step 4: Get recent sync logs
    console.log('📊 STEP 4: Getting recent sync logs...');
    const recentLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.calendarSyncId, syncId))
      .orderBy(desc(syncLogs.createdAt))
      .limit(5);

    console.log(`✅ Found ${recentLogs.length} recent sync logs`);

    // Step 5: Final analysis
    console.log('📋 STEP 5: Final Analysis Summary');
    console.log(`   Total ICS events: ${analysis.totalIcsEvents}`);
    console.log(`   Existing Google events: ${analysis.existingGoogleEvents}`);
    console.log(`   Would update: ${analysis.duplicatesWouldUpdate}`);
    console.log(`   Would create: ${analysis.newEventsWouldCreate}`);
    console.log(`   Potential issues: ${analysis.potentialIssues.length}`);

    if (analysis.potentialIssues.length > 0) {
      console.log('⚠️  Potential Issues:');
      analysis.potentialIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }

    const response = {
      config: {
        id: config.id,
        name: config.name,
        icsUrl: config.icsUrl,
        googleCalendarId: config.googleCalendarId,
        lastSync: config.lastSync
      },
      dateRange: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString()
      },
      analysis,
      recentSyncLogs: recentLogs.map(log => ({
        createdAt: log.createdAt,
        status: log.status,
        eventsProcessed: log.eventsProcessed,
        eventsCreated: log.eventsCreated,
        eventsUpdated: log.eventsUpdated,
        errors: log.errors,
        duration: log.duration
      })),
      performedDryRun: performDryRun,
      timestamp: new Date().toISOString()
    };

    return Response.json(response);
    
  } catch (error) {
    console.error('❌ Sync analysis error:', error);
    return Response.json({ 
      error: 'Failed to analyze sync',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}