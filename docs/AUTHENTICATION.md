# Google OAuth 2.0 Authentication System

## Overview

This document describes the comprehensive Google OAuth 2.0 authentication system implemented for the Calendar Sync application. The system provides secure authentication with automatic token refresh, session management, and calendar access permissions.

## Features

- **Google OAuth 2.0 Integration**: Complete OAuth flow with proper scopes for calendar access
- **Automatic Token Refresh**: Middleware that automatically refreshes tokens before expiration
- **Secure Session Management**: HTTP-only cookies with proper security settings
- **Enhanced Error Handling**: Comprehensive error responses with specific actions
- **Token Revocation**: Secure logout with optional token revocation
- **Comprehensive Testing**: Full test suite for all endpoints

## API Endpoints

### 1. Google Login Initiation (`/api/auth/google/login`)

Initiates the Google OAuth 2.0 authorization flow.

#### GET Request
```http
GET /api/auth/google/login?returnUrl=/dashboard
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Redirect to Google for authentication"
}
```

#### POST Request
```http
POST /api/auth/google/login
Content-Type: application/json

{
  "returnUrl": "/dashboard"
}
```

**Features:**
- Generates secure authorization URL with proper scopes
- Includes `calendar.readonly` scope for calendar access
- Uses `offline` access type to ensure refresh tokens
- Forces consent to guarantee refresh token provision
- Supports custom return URLs via state parameter

### 2. Google OAuth Callback (`/api/auth/google/callback`)

Handles the OAuth callback from Google's authorization server.

#### GET Request (OAuth Redirect)
```http
GET /api/auth/google/callback?code=AUTH_CODE&state=STATE_DATA
```

**Success:** Redirects to return URL with success cookie
**Error:** Redirects to error page with error details

**Features:**
- Exchanges authorization code for access and refresh tokens
- Creates or updates user account in database
- Stores tokens securely with proper expiration
- Handles orphaned user cleanup
- Sets success notification cookie

### 3. Token Refresh (`/api/auth/refresh`)

Manages token refresh and status checking.

#### POST Request (Refresh Token)
```http
POST /api/auth/refresh
```

**Response (Success):**
```json
{
  "message": "Token refreshed successfully",
  "expiresAt": 1693507200,
  "expiresIn": 3600,
  "refreshedAt": 1693503600
}
```

**Response (Re-auth Required):**
```json
{
  "error": "Refresh token expired. Please re-authenticate.",
  "action": "REAUTH_REQUIRED"
}
```

#### GET Request (Check Status)
```http
GET /api/auth/refresh
```

**Response:**
```json
{
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "expiresAt": 1693507200,
  "expiresIn": 3600,
  "isExpired": false,
  "isExpiringSoon": false,
  "needsRefresh": false,
  "scope": "openid email profile https://www.googleapis.com/auth/calendar.readonly",
  "tokenType": "Bearer"
}
```

### 4. Secure Logout (`/api/auth/logout`)

Provides comprehensive logout functionality.

#### POST Request (Basic Logout)
```http
POST /api/auth/logout
Content-Type: application/json

{
  "revokeTokens": false,
  "redirectUrl": "/"
}
```

#### POST Request (Logout with Token Revocation)
```http
POST /api/auth/logout
Content-Type: application/json

{
  "revokeTokens": true,
  "redirectUrl": "/"
}
```

**Response:**
```json
{
  "message": "Logout successful",
  "redirectUrl": "/",
  "tokensRevoked": true
}
```

#### GET Request (Auth Status)
```http
GET /api/auth/logout
```

**Response:**
```json
{
  "isAuthenticated": true,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

#### DELETE Request (Force Logout)
```http
DELETE /api/auth/logout
```

**Features:**
- Complete session cleanup
- Optional Google token revocation
- Secure cookie clearing
- Database cleanup (sessions and optionally accounts)

## Authentication Middleware

### Token Refresh Middleware

The `auth-middleware.ts` provides utilities for automatic token management:

```typescript
import { withTokenRefresh } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  return withTokenRefresh(request, async (request, refreshedToken) => {
    // Your API logic here - token is automatically refreshed if needed
    return NextResponse.json({ message: 'Success' });
  });
}
```

### Key Functions

#### `checkAndRefreshToken(userId: string)`
Checks token expiration and refreshes if needed.

#### `getAuthenticatedGoogleClient(userId: string)`
Returns an authenticated Google OAuth2 client with automatic token refresh.

#### `SessionCookieManager`
Utilities for secure cookie management:
- `setSessionCookie()` - Set secure session cookie
- `getSessionCookie()` - Retrieve session data
- `clearSessionCookie()` - Clear session cookie
- `setRefreshTokenCookie()` - Set refresh token cookie (if needed)

## Enhanced Google Calendar Integration

The `google-calendar-enhanced.ts` library provides improved Google Calendar integration:

```typescript
import { 
  getEnhancedGoogleCalendarClient,
  getEnhancedUserCalendars,
  checkGoogleAuthStatus 
} from '@/lib/google-calendar-enhanced';

// Automatically handles token refresh
const calendars = await getEnhancedUserCalendars();

// Check authentication status
const authStatus = await checkGoogleAuthStatus();
```

### Key Features

- **Automatic Token Refresh**: All functions automatically refresh tokens when needed
- **Enhanced Error Handling**: Specific error types with actionable responses
- **Improved Timezone Support**: Better timezone conversion utilities
- **Status Checking**: Built-in authentication status checking

## Security Features

### Cookie Security

All authentication cookies use secure settings:

```typescript
const cookieOptions = {
  httpOnly: true,                    // Prevent XSS attacks
  secure: NODE_ENV === 'production', // HTTPS in production
  sameSite: 'lax',                  // CSRF protection
  path: '/',                         // Cookie scope
  maxAge: 3600                      // Expiration time
};
```

### Token Management

- **Access Tokens**: Short-lived (1 hour), automatically refreshed
- **Refresh Tokens**: Long-lived, stored securely in database
- **Token Rotation**: New refresh tokens replace old ones when possible
- **Secure Storage**: All tokens encrypted at rest in database

### OAuth Security

- **State Parameter**: Prevents CSRF attacks during OAuth flow
- **PKCE**: Proof Key for Code Exchange (planned for future implementation)
- **Scope Validation**: Only requests necessary permissions
- **Consent Flow**: Forces consent to ensure refresh token provision

## Error Handling

### Error Types

1. **Authentication Errors**
   - `REAUTH_REQUIRED`: User needs to re-authenticate
   - `TOKEN_EXPIRED`: Access token expired (auto-handled)
   - `REFRESH_FAILED`: Refresh token invalid or expired

2. **API Errors**
   - `403`: Insufficient permissions
   - `404`: Resource not found
   - `429`: Rate limit exceeded
   - `500`: Server error

3. **Configuration Errors**
   - `OAUTH_NOT_CONFIGURED`: Missing client credentials
   - `INVALID_CREDENTIALS`: Invalid OAuth configuration

### Error Response Format

```json
{
  "error": "Error message",
  "action": "REAUTH_REQUIRED",
  "details": "Additional error details"
}
```

## Testing

### Running Tests

```bash
# Run all authentication tests
npm test -- __tests__/api/auth/

# Run with coverage
npm run test:coverage -- __tests__/api/auth/

# Run in watch mode
npm run test:watch -- __tests__/api/auth/
```

### Test Coverage

The test suite covers:

- ✅ OAuth flow initiation
- ✅ Callback handling
- ✅ Token refresh logic
- ✅ Logout functionality
- ✅ Error scenarios
- ✅ Security features
- ✅ Cookie management

## Environment Variables

Required environment variables:

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# NextAuth Configuration
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# Database
DATABASE_URL=your-database-url
```

## Database Schema

The authentication system uses these database tables:

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  email TEXT NOT NULL,
  emailVerified TIMESTAMP,
  image TEXT
);
```

### Accounts Table
```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sessionToken TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMP NOT NULL
);
```

## Usage Examples

### Client-Side Authentication

```typescript
// Initiate login
const response = await fetch('/api/auth/google/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ returnUrl: '/dashboard' })
});

const { authUrl } = await response.json();
window.location.href = authUrl;

// Check authentication status
const authStatus = await fetch('/api/auth/logout');
const { isAuthenticated, user } = await authStatus.json();

// Logout
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ revokeTokens: true })
});
```

### Server-Side Usage

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withTokenRefresh } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  return withTokenRefresh(request, async (request, refreshedToken) => {
    // Use refreshedToken for Google API calls
    const calendar = google.calendar({ 
      version: 'v3', 
      auth: getAuthenticatedClient(refreshedToken) 
    });
    
    const calendars = await calendar.calendarList.list();
    return NextResponse.json(calendars.data);
  });
}
```

## Best Practices

### 1. Token Management
- Always check token expiration before API calls
- Use the middleware for automatic token refresh
- Handle `REAUTH_REQUIRED` errors gracefully
- Store tokens securely in the database

### 2. Error Handling
- Provide specific error messages with actions
- Log authentication errors for monitoring
- Implement retry logic for transient errors
- Gracefully handle network failures

### 3. Security
- Use HTTPS in production
- Set secure cookie options
- Validate all OAuth parameters
- Implement proper session timeout

### 4. User Experience
- Provide clear authentication status
- Handle expired sessions gracefully
- Offer easy re-authentication flow
- Show loading states during OAuth flow

## Troubleshooting

### Common Issues

1. **No Refresh Token Received**
   - Ensure `access_type=offline` in OAuth URL
   - Use `prompt=consent` to force consent screen
   - Check Google OAuth consent screen configuration

2. **Token Refresh Fails**
   - Verify refresh token is stored correctly
   - Check Google OAuth credentials
   - Ensure user hasn't revoked access

3. **Calendar Access Denied**
   - Verify `calendar.readonly` scope is requested
   - Check user has granted calendar permissions
   - Ensure OAuth consent screen is configured

### Debug Endpoints

Use these endpoints for debugging:

- `/api/debug/tokens` - View token information
- `/api/auth/refresh` (GET) - Check token status
- `/api/auth/logout` (GET) - Check authentication status

## Future Enhancements

Planned improvements:

1. **PKCE Implementation**: Enhanced security for OAuth flow
2. **Token Encryption**: Encrypt tokens at rest
3. **Multi-Provider Support**: Support for other calendar providers
4. **Advanced Scoping**: Granular permission management
5. **Session Analytics**: Track authentication patterns
6. **Rate Limiting**: Implement API rate limiting

## Support

For issues or questions about the authentication system:

1. Check the test suite for usage examples
2. Review error logs for specific error messages
3. Verify environment variables are configured
4. Check Google OAuth configuration in Google Cloud Console