import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';
import { eq, isNull, lt } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startTime = Date.now();
  
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('Authorization');
    const userAgent = request.headers.get('User-Agent');
    
    // Check for Vercel Cron user agent or auth token
    const isVercelCron = userAgent?.includes('vercel-cron') || 
                        authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (process.env.NODE_ENV === 'production' && !isVercelCron) {
      console.log('❌ Unauthorized cleanup cron request', { userAgent, hasAuth: !!authHeader });
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Running periodic auth cleanup job', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      userAgent: userAgent?.substring(0, 50)
    });
    
    // Validate required environment variables
    const requiredEnvVars = ['DATABASE_URL'];
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Clean up expired sessions 
    const now = new Date();
    const expiredSessionsResult = await db
      .delete(sessions)
      .where(lt(sessions.expires, now));
    
    console.log(`🗑️ Removed ${expiredSessionsResult.rowCount || 0} expired sessions`);
    
    // Find and clean orphaned records
    const orphanedUsers = await db
      .select({ 
        id: users.id, 
        email: users.email,
        name: users.name 
      })
      .from(users)
      .leftJoin(accounts, eq(accounts.userId, users.id))
      .where(isNull(accounts.userId));
    
    const orphanedAccounts = await db
      .select({ 
        id: accounts.id,
        provider: accounts.provider,
        userId: accounts.userId
      })  
      .from(accounts)
      .leftJoin(users, eq(users.id, accounts.userId))
      .where(isNull(users.id));
    
    // Clean up orphaned sessions (sessions without users)
    const orphanedSessions = await db
      .select({ 
        id: sessions.id, 
        userId: sessions.userId 
      })
      .from(sessions)
      .leftJoin(users, eq(users.id, sessions.userId))
      .where(isNull(users.id));
    
    let cleaned = 0;
    
    // Remove orphaned users
    if (orphanedUsers.length > 0) {
      console.log(`🗑️ Found ${orphanedUsers.length} orphaned users:`, orphanedUsers.map(u => u.email));
      for (const user of orphanedUsers) {
        await db.delete(users).where(eq(users.id, user.id));
        cleaned++;
      }
    }
    
    // Remove orphaned accounts  
    if (orphanedAccounts.length > 0) {
      console.log(`🗑️ Found ${orphanedAccounts.length} orphaned accounts`);
      for (const account of orphanedAccounts) {
        await db.delete(accounts).where(eq(accounts.id, account.id));
        cleaned++;
      }
    }
    
    // Remove orphaned sessions
    if (orphanedSessions.length > 0) {
      console.log(`🗑️ Found ${orphanedSessions.length} orphaned sessions`);
      for (const session of orphanedSessions) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        cleaned++;
      }
    }
    
    const duration = Date.now() - startTime;
    const summary = {
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      environment: process.env.NODE_ENV,
      expiredSessions: expiredSessionsResult.rowCount || 0,
      orphanedUsers: orphanedUsers.length,
      orphanedAccounts: orphanedAccounts.length,
      orphanedSessions: orphanedSessions.length,
      totalCleaned: cleaned + (expiredSessionsResult.rowCount || 0)
    };
    
    console.log(`✅ Periodic cleanup complete:`, summary);
    
    return Response.json({ 
      success: true, 
      message: `Cleanup job completed - removed ${summary.totalCleaned} total records`,
      ...summary
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Cleanup job failed';
    
    console.error('❌ Periodic cleanup failed:', {
      error: errorMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return Response.json(
      { 
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        environment: process.env.NODE_ENV
      },
      { status: 500 }
    );
  }
}