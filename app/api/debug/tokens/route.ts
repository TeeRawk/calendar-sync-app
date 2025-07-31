import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user info
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    // Get accounts for this user
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id));

    return Response.json({
      user: user[0] ? {
        id: user[0].id,
        name: user[0].name,
        email: user[0].email,
      } : null,
      accounts: userAccounts.map(acc => ({
        id: acc.id,
        provider: acc.provider,
        providerAccountId: acc.providerAccountId,
        hasAccessToken: !!acc.access_token,
        hasRefreshToken: !!acc.refresh_token,
        accessTokenPreview: acc.access_token ? `${acc.access_token.substring(0, 20)}...` : null,
        refreshTokenPreview: acc.refresh_token ? `${acc.refresh_token.substring(0, 20)}...` : null,
        expiresAt: acc.expires_at,
        tokenType: acc.token_type,
        scope: acc.scope,
      })),
      sessionUserId: session.user.id,
    });
  } catch (error) {
    console.error('Debug tokens error:', error);
    return Response.json({ error: 'Failed to debug tokens' }, { status: 500 });
  }
}