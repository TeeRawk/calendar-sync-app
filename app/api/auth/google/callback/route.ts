import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { accounts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { TokenRefreshScheduler, addSecurityHeaders, SecurityUtils } from '@/lib/auth-middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Google OAuth 2.0 Callback Endpoint
 * 
 * Handles the callback from Google's authorization server after user consent.
 * Exchanges the authorization code for access and refresh tokens, then creates
 * or updates the user account in the database.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors from Google
    if (error) {
      console.error('❌ Google OAuth error:', error);
      const errorMessage = error === 'access_denied' 
        ? 'Access denied by user' 
        : `OAuth error: ${error}`;
      
      return NextResponse.redirect(
        new URL(`/auth/error?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('❌ Missing code or state parameter');
      return NextResponse.redirect(
        new URL('/auth/error?error=missing_parameters', request.url)
      );
    }

    // Validate Google OAuth credentials
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('❌ Missing Google OAuth credentials');
      return NextResponse.redirect(
        new URL('/auth/error?error=server_configuration', request.url)
      );
    }

    // Parse and validate state parameter
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (stateError) {
      console.error('❌ Invalid state parameter:', stateError);
      return NextResponse.redirect(
        new URL('/auth/error?error=invalid_state', request.url)
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${request.nextUrl.origin}/api/auth/google/callback`
    );

    console.log('🔄 Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier: stateData.codeVerifier // PKCE code verifier
    });

    if (!tokens.access_token) {
      console.error('❌ No access token received from Google');
      return NextResponse.redirect(
        new URL('/auth/error?error=no_access_token', request.url)
      );
    }

    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);

    // Get user information from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data;

    if (!userInfo.email || !userInfo.id) {
      console.error('❌ Incomplete user information from Google');
      return NextResponse.redirect(
        new URL('/auth/error?error=incomplete_user_info', request.url)
      );
    }

    console.log('✅ User information retrieved:', {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      hasRefreshToken: !!tokens.refresh_token
    });

    // Create or update user in database
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, userInfo.email!))
      .limit(1);

    let userId: string;

    if (user.length === 0) {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          email: userInfo.email!,
          name: userInfo.name || userInfo.email!,
          image: userInfo.picture || null,
          emailVerified: new Date() // Google emails are pre-verified
        })
        .returning();

      userId = newUser[0].id;
      console.log('👤 Created new user:', userId);
    } else {
      userId = user[0].id;
      
      // Update existing user info
      await db
        .update(users)
        .set({
          name: userInfo.name || user[0].name,
          image: userInfo.picture || user[0].image,
          emailVerified: new Date()
        })
        .where(eq(users.id, userId));

      console.log('👤 Updated existing user:', userId);
    }

    // Create or update account record
    const existingAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);

    const accountData = {
      userId,
      type: 'oauth' as const,
      provider: 'google' as const,
      providerAccountId: userInfo.id!,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      id_token: tokens.id_token || null
    };

    if (existingAccount.length === 0) {
      // Create new account
      await db.insert(accounts).values(accountData);
      console.log('🔗 Created new account link for user:', userId);
    } else {
      // Update existing account
      await db
        .update(accounts)
        .set(accountData)
        .where(eq(accounts.userId, userId));
      console.log('🔗 Updated existing account for user:', userId);
    }

    // Schedule automatic token refresh if we have expiration time
    if (tokens.expiry_date) {
      const scheduler = TokenRefreshScheduler.getInstance();
      scheduler.scheduleRefresh(userId, Math.floor(tokens.expiry_date / 1000));
    }

    // Determine redirect URL
    const returnUrl = stateData.returnUrl || '/dashboard';
    const redirectUrl = new URL(returnUrl, request.url);
    
    // Add success parameter to indicate successful authentication
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set('provider', 'google');

    console.log('✅ Google OAuth callback completed successfully, redirecting to:', redirectUrl.pathname);

    // Create response with security headers
    const response = NextResponse.redirect(redirectUrl);
    return addSecurityHeaders(response);

  } catch (error) {
    console.error('❌ Google OAuth callback error:', error);
    
    // Determine error type and create appropriate redirect
    let errorCode = 'callback_error';
    if (error instanceof Error) {
      if (error.message.includes('invalid_grant')) {
        errorCode = 'invalid_authorization_code';
      } else if (error.message.includes('network')) {
        errorCode = 'network_error';
      }
    }

    return NextResponse.redirect(
      new URL(`/auth/error?error=${errorCode}`, request.url)
    );
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return addSecurityHeaders(response);
}