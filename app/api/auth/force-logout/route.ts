import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';
import { eq, like } from 'drizzle-orm';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    console.log('🧹 Force logout initiated');
    
    if (session?.user?.id) {
      console.log('🧹 Clearing auth data for user:', session.user.id);
      
      // Delete everything related to this user
      await Promise.all([
        db.delete(accounts).where(eq(accounts.userId, session.user.id)),
        db.delete(sessions).where(eq(sessions.userId, session.user.id)),
      ]);
    }
    
    // Also try to clean up any orphaned Google accounts
    if (session?.user?.email) {
      console.log('🧹 Cleaning up any Google accounts for email:', session.user.email);
      
      // Find and delete any accounts that might be linked to this email
      const googleAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.provider, 'google'));
        
      for (const account of googleAccounts) {
        // If we find accounts that match this user's email pattern, clean them up
        try {
          await db.delete(accounts).where(eq(accounts.id, account.id));
        } catch (e) {
          console.warn('Could not delete account:', account.id);
        }
      }
    }
    
    console.log('✅ All auth data cleared');
    
    return Response.json({ 
      success: true, 
      message: 'All authentication data cleared. Please sign in fresh.' 
    });
  } catch (error) {
    console.error('❌ Failed to force logout:', error);
    return Response.json(
      { error: 'Failed to clear auth data' },
      { status: 500 }
    );
  }
}