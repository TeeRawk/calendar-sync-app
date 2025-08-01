import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

export async function POST() {
  try {
    console.log('🧹 Starting orphaned records cleanup');
    
    // Find users without any linked accounts
    const orphanedUsers = await db
      .select({ 
        id: users.id, 
        email: users.email,
        name: users.name 
      })
      .from(users)
      .leftJoin(accounts, eq(accounts.userId, users.id))
      .where(isNull(accounts.userId));
    
    // Find accounts without corresponding users
    const orphanedAccounts = await db
      .select({ 
        id: accounts.id, 
        userId: accounts.userId,
        provider: accounts.provider 
      })
      .from(accounts)
      .leftJoin(users, eq(users.id, accounts.userId))
      .where(isNull(users.id));
    
    // Find sessions without corresponding users
    const orphanedSessions = await db
      .select({ 
        id: sessions.id, 
        userId: sessions.userId 
      })
      .from(sessions)
      .leftJoin(users, eq(users.id, sessions.userId))
      .where(isNull(users.id));
    
    let cleaned = 0;
    
    // Clean up orphaned users (users without accounts)
    if (orphanedUsers.length > 0) {
      console.log(`🗑️ Removing ${orphanedUsers.length} orphaned users`);
      for (const user of orphanedUsers) {
        await db.delete(users).where(eq(users.id, user.id));
        cleaned++;
      }
    }
    
    // Clean up orphaned accounts (accounts without users)
    if (orphanedAccounts.length > 0) {
      console.log(`🗑️ Removing ${orphanedAccounts.length} orphaned accounts`);
      for (const account of orphanedAccounts) {
        await db.delete(accounts).where(eq(accounts.id, account.id));
        cleaned++;
      }
    }
    
    // Clean up orphaned sessions (sessions without users)
    if (orphanedSessions.length > 0) {
      console.log(`🗑️ Removing ${orphanedSessions.length} orphaned sessions`);
      for (const session of orphanedSessions) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        cleaned++;
      }
    }
    
    console.log(`✅ Cleanup complete - removed ${cleaned} orphaned records`);
    
    return Response.json({ 
      success: true, 
      message: `Cleaned up ${cleaned} orphaned records`,
      details: {
        orphanedUsers: orphanedUsers.length,
        orphanedAccounts: orphanedAccounts.length,
        orphanedSessions: orphanedSessions.length
      }
    });
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return Response.json(
      { error: 'Failed to cleanup orphaned records' },
      { status: 500 }
    );
  }
}