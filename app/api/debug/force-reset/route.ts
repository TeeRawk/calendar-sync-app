import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  try {
    // Delete all accounts, sessions, and users to force complete reset
    const accountsResult = await db.delete(accounts);
    const sessionsResult = await db.delete(sessions);
    const usersResult = await db.delete(users);

    console.log('🗑️ FORCE RESET: Deleted all authentication data');
    console.log(`  Accounts deleted: ${accountsResult.rowCount || 0}`);
    console.log(`  Sessions deleted: ${sessionsResult.rowCount || 0}`);
    console.log(`  Users deleted: ${usersResult.rowCount || 0}`);

    return Response.json({ 
      success: true, 
      message: 'All authentication data deleted. You must sign in again.',
      deletedRecords: {
        accounts: accountsResult.rowCount || 0,
        sessions: sessionsResult.rowCount || 0,
        users: usersResult.rowCount || 0
      }
    });
  } catch (error) {
    console.error('Force reset error:', error);
    return Response.json({ error: 'Failed to force reset' }, { status: 500 });
  }
}