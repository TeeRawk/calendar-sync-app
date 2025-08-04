import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { refreshTokenProactively, sessionUtils } from '@/lib/auth-middleware';
import { refreshRateLimit, getClientIdentifier, createRateLimitResponse, applyRateLimit } from '@/lib/rate-limit';
import { logErrorSafely, createErrorResponse } from '@/lib/error-sanitizer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/refresh
 * Manually refresh the user's access token
 */
export async function POST(request: NextRequest) {
  let session: any = null;
  try {
    // Apply rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimit = applyRateLimit(refreshRateLimit, clientId);
    
    if (!rateLimit.allowed) {
      console.warn('🚫 Rate limit exceeded for refresh endpoint:', clientId);
      return createRateLimitResponse(rateLimit.retryAfter!);
    }

    session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'UNAUTHENTICATED', message: 'No active session' },
        { status: 401 }
      );
    }

    console.log('🔄 Manual token refresh requested for user:', session.user.id);

    const refreshResult = await refreshTokenProactively(session.user.id);

    if (!refreshResult.success) {
      console.error('❌ Token refresh failed:', refreshResult.error);
      return NextResponse.json(
        { 
          error: 'REFRESH_FAILED', 
          message: refreshResult.error || 'Failed to refresh token',
          requiresReauth: true
        },
        { status: 401 }
      );
    }

    console.log('✅ Token refreshed successfully');

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: refreshResult.expiresAt,
      expiresIn: refreshResult.expiresAt ? refreshResult.expiresAt - Math.floor(Date.now() / 1000) : null
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    logErrorSafely(error, 'Token refresh POST endpoint', session?.user?.id, requestId);
    return createErrorResponse(error, 500, requestId);
  }
}

/**
 * GET /api/auth/refresh
 * Check token status and refresh if needed
 */
export async function GET(request: NextRequest) {
  let session: any = null;
  try {
    // Apply rate limiting for GET requests too
    const clientId = getClientIdentifier(request);
    const rateLimit = applyRateLimit(refreshRateLimit, clientId);
    
    if (!rateLimit.allowed) {
      console.warn('🚫 Rate limit exceeded for refresh status endpoint:', clientId);
      return createRateLimitResponse(rateLimit.retryAfter!);
    }

    session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { 
          authenticated: false,
          error: 'UNAUTHENTICATED',
          message: 'No active session' 
        },
        { status: 401 }
      );
    }

    // Get current token status
    const { db } = await import('@/lib/db');
    const { accounts } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    if (!account[0]?.access_token) {
      return NextResponse.json(
        {
          authenticated: false,
          error: 'NO_GOOGLE_ACCOUNT',
          message: 'No Google account connected',
          requiresReauth: true
        },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = account[0].expires_at;
    const isExpired = sessionUtils.isTokenExpired(expiresAt);
    const expiringSoon = sessionUtils.isTokenExpiringSoon(expiresAt, 5);

    let refreshed = false;
    let newExpiresAt = expiresAt;

    // Auto-refresh if expiring soon
    if (expiringSoon && !isExpired) {
      console.log('🔄 Token expires soon, auto-refreshing...');
      const refreshResult = await refreshTokenProactively(session.user.id);
      
      if (refreshResult.success) {
        refreshed = true;
        newExpiresAt = refreshResult.expiresAt || null;
        console.log('✅ Auto-refresh successful');
      } else {
        console.warn('⚠️ Auto-refresh failed:', refreshResult.error);
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      },
      token: {
        expiresAt: newExpiresAt,
        expiresIn: newExpiresAt ? newExpiresAt - now : null,
        isExpired: sessionUtils.isTokenExpired(newExpiresAt),
        expiringSoon: sessionUtils.isTokenExpiringSoon(newExpiresAt, 5),
        refreshed
      }
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    logErrorSafely(error, 'Token refresh GET endpoint', session?.user?.id, requestId);
    return createErrorResponse(error, 500, requestId);
  }
}