import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 OAuth Token Clear Request');
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log(`🔍 Clearing OAuth tokens for user: ${session.user.id}`);

    // Delete all Google OAuth accounts for this user
    const deletedAccounts = await db
      .delete(accounts)
      .where(eq(accounts.userId, session.user.id))
      .returning();

    console.log(`✅ Deleted ${deletedAccounts.length} OAuth accounts`);

    return NextResponse.json({ 
      success: true, 
      message: `Cleared ${deletedAccounts.length} OAuth accounts. Please sign in again to grant new permissions.`,
      accountsCleared: deletedAccounts.length
    });

  } catch (error) {
    console.error('❌ Error clearing OAuth tokens:', error);
    return NextResponse.json(
      { error: 'Failed to clear OAuth tokens' }, 
      { status: 500 }
    );
  }
}