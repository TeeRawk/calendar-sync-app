import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { google } from 'googleapis';
import crypto from 'crypto';

export interface AuthMiddlewareContext {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface TokenRefreshResult {
  success: boolean;
  newToken?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * Middleware wrapper that automatically handles token refresh for authenticated routes
 */
export async function withTokenRefresh<T>(
  request: NextRequest,
  handler: (request: NextRequest, context: AuthMiddlewareContext) => Promise<T>
): Promise<T | NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'UNAUTHENTICATED', message: 'No active session found' },
        { status: 401 }
      );
    }

    // Get account from database
    const { db } = await import('./db');
    const { accounts } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    if (!account[0]?.access_token) {
      return NextResponse.json(
        { error: 'NO_GOOGLE_ACCOUNT', message: 'No Google account connected' },
        { status: 401 }
      );
    }

    let accessToken = account[0].access_token;
    let expiresAt = account[0].expires_at;
    
    // Check if token needs refresh (5 minutes buffer)
    const now = Math.floor(Date.now() / 1000);
    const refreshBuffer = 5 * 60; // 5 minutes
    
    if (expiresAt && expiresAt < (now + refreshBuffer)) {
      console.log('🔄 Token expires soon, refreshing proactively...');
      
      const refreshResult = await refreshTokenProactively(session.user.id);
      
      if (!refreshResult.success) {
        return NextResponse.json(
          { error: 'TOKEN_REFRESH_FAILED', message: refreshResult.error || 'Failed to refresh token' },
          { status: 401 }
        );
      }
      
      accessToken = refreshResult.newToken!;
      expiresAt = refreshResult.expiresAt || null;
    }

    const context: AuthMiddlewareContext = {
      userId: session.user.id,
      accessToken,
      refreshToken: account[0].refresh_token || undefined,
      expiresAt: expiresAt || undefined
    };

    return await handler(request, context);
  } catch (error) {
    console.error('Auth middleware error:', error);
    return NextResponse.json(
      { error: 'AUTH_MIDDLEWARE_ERROR', message: 'Authentication middleware failed' },
      { status: 500 }
    );
  }
}

/**
 * Proactively refresh access token before it expires
 */
export async function refreshTokenProactively(userId: string): Promise<TokenRefreshResult> {
  try {
    const { db } = await import('./db');
    const { accounts } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);

    if (!account[0]?.refresh_token) {
      return {
        success: false,
        error: 'No refresh token available'
      };
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: account[0].refresh_token
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update database with new token
    await db
      .update(accounts)
      .set({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null
      })
      .where(eq(accounts.userId, userId));

    return {
      success: true,
      newToken: credentials.access_token!,
      expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : undefined
    };
  } catch (error) {
    console.error('Token refresh failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown refresh error'
    };
  }
}

/**
 * Get authenticated Google client with automatic token refresh
 */
export async function getAuthenticatedGoogleClient(userId: string) {
  const { db } = await import('./db');
  const { accounts } = await import('./db/schema');
  const { eq } = await import('drizzle-orm');

  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (!account[0]?.access_token) {
    throw new Error('No Google account connected');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account[0].access_token,
    refresh_token: account[0].refresh_token
  });

  // Set up automatic token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(accounts)
        .set({
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
        })
        .where(eq(accounts.userId, userId));
    }
  });

  return oauth2Client;
}

/**
 * Security utilities for OAuth and PKCE
 */
export const SecurityUtils = {
  /**
   * Generate a secure random state parameter
   */
  generateSecureState(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge
    };
  },

  /**
   * Validate state parameter
   */
  validateState(receivedState: string, expectedState: string): boolean {
    try {
      const decodedState = JSON.parse(Buffer.from(receivedState, 'base64').toString());
      return decodedState.nonce === expectedState;
    } catch {
      return false;
    }
  }
};

/**
 * Token refresh scheduler for background token refresh
 */
export class TokenRefreshScheduler {
  private static instance: TokenRefreshScheduler;
  private refreshTimeouts: Map<string, NodeJS.Timeout> = new Map();

  static getInstance(): TokenRefreshScheduler {
    if (!TokenRefreshScheduler.instance) {
      TokenRefreshScheduler.instance = new TokenRefreshScheduler();
    }
    return TokenRefreshScheduler.instance;
  }

  /**
   * Schedule token refresh before expiration
   */
  scheduleRefresh(userId: string, expiresAt: number): void {
    // Clear existing timeout if any
    this.cancelRefresh(userId);

    const now = Math.floor(Date.now() / 1000);
    const refreshTime = expiresAt - (5 * 60); // Refresh 5 minutes before expiration
    const delay = Math.max(0, (refreshTime - now) * 1000);

    if (delay > 0) {
      const timeout = setTimeout(async () => {
        console.log(`🔄 Scheduled token refresh for user: ${userId}`);
        try {
          await refreshTokenProactively(userId);
          console.log(`✅ Scheduled token refresh completed for user: ${userId}`);
        } catch (error) {
          console.error(`❌ Scheduled token refresh failed for user: ${userId}`, error);
        }
        this.refreshTimeouts.delete(userId);
      }, delay);

      this.refreshTimeouts.set(userId, timeout);
      console.log(`⏰ Token refresh scheduled for user ${userId} in ${delay / 1000} seconds`);
    }
  }

  /**
   * Cancel scheduled refresh for a user
   */
  cancelRefresh(userId: string): void {
    const timeout = this.refreshTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.refreshTimeouts.delete(userId);
      console.log(`❌ Cancelled scheduled token refresh for user: ${userId}`);
    }
  }

  /**
   * Get all scheduled refreshes (for monitoring)
   */
  getScheduledRefreshes(): string[] {
    return Array.from(this.refreshTimeouts.keys());
  }
}

/**
 * Add security headers to response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CORS headers for OAuth
  response.headers.set('Access-Control-Allow-Origin', process.env.NEXTAUTH_URL || 'http://localhost:3000');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  return response;
}

/**
 * Utility functions for session management
 */
export const sessionUtils = {
  /**
   * Set secure authentication cookie
   */
  setAuthCookie(response: NextResponse, token: string, maxAge: number = 7 * 24 * 60 * 60) {
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/'
    });
  },

  /**
   * Clear authentication cookie
   */
  clearAuthCookie(response: NextResponse) {
    response.cookies.delete('auth-token');
  },

  /**
   * Check token expiration
   */
  isTokenExpired(expiresAt?: number | null): boolean {
    if (!expiresAt) return true;
    return expiresAt < Math.floor(Date.now() / 1000);
  },

  /**
   * Check if token expires soon (within buffer time)
   */
  isTokenExpiringSoon(expiresAt?: number | null, bufferMinutes: number = 5): boolean {
    if (!expiresAt) return true;
    const buffer = bufferMinutes * 60;
    return expiresAt < (Math.floor(Date.now() / 1000) + buffer);
  }
};