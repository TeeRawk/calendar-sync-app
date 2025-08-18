import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { calendarSyncs } from '../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncBusyFreeCalendar, isBusyFreeCalendar, detectPrivacyLevel } from '../../../lib/busy-free-sync-service';
import { parseBusyFreeICS } from '../../../lib/busy-free-parser';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const syncId = searchParams.get('syncId');

    if (syncId) {
      // Get specific busy/free sync
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

      return NextResponse.json({
        sync: calendarSync[0],
        isBusyFree: isBusyFreeCalendar(calendarSync[0].icsUrl)
      });
    }

    // Get all busy/free calendar syncs for the user
    const allSyncs = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.userId, session.user.id!));

    // Filter for busy/free calendars
    const busyFreeSyncs = allSyncs.filter((sync: any) => 
      sync.syncType === 'busy_free' || isBusyFreeCalendar(sync.icsUrl)
    );

    return NextResponse.json({
      syncs: busyFreeSyncs,
      total: busyFreeSyncs.length
    });

  } catch (error) {
    console.error('Error fetching busy/free syncs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch busy/free calendar syncs' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, icsUrl, googleCalendarId, privacyLevel } = await request.json();

    // Validate required fields
    if (!name || !icsUrl || !googleCalendarId) {
      return NextResponse.json({ 
        error: 'Missing required fields: name, icsUrl, googleCalendarId' 
      }, { status: 400 });
    }

    // Validate ICS URL is accessible and contains busy/free data
    try {
      const busyFreeData = await parseBusyFreeICS(icsUrl, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      });

      if (!busyFreeData.events || busyFreeData.events.length === 0) {
        console.warn(`Warning: No busy/free events found in calendar ${icsUrl}`);
      }

      // Auto-detect privacy level if not specified
      const detectedPrivacyLevel = privacyLevel || detectPrivacyLevel(
        icsUrl,
        busyFreeData.events.map(e => e.summary)
      );

      // Create the busy/free calendar sync
      const newSync = await db.insert(calendarSyncs).values({
        userId: session.user.id!,
        name,
        icsUrl,
        googleCalendarId,
        syncType: 'busy_free',
        privacyLevel: detectedPrivacyLevel,
        isActive: true,
      }).returning();

      return NextResponse.json({
        sync: newSync[0],
        message: 'Busy/free calendar sync created successfully',
        detectedEvents: busyFreeData.events.length,
        detectedPrivacyLevel
      }, { status: 201 });

    } catch (parseError) {
      console.error('Error validating busy/free calendar URL:', parseError);
      return NextResponse.json({ 
        error: `Invalid busy/free calendar URL: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` 
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error creating busy/free sync:', error);
    return NextResponse.json({ 
      error: 'Failed to create busy/free calendar sync' 
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { syncId, name, privacyLevel, isActive } = await request.json();

    if (!syncId) {
      return NextResponse.json({ error: 'Missing syncId' }, { status: 400 });
    }

    // Verify ownership
    const existingSync = await db
      .select()
      .from(calendarSyncs)
      .where(and(
        eq(calendarSyncs.id, syncId),
        eq(calendarSyncs.userId, session.user.id!)
      ))
      .limit(1);

    if (!existingSync[0]) {
      return NextResponse.json({ error: 'Calendar sync not found' }, { status: 404 });
    }

    // Update the sync
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (privacyLevel !== undefined) updateData.privacyLevel = privacyLevel;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedSync = await db
      .update(calendarSyncs)
      .set(updateData)
      .where(eq(calendarSyncs.id, syncId))
      .returning();

    return NextResponse.json({
      sync: updatedSync[0],
      message: 'Busy/free calendar sync updated successfully'
    });

  } catch (error) {
    console.error('Error updating busy/free sync:', error);
    return NextResponse.json({ 
      error: 'Failed to update busy/free calendar sync' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const syncId = searchParams.get('syncId');

    if (!syncId) {
      return NextResponse.json({ error: 'Missing syncId' }, { status: 400 });
    }

    // Verify ownership
    const existingSync = await db
      .select()
      .from(calendarSyncs)
      .where(and(
        eq(calendarSyncs.id, syncId),
        eq(calendarSyncs.userId, session.user.id!)
      ))
      .limit(1);

    if (!existingSync[0]) {
      return NextResponse.json({ error: 'Calendar sync not found' }, { status: 404 });
    }

    // Delete the sync (cascade will handle related records)
    await db
      .delete(calendarSyncs)
      .where(eq(calendarSyncs.id, syncId));

    return NextResponse.json({
      message: 'Busy/free calendar sync deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting busy/free sync:', error);
    return NextResponse.json({ 
      error: 'Failed to delete busy/free calendar sync' 
    }, { status: 500 });
  }
}