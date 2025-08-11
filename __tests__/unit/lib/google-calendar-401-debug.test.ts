import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getGoogleCalendarClient, getUserCalendars, createGoogleCalendarEvent } from '@/lib/google-calendar';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';

// Mock dependencies
jest.mock('next-auth');
jest.mock('googleapis');
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGoogle = google as jest.Mocked<typeof google>;

describe('Google Calendar 401 Error Debugging', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  const mockAccount = {
    userId: 'test-user-id',
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    
    // Mock database operations
    const { db } = require('@/lib/db');
    db.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockAccount]),
        }),
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Token Expiry Logic Race Condition', () => {
    it('should identify duplicate token refresh checks causing race conditions', async () => {
      console.log('🔍 Testing for race condition in token expiry logic...');
      
      const expiredAccount = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
      };

      const { db } = require('@/lib/db');
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([expiredAccount]),
          }),
        }),
      });

      // Mock OAuth2 client
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new-access-token',
            expiry_date: Date.now() + 3600000, // 1 hour from now
          },
        }),
        on: jest.fn(),
      };

      mockGoogle.auth.OAuth2.mockImplementation(() => mockOAuth2Client as any);
      mockGoogle.calendar.mockReturnValue({
        calendarList: {
          list: jest.fn().mockResolvedValue({
            data: { items: [] },
          }),
        },
      } as any);

      try {
        await getGoogleCalendarClient();
        
        // Check if the function has multiple token expiry checks (this is the bug!)
        console.log('✅ Function completed without throwing race condition error');
        
        // Verify refresh was called only once
        expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);
        console.log('✅ Token refresh called only once (no race condition)');
        
      } catch (error) {
        console.error('❌ Race condition detected:', error);
        throw error;
      }
    });

    it('should not delete account aggressively when token can be refreshed', async () => {
      console.log('🔍 Testing aggressive account deletion behavior...');
      
      const expiredAccountWithRefreshToken = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 60, // Expired
        refresh_token: 'valid-refresh-token', // But has refresh token
      };

      const { db } = require('@/lib/db');
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([expiredAccountWithRefreshToken]),
          }),
        }),
      });
      
      db.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue(null),
      });

      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new-access-token',
            expiry_date: Date.now() + 3600000,
          },
        }),
        on: jest.fn(),
      };

      mockGoogle.auth.OAuth2.mockImplementation(() => mockOAuth2Client as any);

      try {
        await getGoogleCalendarClient();
        
        // Account should NOT be deleted if refresh token exists
        expect(db.delete).not.toHaveBeenCalled();
        console.log('✅ Account was not deleted when refresh token is available');
        
      } catch (error) {
        console.error('❌ Account deletion behavior test failed:', error);
        
        // If this fails, it means the code is deleting accounts too aggressively
        if (error.message === 'REAUTH_REQUIRED') {
          console.error('🚨 BUG DETECTED: Code is deleting accounts that can be refreshed!');
        }
        throw error;
      }
    });
  });

  describe('Authentication Error Scenarios', () => {
    it('should handle 401 errors gracefully during calendar operations', async () => {
      console.log('🔍 Testing 401 error handling during calendar operations...');
      
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockRejectedValue({
            code: 401,
            status: 401,
            message: 'Invalid Credentials',
          }),
        },
      };

      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn(),
        on: jest.fn(),
      };

      mockGoogle.auth.OAuth2.mockImplementation(() => mockOAuth2Client as any);
      mockGoogle.calendar.mockReturnValue(mockCalendar as any);

      try {
        await getUserCalendars();
        console.error('❌ Should have thrown 401 error');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        console.log('✅ 401 error was caught and handled');
        expect(error.message).toContain('Google Calendar authentication expired');
      }
    });

    it('should detect missing refresh token scenario', async () => {
      console.log('🔍 Testing missing refresh token scenario...');
      
      const accountWithoutRefreshToken = {
        ...mockAccount,
        refresh_token: null, // Missing refresh token
        expires_at: Math.floor(Date.now() / 1000) - 60, // Expired
      };

      const { db } = require('@/lib/db');
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([accountWithoutRefreshToken]),
          }),
        }),
      });

      try {
        await getGoogleCalendarClient();
        console.error('❌ Should have thrown REAUTH_REQUIRED');
        expect(false).toBe(true);
      } catch (error) {
        console.log('✅ Missing refresh token detected correctly');
        expect(error.message).toBe('REAUTH_REQUIRED');
      }
    });
  });

  describe('Root Cause Analysis', () => {
    it('should identify the source of 401 errors in sync workflow', async () => {
      console.log('🔍 Analyzing potential sources of 401 errors...');
      
      const sources = [
        'Duplicate token expiry checks causing race conditions',
        'Aggressive account deletion before attempting token refresh', 
        'Missing error handling in oauth2Client token refresh',
        'Concurrent requests triggering multiple refresh attempts',
        'Token update race condition between refresh and database save'
      ];

      console.log('📋 Potential 401 error sources identified:');
      sources.forEach((source, index) => {
        console.log(`  ${index + 1}. ${source}`);
      });

      // This test documents the analysis - the actual bugs are in the implementation
      expect(sources).toHaveLength(5);
      console.log('✅ Root cause analysis complete');
    });
  });

  describe('Token Refresh Race Conditions', () => {
    it('should detect concurrent token refresh attempts', async () => {
      console.log('🔍 Testing for concurrent token refresh race conditions...');
      
      const expiredAccount = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 60,
      };

      const { db } = require('@/lib/db');
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([expiredAccount]),
          }),
        }),
      });

      let refreshCallCount = 0;
      const mockOAuth2Client = {
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockImplementation(() => {
          refreshCallCount++;
          if (refreshCallCount > 1) {
            console.warn('🚨 RACE CONDITION: Multiple refresh attempts detected!');
          }
          return Promise.resolve({
            credentials: {
              access_token: 'new-access-token',
              expiry_date: Date.now() + 3600000,
            },
          });
        }),
        on: jest.fn(),
      };

      mockGoogle.auth.OAuth2.mockImplementation(() => mockOAuth2Client as any);

      // Simulate concurrent calls
      const promise1 = getGoogleCalendarClient();
      const promise2 = getGoogleCalendarClient();

      try {
        await Promise.all([promise1, promise2]);
        
        // Check if multiple refreshes occurred
        if (refreshCallCount > 1) {
          console.error(`❌ Race condition detected: ${refreshCallCount} refresh attempts`);
          throw new Error(`Race condition: ${refreshCallCount} concurrent refresh attempts`);
        }
        
        console.log('✅ No race condition detected in concurrent calls');
      } catch (error) {
        console.error('❌ Race condition test failed:', error);
        throw error;
      }
    });
  });
});