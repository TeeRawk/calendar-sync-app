import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendarSyncs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncCalendar } from '@/lib/sync-service';

export async function POST(
  request: NextRequest,
  { params }: { params: { syncId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get user's timezone from request body
    const body = await request.json().catch(() => ({}));
    const userTimeZone = body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    console.log(`🌍 Received user timezone: ${userTimeZone}`);

    // Verify the sync belongs to the user
    const sync = await db
      .select()
      .from(calendarSyncs)
      .where(
        and(
          eq(calendarSyncs.id, params.syncId),
          eq(calendarSyncs.userId, session.user.id)
        )
      )
      .limit(1);

    if (!sync[0]) {
      return new Response('Sync not found', { status: 404 });
    }

    const result = await syncCalendar(params.syncId, userTimeZone);

    return Response.json(result);
  } catch (error) {
    console.error('Manual sync failed:', error);
    return Response.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}