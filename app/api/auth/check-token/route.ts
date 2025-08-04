import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the user's Google account from the database
    const { db } = await import('@/lib/db');
    const { accounts } = await import('@/lib/db/schema');
    const { eq, and } = await import('drizzle-orm');

    const account = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, session.user.id),
          eq(accounts.provider, 'google')
        )
      )
      .limit(1);

    if (!account || account.length === 0) {
      console.log('❌ No Google account found for user');
      return NextResponse.json({ error: 'No Google account linked' }, { status: 400 });
    }

    const googleAccount = account[0];
    
    if (!googleAccount.access_token) {
      console.log('❌ No access token found');
      return NextResponse.json({ error: 'No access token' }, { status: 400 });
    }

    // Test the token by making a simple API call
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: googleAccount.access_token,
        refresh_token: googleAccount.refresh_token,
      });

      // Try to refresh token if it's expired
      if (googleAccount.expires_at && googleAccount.expires_at * 1000 < Date.now()) {
        console.log('🔄 Token expired, attempting refresh...');
        
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          
          if (credentials.access_token) {
            // Update the stored tokens
            await db
              .update(accounts)
              .set({
                access_token: credentials.access_token,
                expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
                refresh_token: credentials.refresh_token || googleAccount.refresh_token,
              })
              .where(eq(accounts.id, googleAccount.id));
            
            console.log('✅ Token refreshed successfully');
          }
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError);
          return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
        }
      }

      // Test with a simple calendar list request
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      await calendar.calendarList.list({ maxResults: 1 });
      
      console.log('✅ Token validation successful');
      return NextResponse.json({ valid: true });
      
    } catch (apiError: any) {
      console.error('❌ Google API call failed:', apiError?.message || apiError);
      
      // Check if it's an authentication error
      if (apiError?.code === 401 || apiError?.status === 401) {
        return NextResponse.json({ error: 'Token invalid' }, { status: 401 });
      }
      
      // For other errors, assume token is still valid but there's a temporary issue
      return NextResponse.json({ valid: true, warning: 'API call failed but token may be valid' });
    }

  } catch (error) {
    console.error('❌ Token check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}