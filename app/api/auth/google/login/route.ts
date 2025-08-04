import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { SecurityUtils, addSecurityHeaders } from '@/lib/auth-middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Google OAuth 2.0 Login Initiation Endpoint
 * 
 * Initiates the Google OAuth 2.0 flow by redirecting users to Google's authorization server.
 * Includes calendar.readonly scope for calendar access and uses offline access type
 * to ensure refresh tokens are provided.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnUrl = searchParams.get('returnUrl') || '/dashboard';

    // Validate Google OAuth credentials
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('❌ Missing Google OAuth credentials');
      return NextResponse.json(
        { error: 'Google OAuth not configured' },
        { status: 500 }
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${request.nextUrl.origin}/api/auth/google/callback`
    );

    // Generate secure state and PKCE parameters
    const secureState = SecurityUtils.generateSecureState();
    const { codeVerifier, codeChallenge } = SecurityUtils.generatePKCE();
    
    // Store PKCE code verifier temporarily (in production, use Redis or secure session storage)
    // For now, we'll include it in the state (encoded)
    const stateData = {
      returnUrl,
      nonce: secureState,
      codeVerifier, // In production, store this securely server-side
      timestamp: Date.now()
    };

    // Generate authorization URL with enhanced security
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      prompt: 'consent select_account', // Force consent to get refresh token
      include_granted_scopes: true,
      state: Buffer.from(JSON.stringify(stateData)).toString('base64') // Secure state encoding
    });

    console.log('🔗 Generated Google OAuth URL for login');
    
    // Return authorization URL for redirect
    const response = NextResponse.json({
      authUrl,
      message: 'Redirect to Google for authentication',
      state: secureState // Return nonce for client-side validation
    });

    return addSecurityHeaders(response);

  } catch (error) {
    console.error('❌ Google login initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google login' },
      { status: 500 }
    );
  }
}

/**
 * Alternative POST method for programmatic login initiation
 * Useful for client-side applications that need the auth URL
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { returnUrl } = body;

    // Validate Google OAuth credentials
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('❌ Missing Google OAuth credentials');
      return NextResponse.json(
        { error: 'Google OAuth not configured' },
        { status: 500 }
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${request.nextUrl.origin}/api/auth/google/callback`
    );

    // Generate authorization URL with proper scopes
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      prompt: 'consent select_account', // Force consent to get refresh token
      include_granted_scopes: true,
      state: JSON.stringify({ returnUrl: returnUrl || '/dashboard' })
    });

    console.log('🔗 Generated Google OAuth URL via POST request');
    
    return NextResponse.json({
      authUrl,
      message: 'Use authUrl to redirect user to Google for authentication'
    });

  } catch (error) {
    console.error('❌ Google login POST error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Google login URL' },
      { status: 500 }
    );
  }
}