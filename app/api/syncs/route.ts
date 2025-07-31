import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendarSyncs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserCalendars } from '@/lib/google-calendar';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userSyncs = await db
      .select()
      .from(calendarSyncs)
      .where(eq(calendarSyncs.userId, session.user.id))
      .orderBy(calendarSyncs.createdAt);

    // Get Google calendar names
    const calendars = await getUserCalendars();
    const calendarMap = new Map(calendars.map(cal => [cal.id, cal.summary]));

    const syncsWithCalendarNames = userSyncs.map(sync => ({
      ...sync,
      googleCalendarName: calendarMap.get(sync.googleCalendarId) || 'Unknown Calendar',
    }));

    return Response.json(syncsWithCalendarNames);
  } catch (error) {
    console.error('Failed to fetch syncs:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { name, icsUrl, googleCalendarId } = body;

    if (!name || !icsUrl || !googleCalendarId) {
      return new Response('Missing required fields', { status: 400 });
    }

    const newSync = await db
      .insert(calendarSyncs)
      .values({
        userId: session.user.id,
        name,
        icsUrl,
        googleCalendarId,
        isActive: true,
      })
      .returning();

    return Response.json(newSync[0]);
  } catch (error) {
    console.error('Failed to create sync:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}