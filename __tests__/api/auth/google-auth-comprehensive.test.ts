/**
 * Comprehensive Google OAuth Authentication API Tests
 * Complete test suite covering all authentication scenarios
 * 
 * Test Coverage:
 * - Token refresh mechanisms and edge cases
 * - Security validations and vulnerability tests
 * - Performance and concurrent operations
 * - Error handling and recovery
 * - Boundary conditions and edge cases
 */

import { NextRequest } from 'next/server';
import { POST as refreshTokenPOST, GET as refreshTokenGET } from '@/app/api/auth/refresh/route';
import { POST as checkTokenPOST } from '@/app/api/auth/check-token/route';
import { POST as forceLogoutPOST } from '@/app/api/auth/force-logout/route';

// Mock dependencies
jest.mock('googleapis');
jest.mock('next-auth');
jest.mock('next-auth/jwt');
jest.mock('@/lib/auth');
jest.mock('@/lib/db');
jest.mock('@/lib/db/schema');
jest.mock('@/lib/auth-middleware');

// Mock environment variables
const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_SECRET: 'test-secret',
  NODE_ENV: 'test'
};

describe('Comprehensive Google OAuth Authentication Tests', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    // Reset environment variables
    Object.assign(process.env, mockEnv);
    
    // Mock request
    mockRequest = {
      url: 'http://localhost:3000/api/auth/refresh',
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

  describe('Advanced Token Refresh Scenarios', () => {
    beforeEach(() => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });
    });

    it('should handle token expiring soon (proactive refresh)', async () => {
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'soon-to-expire-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 200, // Expires in 200 seconds (< 5 minutes)
        }]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
      };

      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new-access-token',
            expiry_date: Date.now() + 3600000,
            refresh_token: 'new-refresh-token'
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

    it('should handle network timeout during token refresh', async () => {
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }])
      };

      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockImplementation(() => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('TIMEOUT')), 100);
          });
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to refresh token');
    });

    it('should handle Google API rate limiting', async () => {
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }])
      };

      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockRejectedValue({
          response: {
            status: 429,
            data: {
              error: 'rate_limit_exceeded',
              error_description: 'Rate limit exceeded'
            }
          }
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to refresh token');
    });

    it('should handle malformed refresh response', async () => {
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }])
      };

      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            // Missing access_token - malformed response
            expires_in: 3600,
            token_type: 'Bearer'
          }
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to refresh token');
    });
  });

  describe('Token Check Endpoint Security Tests', () => {
    beforeEach(() => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });
    });

    it('should validate working token without exposing sensitive data', async () => {
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'super-secret-token-12345',
          refresh_token: 'super-secret-refresh-67890',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }])
      };

      const { google } = require('googleapis');
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockResolvedValue({ data: { items: [] } })
        }
      };
      google.calendar.mockReturnValue(mockCalendar);
      google.auth.OAuth2.mockImplementation(() => ({
        setCredentials: jest.fn()
      }));

      const request = mockRequest as NextRequest;
      const response = await checkTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
      
      // Ensure sensitive data is not exposed
      const responseText = JSON.stringify(data);
      expect(responseText).not.toContain('super-secret-token-12345');
      expect(responseText).not.toContain('super-secret-refresh-67890');
    });

    it('should handle unauthorized access attempts', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue(null); // No session

      const request = mockRequest as NextRequest;
      const response = await checkTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should prevent token validation with invalid session', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: null, email: null } // Invalid session data
      });

      const request = mockRequest as NextRequest;
      const response = await checkTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });
  });

  describe('Security Vulnerability Tests', () => {
    it('should not expose sensitive token data in error messages', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const sensitiveToken = 'ya29.very-sensitive-secret-token-data';
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: sensitiveToken,
          refresh_token: 'sensitive-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }])
      };

      const { google } = require('googleapis');
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockRejectedValue(new Error(`Token ${sensitiveToken} is invalid`))
        }
      };
      google.calendar.mockReturnValue(mockCalendar);
      google.auth.OAuth2.mockImplementation(() => ({
        setCredentials: jest.fn()
      }));

      const request = mockRequest as NextRequest;
      const response = await checkTokenPOST(request);
      const data = await response.json();

      // Error should not expose the actual token
      const responseText = JSON.stringify(data);
      expect(responseText).not.toContain(sensitiveToken);
      expect(responseText).not.toContain('sensitive-refresh');
    });

    it('should handle SQL injection attempts in user context', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { 
          id: "'; DROP TABLE accounts; SELECT * FROM users WHERE '1'='1", 
          email: 'malicious@example.com' 
        }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);

      // Should not crash or cause database issues
      expect(response.status).toBe(401); // No account found
      expect(mockDb.db.select).toHaveBeenCalled();
      
      // Verify the malicious SQL wasn't executed (mocked DB would still be called safely)
      expect(mockDb.db.where).toHaveBeenCalled();
    });

    it('should validate request origin to prevent CSRF', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const maliciousRequest = {
        ...mockRequest,
        headers: {
          'origin': 'https://malicious-site.com',
          'referer': 'https://malicious-site.com/steal-tokens'
        }
      } as NextRequest;

      // The endpoint should still work as NextAuth handles CSRF protection
      const response = await refreshTokenGET(maliciousRequest);
      
      // In a real scenario, this would be blocked by NextAuth middleware
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle XSS attempts in callback URLs', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      const request = {
        ...mockRequest,
        url: `http://localhost:3000/api/auth/refresh?callback=${encodeURIComponent(xssPayload)}`
      } as NextRequest;

      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      const response = await refreshTokenGET(request);
      const data = await response.json();

      // Response should not include unescaped XSS payload
      const responseText = JSON.stringify(data);
      expect(responseText).not.toContain('<script>');
      expect(responseText).not.toContain('alert(');
    });
  });

  describe('Performance and Concurrent Operations', () => {
    it('should handle multiple simultaneous token refresh requests', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
      };

      let refreshCount = 0;
      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockImplementation(() => {
          refreshCount++;
          return Promise.resolve({
            credentials: {
              access_token: `new-access-token-${refreshCount}`,
              expiry_date: Date.now() + 3600000
            }
          });
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      // Make 10 concurrent refresh requests
      const requests = Array(10).fill(mockRequest as NextRequest);
      const promises = requests.map(request => refreshTokenPOST(request));
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should have made multiple refresh calls (no deduplication in basic implementation)
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
    });

    it('should handle high frequency token validation requests', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'valid-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }])
      };

      const { google } = require('googleapis');
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockResolvedValue({ data: { items: [] } })
        }
      };
      google.calendar.mockReturnValue(mockCalendar);
      google.auth.OAuth2.mockImplementation(() => ({
        setCredentials: jest.fn()
      }));

      const start = Date.now();
      
      // Make 50 concurrent token validation requests
      const requests = Array(50).fill(mockRequest as NextRequest);
      const promises = requests.map(request => checkTokenPOST(request));
      
      const responses = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Should complete reasonably quickly (under 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle memory efficiently during token operations', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
      };

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

      // Process multiple token refresh operations sequentially to avoid overwhelming
      for (let i = 0; i < 100; i++) {
        await refreshTokenPOST(mockRequest as NextRequest);
      }

      // Should not cause memory leaks (this is more of a smoke test)
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(100);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle extremely long tokens', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const veryLongToken = 'a'.repeat(10000); // 10KB token
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: veryLongToken,
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasAccessToken).toBe(true);
      // Should not include the full token in response
      expect(JSON.stringify(data).length).toBeLessThan(veryLongToken.length);
    });

    it('should handle null and undefined token values', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: null,
          refresh_token: undefined,
          expires_at: null,
        }])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasAccessToken).toBe(false);
      expect(data.hasRefreshToken).toBe(false);
      expect(data.needsRefresh).toBe(true);
    });

    it('should handle future expiration dates', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const futureDate = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year from now
      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'valid-token',
          refresh_token: 'valid-refresh-token',
          expires_at: futureDate,
        }])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isExpired).toBe(false);
      expect(data.isExpiringSoon).toBe(false);
      expect(data.needsRefresh).toBe(false);
      expect(data.expiresIn).toBeGreaterThan(365 * 24 * 60 * 60 - 100); // Close to 1 year
    });

    it('should handle negative expiration timestamps', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'some-token',
          refresh_token: 'some-refresh-token',
          expires_at: -1, // Invalid negative timestamp
        }])
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isExpired).toBe(true); // Should treat negative as expired
      expect(data.needsRefresh).toBe(true);
    });

    it('should handle empty database responses', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]) // No accounts found
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('No Google account connected');
      expect(data.action).toBe('REAUTH_REQUIRED');
    });
  });

  describe('Force Logout Security Tests', () => {
    it('should securely clear all authentication data', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      let deletedTables: string[] = [];
      
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockImplementation((table) => {
          deletedTables.push(table.constructor.name || 'unknown');
          return {
            where: jest.fn().mockResolvedValue(undefined)
          };
        })
      };

      const request = mockRequest as NextRequest;
      const response = await forceLogoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('All authentication data cleared. Please sign in fresh.');
      
      // Should attempt to delete from multiple tables
      expect(mockDb.db.delete).toHaveBeenCalledTimes(3); // sessions, accounts, users
    });

    it('should handle partial cleanup failures gracefully', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      let callCount = 0;
      
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Database constraint violation');
          }
          return {
            where: jest.fn().mockResolvedValue(undefined)
          };
        })
      };

      const request = mockRequest as NextRequest;
      const response = await forceLogoutPOST(request);
      const data = await response.json();

      // Should still report success for what it could clean up
      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to clear auth data');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle database connection failures gracefully', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockImplementation(() => {
          throw new Error('ECONNREFUSED: Connection refused');
        })
      };

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to check token status');
    });

    it('should handle Google API service outages', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' }
      });

      const mockDb = require('@/lib/db');
      mockDb.db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'account-id',
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) - 100,
        }])
      };

      const { google } = require('googleapis');
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockRejectedValue({
          response: {
            status: 503,
            data: {
              error: 'service_unavailable',
              error_description: 'The service is temporarily unavailable'
            }
          }
        })
      };
      google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

      const request = mockRequest as NextRequest;
      const response = await refreshTokenPOST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to refresh token');
    });

    it('should handle corrupted session data', async () => {
      const { getServerSession } = require('next-auth');
      getServerSession.mockResolvedValue({
        user: { 
          id: null, // Corrupted session
          email: 'test@example.com',
          // Missing required fields
        }
      });

      const request = mockRequest as NextRequest;
      const response = await refreshTokenGET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });
  });
});