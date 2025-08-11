import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';

export async function GET() {
  try {
    console.log('🔍 Checking current auth state in database');
    
    // Select only stable columns to avoid issues if optional columns are not migrated yet
    const allUsers = await db.select({ id: users.id, email: users.email, name: users.name }).from(users);
    const allAccounts = await db.select().from(accounts);
    const allSessions = await db.select().from(sessions);
    
    console.log('📊 Database state:');
    console.log('  Users:', allUsers.length);
    console.log('  Accounts:', allAccounts.length);
    console.log('  Sessions:', allSessions.length);
    
    return Response.json({ 
      users: allUsers.map(u => ({ id: u.id, email: u.email, name: u.name })),
      accounts: allAccounts.map(a => ({ 
        id: a.id, 
        userId: a.userId, 
        provider: a.provider, 
        providerAccountId: a.providerAccountId,
        hasRefreshToken: !!a.refresh_token,
        hasAccessToken: !!a.access_token 
      })),
      sessions: allSessions.map(s => ({ id: s.id, userId: s.userId, expires: s.expires }))
    });
  } catch (error) {
    console.error('❌ Failed to check auth state:', error);
    return Response.json(
      { error: 'Failed to check auth state' },
      { status: 500 }
    );
  }
}