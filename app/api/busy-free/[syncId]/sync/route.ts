import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { calendarSyncs } from '../../../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncBusyFreeCalendar } from '../../../../../lib/busy-free-sync-service';

interface RouteParams {
  params: {
    syncId: string;
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { syncId } = params;

    if (!syncId) {
      return NextResponse.json({ error: 'Missing syncId' }, { status: 400 });
    }

    // Verify ownership and that this is a busy/free calendar sync
    const calendarSync = await db
      .select()
      .from(calendarSyncs)
      .where(and(
        eq(calendarSyncs.id, syncId),
        eq(calendarSyncs.userId, session.user.id!)
      ))
      .limit(1);

    if (!calendarSync[0]) {
      return NextResponse.json({ error: 'Calendar sync not found' }, { status: 404 });
    }

    const sync = calendarSync[0] as any;

    // Check if this is actually a busy/free sync
    if (sync.syncType !== 'busy_free' && !sync.icsUrl?.includes('/basic.ics')) {
      return NextResponse.json({ 
        error: 'This endpoint is only for busy/free calendar syncs' 
      }, { status: 400 });
    }

    if (!sync.isActive) {
      return NextResponse.json({ error: 'Calendar sync is disabled' }, { status: 400 });
    }

    // Get user's timezone from request body if provided
    const body = await request.json().catch(() => ({}));
    const userTimeZone = body.userTimeZone;

    console.log(`🔒 Manual busy/free sync requested for: ${sync.name}`);
    console.log(`📋 ICS URL: ${sync.icsUrl}`);
    console.log(`🔐 Privacy level: ${sync.privacyLevel || 'busy_only'}`);
    console.log(`🌍 User timezone: ${userTimeZone || 'default'}`);

    // Perform the sync
    const syncResult = await syncBusyFreeCalendar(syncId, userTimeZone);

    return NextResponse.json({
      success: syncResult.success,
      message: syncResult.success 
        ? 'Busy/free calendar synced successfully' 
        : 'Busy/free calendar sync completed with errors',
      result: {
        eventsProcessed: syncResult.eventsProcessed,
        eventsCreated: syncResult.eventsCreated,
        eventsUpdated: syncResult.eventsUpdated,
        eventsSkipped: syncResult.eventsSkipped,
        errors: syncResult.errors,
        duration: syncResult.duration,
      },
      sync: {
        id: sync.id,
        name: sync.name,
        syncType: sync.syncType,
        privacyLevel: sync.privacyLevel,
        lastSync: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Error performing manual busy/free sync:', error);
    return NextResponse.json({ 
      success: false,
      error: `Failed to sync busy/free calendar: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}