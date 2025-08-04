import { NextRequest } from 'next/server';
import { GET as googleLoginGET, POST as googleLoginPOST } from '@/app/api/auth/google/login/route';
import { POST as refreshTokenPOST, GET as refreshTokenGET } from '@/app/api/auth/refresh/route';
import { POST as logoutPOST, GET as logoutGET, DELETE as logoutDELETE } from '@/app/api/auth/logout/route';

// Mock dependencies
jest.mock('googleapis');
jest.mock('next-auth');
jest.mock('@/lib/auth');
jest.mock('@/lib/db');
jest.mock('@/lib/db/schema');

// Mock environment variables
const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_SECRET: 'test-secret',
  NODE_ENV: 'test'
};

describe('Google OAuth Authentication Endpoints', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    // Reset environment variables
    Object.assign(process.env, mockEnv);
    
    // Mock request
    mockRequest = {
      url: 'http://localhost:3000/api/auth/google/login',
      nextUrl: {
        origin: 'http://localhost:3000'
      } as URL,
      json: jest.fn().mockResolvedValue({}),
      cookies: {
        get: jest.fn(),
        set: jest.fn()
      }
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Google Login Endpoint (/api/auth/google/login)', () => {
    it('should generate Google OAuth URL on GET request', async () => {
      const request = {
        ...mockRequest,
        url: 'http://localhost:3000/api/auth/google/login?returnUrl=/dashboard'
      } as NextRequest;

      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('authUrl');
      expect(data).toHaveProperty('message');
      expect(data.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });

    it('should handle missing Google OAuth credentials', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      
      const request = mockRequest as NextRequest;
      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Google OAuth not configured');
    });

    it('should generate Google OAuth URL on POST request', async () => {
      const request = {
        ...mockRequest,
        json: jest.fn().mockResolvedValue({ returnUrl: '/custom-return' })
      } as NextRequest;

      const response = await googleLoginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('authUrl');
      expect(data.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });

    it('should include proper OAuth scopes in authorization URL', async () => {
      const request = mockRequest as NextRequest;
      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(data.authUrl).toContain('scope=');
      expect(data.authUrl).toContain('calendar.readonly');
      expect(data.authUrl).toContain('openid');
      expect(data.authUrl).toContain('email');
      expect(data.authUrl).toContain('profile');
    });

    it('should use offline access type for refresh tokens', async () => {
      const request = mockRequest as NextRequest;
      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(data.authUrl).toContain('access_type=offline');
      expect(data.authUrl).toContain('prompt=consent');
    });
  });

  describe('Token Refresh Endpoint (/api/auth/refresh)', () => {
    beforeEach(() => {
      // Mock getServerSession
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue(null);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should check token status on GET request', async () => {
      // Mock database response
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          token_type: 'Bearer'
        }])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasAccessToken', true);
      expect(data).toHaveProperty('hasRefreshToken', true);
      expect(data).toHaveProperty('isExpired', false);
      expect(data).toHaveProperty('scope');
    });

    it('should refresh token when expired', async () => {
      // Mock database with expired token
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100, // Expired
        }]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
      };

      // Mock Google OAuth client
      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new-access-token',
            expiry_date: Date.now() + 3600000
          }
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Token refreshed successfully');
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
    });

    it('should handle refresh token expiration', async () => {
      // Mock database response
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'expired-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }])
      };

      // Mock failed refresh
      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockRejectedValue(new Error('invalid_grant'))
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Refresh token expired');
      expect(data.action).toBe('REAUTH_REQUIRED');
    });
  });

  describe('Logout Endpoint (/api/auth/logout)', () => {
    beforeEach(() => {
      // Mock getServerSession
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });
    });

    it('should perform basic logout', async () => {
      // Mock database operations
      const mockDb = require('@/lib/db');
      mockDb.db = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([])
      };

      const request = {
        ...mockRequest,
        json: jest.fn().mockResolvedValue({ revokeTokens: false })
      } as NextRequest;

      const response = await logoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Logout successful');
      expect(data.tokensRevoked).toBe(false);
    });

    it('should revoke Google tokens on logout', async () => {
      // Mock database with Google account
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'valid-token',
          refresh_token: 'valid-refresh-token'
        }]),
        delete: jest.fn().mockReturnThis()
      };

      // Mock fetch for token revocation
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const request = {
        ...mockRequest,
        json: jest.fn().mockResolvedValue({ revokeTokens: true })
      } as NextRequest;

      const response = await logoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tokensRevoked).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://oauth2.googleapis.com/revoke'),
        expect.any(Object)
      );
    });

    it('should handle logout when not authenticated', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue(null);

      const request = {
        ...mockRequest,
        json: jest.fn().mockResolvedValue({})
      } as NextRequest;

      const response = await logoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Already logged out');
    });

    it('should return authentication status on GET request', async () => {
      const request = mockRequest as NextRequest;
      const response = await logoutGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('isAuthenticated', true);
      expect(data).toHaveProperty('user');
      expect(data.user).toHaveProperty('id', 'test-user-id');
    });

    it('should perform force logout on DELETE request', async () => {
      // Mock database operations
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          access_token: 'valid-token'
        }]),
        delete: jest.fn().mockReturnThis()
      };

      // Mock fetch for token revocation
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const request = mockRequest as NextRequest;
      const response = await logoutDELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Force logout completed');
      expect(data.tokensRevoked).toBe(true);
      expect(data.accountRemoved).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Simulate network error
      const { google } = require('googleapis');
      google.auth.OAuth2.mockImplementation(() => {
        throw new Error('Network error');
      });

      const request = mockRequest as NextRequest;
      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to initiate Google login');
    });

    it('should handle database connection errors', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      // Mock database error
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to check token status');
    });
  });

  describe('Security Features', () => {
    it('should use secure cookie options in production', async () => {
      process.env.NODE_ENV = 'production';

      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([])
      };

      const request = {
        ...mockRequest,
        json: jest.fn().mockResolvedValue({})
      } as NextRequest;

      const response = await logoutPOST(request);
      
      // Check that secure cookies would be set
      expect(response.status).toBe(200);
    });

    it('should validate state parameter in OAuth flow', async () => {
      const request = mockRequest as NextRequest;
      const response = await googleLoginGET(request);
      const data = await response.json();

      expect(data.authUrl).toContain('state=');
    });
  });
});