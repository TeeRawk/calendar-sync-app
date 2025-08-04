import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';
import { sessionUtils } from '@/lib/auth-middleware';
import { authRateLimit, getClientIdentifier, createRateLimitResponse, applyRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout
 * Secure logout with optional token revocation
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = applyRateLimit(authRateLimit, clientId);
    
    if (!rateLimit.allowed) {
      console.warn('🚫 Rate limit exceeded for logout endpoint:', clientId);
      return createRateLimitResponse(rateLimit.retryAfter!);
    }

    const body = await request.json().catch(() => ({}));
    const { revokeToken = false } = body;

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      const response = NextResponse.json(
        { message: 'No active session to logout' },
        { status: 200 }
      );
      sessionUtils.clearAuthCookie(response);
      return response;
    }

    console.log(`🚪 Logout requested for user: ${session.user.id}, revoke token: ${revokeToken}`);

    // Get user's tokens for revocation if requested
    if (revokeToken) {
      try {
        const { db } = await import('@/lib/db');
        const { accounts } = await import('@/lib/db/schema');
        const { eq } = await import('drizzle-orm');

        const account = await db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, session.user.id))
          .limit(1);

        if (account[0]?.access_token) {
          // Revoke Google tokens
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );

          oauth2Client.setCredentials({
            access_token: account[0].access_token
          });

          await oauth2Client.revokeCredentials();
          console.log('✅ Google tokens revoked successfully');

          // Clear tokens from database
          await db
            .update(accounts)
            .set({
              access_token: null,
              refresh_token: null,
              expires_at: null
            })
            .where(eq(accounts.userId, session.user.id));

          console.log('🗑️ Tokens cleared from database');
        }
      } catch (revokeError) {
        console.warn('⚠️ Token revocation failed (continuing with logout):', revokeError);
      }
    }

    const response = NextResponse.json({
      success: true,
      message: revokeToken ? 'Logged out and tokens revoked' : 'Logged out successfully'
    });

    // Clear authentication cookies
    sessionUtils.clearAuthCookie(response);

    console.log('✅ Logout completed successfully');
    return response;
  } catch (error) {
    console.error('❌ Logout error:', error);
    const response = NextResponse.json(
      { error: 'LOGOUT_ERROR', message: 'Error during logout process' },
      { status: 500 }
    );
    
    // Clear cookies even on error
    sessionUtils.clearAuthCookie(response);
    return response;
  }
}

/**
 * GET /api/auth/logout
 * Check authentication status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    return NextResponse.json({
      authenticated: !!session?.user?.id,
      user: session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      } : null
    });
  } catch (error) {
    console.error('❌ Auth status check error:', error);
    return NextResponse.json(
      { error: 'STATUS_CHECK_ERROR', message: 'Failed to check authentication status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/logout
 * Force logout (admin/debug use)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (session?.user?.id) {
      // Force clear all tokens
      const { db } = await import('@/lib/db');
      const { accounts, sessions } = await import('@/lib/db/schema');
      const { eq } = await import('drizzle-orm');

      await Promise.all([
        // Clear account tokens
        db
          .update(accounts)
          .set({
            access_token: null,
            refresh_token: null,
            expires_at: null
          })
          .where(eq(accounts.userId, session.user.id)),
        
        // Clear active sessions
        db
          .delete(sessions)
          .where(eq(sessions.userId, session.user.id))
      ]);

      console.log('🧹 Force logout completed - all tokens and sessions cleared');
    }

    const response = NextResponse.json({
      success: true,
      message: 'Force logout completed'
    });

    sessionUtils.clearAuthCookie(response);
    return response;
  } catch (error) {
    console.error('❌ Force logout error:', error);
    return NextResponse.json(
      { error: 'FORCE_LOGOUT_ERROR', message: 'Error during force logout' },
      { status: 500 }
    );
  }
}