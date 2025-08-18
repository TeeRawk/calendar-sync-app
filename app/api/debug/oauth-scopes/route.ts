import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 OAuth Scopes Debug Request');
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log(`👤 Checking scopes for user: ${session.user.id}`);

    // Get all accounts for this user
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id));

    console.log(`📊 Found ${userAccounts.length} accounts`);

    const accountsInfo = userAccounts.map(account => ({
      id: account.id,
      provider: account.provider,
      type: account.type,
      hasAccessToken: !!account.access_token,
      hasRefreshToken: !!account.refresh_token,
      scope: account.scope || 'No scope recorded',
      expiresAt: account.expires_at ? new Date(account.expires_at * 1000).toISOString() : 'No expiration',
      tokenType: account.token_type
    }));

    // Try to get current scopes from Google
    let googleScopeInfo = null;
    const googleAccount = userAccounts.find(acc => acc.provider === 'google');
    
    if (googleAccount?.access_token) {
      try {
        console.log('🔍 Checking Google token info...');
        const tokenInfoResponse = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${googleAccount.access_token}`
        );
        
        if (tokenInfoResponse.ok) {
          const tokenInfo = await tokenInfoResponse.json();
          googleScopeInfo = {
            scopes: tokenInfo.scope ? tokenInfo.scope.split(' ') : [],
            audience: tokenInfo.aud,
            expires: tokenInfo.exp
          };
        }
      } catch (error) {
        console.log('❌ Failed to get Google token info:', error);
      }
    }

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      userEmail: session.user.email,
      accountsCount: userAccounts.length,
      accounts: accountsInfo,
      googleTokenInfo: googleScopeInfo,
      requiredScope: 'https://www.googleapis.com/auth/calendar',
      currentConfig: {
        scope: 'openid email profile https://www.googleapis.com/auth/calendar',
        accessType: 'offline',
        prompt: 'consent'
      }
    });

  } catch (error) {
    console.error('❌ Error checking OAuth scopes:', error);
    return NextResponse.json(
      { error: 'Failed to check OAuth scopes', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}