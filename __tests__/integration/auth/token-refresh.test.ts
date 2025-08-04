/**
 * Token Refresh Integration Tests
 * Tests the Google OAuth token refresh mechanism
 */

import { createMockGoogleCalendarAPI } from '@/__tests__/test-utils'

// Mock Google Calendar API
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn(),
        getAccessToken: jest.fn(),
      })),
    },
  },
}))

// Mock database
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  },
}))

import { google } from 'googleapis'
import { db } from '@/lib/db'

describe('Token Refresh Integration Tests', () => {
  let mockOAuth2Client: any
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      getAccessToken: jest.fn(),
    }
    
    ;(google.auth.OAuth2 as jest.Mock).mockReturnValue(mockOAuth2Client)
    
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Automatic Token Refresh', () => {
    it('should refresh expired access token automatically', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
      }

      const newTokens = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }

      // Mock database queries
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      ;(db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      })

      // Mock successful token refresh
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      })

      // Simulate making a calendar API call that triggers token refresh
      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()
      
      // This should detect expired token and refresh it
      await service.getCalendars('user-123')

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled()
      expect(db.update).toHaveBeenCalledWith(expect.any(Object))
    })

    it('should handle refresh token expiration', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-access-token',
        refresh_token: 'expired-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      // Mock refresh token failure
      mockOAuth2Client.refreshAccessToken.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          },
        },
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await expect(service.getCalendars('user-123')).rejects.toThrow(
        /refresh.*token.*expired|invalid/i
      )
    })

    it('should proactively refresh tokens before expiration', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'soon-to-expire-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 300, // Expires in 5 minutes
      }

      const newTokens = {
        access_token: 'proactively-refreshed-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      // Should proactively refresh token that expires within 10 minutes
      await service.getCalendars('user-123')

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled()
    })
  })

  describe('Token Refresh Error Scenarios', () => {
    it('should handle network errors during token refresh', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      // Mock network error
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(
        new Error('Network request failed')
      )

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await expect(service.getCalendars('user-123')).rejects.toThrow('Network request failed')
    })

    it('should handle malformed refresh token response', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      // Mock malformed response
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          // Missing access_token
          expires_in: 3600,
        },
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await expect(service.getCalendars('user-123')).rejects.toThrow()
    })

    it('should handle database errors during token update', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      ;(db.update as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-token',
          expires_in: 3600,
        },
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      // Should still work even if database update fails
      const result = await service.getCalendars('user-123')
      expect(result).toBeDefined()
    })
  })

  describe('Concurrent Token Refresh', () => {
    it('should handle multiple simultaneous refresh attempts', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      // Mock successful refresh with delay to test concurrency
      mockOAuth2Client.refreshAccessToken.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => {
            resolve({
              credentials: {
                access_token: 'new-token',
                expires_in: 3600,
              },
            })
          }, 100)
        })
      )

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      // Make multiple concurrent requests that would trigger token refresh
      const promises = Array.from({ length: 5 }, () => 
        service.getCalendars('user-123')
      )

      const results = await Promise.all(promises)

      // Should only refresh once, not 5 times
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1)
      results.forEach(result => expect(result).toBeDefined())
    })
  })

  describe('Token Refresh Validation', () => {
    it('should validate token expiration timestamps', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'current-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await service.getCalendars('user-123')

      // Should NOT refresh since token is still valid
      expect(mockOAuth2Client.refreshAccessToken).not.toHaveBeenCalled()
    })

    it('should handle missing token expiration data', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'token-no-expiry',
        refresh_token: 'valid-refresh-token',
        expires_at: null, // No expiration data
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      // Should attempt to use token despite missing expiry
      await service.getCalendars('user-123')

      // May or may not refresh depending on implementation
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalled()
    })
  })

  describe('Token Security', () => {
    it('should not log sensitive token data', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'very-secret-access-token',
        refresh_token: 'very-secret-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-secret-token',
          expires_in: 3600,
        },
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await service.getCalendars('user-123')

      // Check that sensitive data was not logged
      const logCalls = consoleSpy.mock.calls.flat().join(' ')
      expect(logCalls).not.toContain('very-secret-access-token')
      expect(logCalls).not.toContain('very-secret-refresh-token')
      expect(logCalls).not.toContain('new-secret-token')
    })

    it('should handle token storage securely', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      const newTokens = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAccount]),
          }),
        }),
      })

      let updateCallArgs: any
      ;(db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockImplementation((data) => {
          updateCallArgs = data
          return {
            where: jest.fn().mockResolvedValue(undefined),
          }
        }),
      })

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      })

      const { GoogleCalendarService } = await import('@/lib/google-calendar')
      const service = new GoogleCalendarService()

      await service.getCalendars('user-123')

      // Verify tokens are stored with proper structure
      expect(updateCallArgs).toMatchObject({
        access_token: 'new-access-token',
        expires_at: expect.any(Number),
      })
    })
  })
})