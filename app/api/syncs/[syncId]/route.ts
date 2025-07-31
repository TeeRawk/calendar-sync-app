import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calendarSyncs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { syncId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await db
      .delete(calendarSyncs)
      .where(
        and(
          eq(calendarSyncs.id, params.syncId),
          eq(calendarSyncs.userId, session.user.id)
        )
      );

    return new Response('Deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Failed to delete sync:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}