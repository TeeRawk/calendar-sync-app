import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Delete all accounts for this user to force re-authentication
    const result = await db
      .delete(accounts)
      .where(eq(accounts.userId, session.user.id));

    console.log('🗑️ Deleted user accounts to force re-auth');

    return Response.json({ 
      success: true, 
      message: 'Account records deleted. Please sign out and sign back in.',
      deletedRecords: result.rowCount || 0
    });
  } catch (error) {
    console.error('Reset auth error:', error);
    return Response.json({ error: 'Failed to reset auth' }, { status: 500 });
  }
}