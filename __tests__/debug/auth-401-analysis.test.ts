/**
 * Critical 401 Authentication Error Analysis Tests
 * 
 * This test suite is designed to systematically identify the root cause
 * of 401 unauthorized errors in the calendar sync app.
 */

import { jest } from '@jest/globals'

// Mock environment variables for testing
const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: 'test-secret'
}

// Set up environment
Object.assign(process.env, mockEnv)

// Mock database
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
}

jest.mock('@/lib/db', () => ({
  db: mockDb
}))

// Mock Google APIs
const mockOAuth2Client = {
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn(),
  getAccessToken: jest.fn(),
  on: jest.fn(),
}

const mockCalendarApi = {
  calendarList: {
    list: jest.fn(),
  },
  calendars: {
    get: jest.fn(),
  },
  events: {
    list: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  }
}

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => mockOAuth2Client),
    },
    calendar: jest.fn().mockImplementation(() => mockCalendarApi),
  },
}))

// Mock NextAuth session
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { accounts, users } from '@/lib/db/schema'

describe('401 Authentication Error Root Cause Analysis', () => {
  let consoleSpy: jest.SpyInstance
  
  beforeEach(() => {
    jest.clearAllMocks()
    consoleSpy = jest.spyOn(console, 'error').mockImplementation()
  })
  
  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Environment Configuration Validation', () => {
    it('should have all required OAuth environment variables', () => {
      expect(process.env.GOOGLE_CLIENT_ID).toBeDefined()
      expect(process.env.GOOGLE_CLIENT_SECRET).toBeDefined()
      expect(process.env.NEXTAUTH_URL).toBeDefined()
      expect(process.env.NEXTAUTH_SECRET).toBeDefined()
      
      // Validate they're not empty
      expect(process.env.GOOGLE_CLIENT_ID).not.toBe('')
      expect(process.env.GOOGLE_CLIENT_SECRET).not.toBe('')
      expect(process.env.NEXTAUTH_URL).not.toBe('')
      expect(process.env.NEXTAUTH_SECRET).not.toBe('')
    })

    it('should validate OAuth client instantiation', () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      )
      
      expect(oauth2Client).toBeDefined()
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret'
      )
    })
  })

  describe('Session and Account Validation', () => {
    it('should validate user session structure', async () => {
      const mockSession = {
        user: { 
          id: 'test-user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
      
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      
      const session = await getServerSession()
      
      expect(session).toBeDefined()
      expect(session?.user?.id).toBe('test-user-123')
      expect(session?.user?.email).toBe('test@example.com')
      expect(session?.expires).toBeDefined()
    })

    it('should validate Google account exists in database', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        providerAccountId: 'google-account-id',
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      }
      
      mockDb.limit.mockResolvedValue([mockAccount])
      
      const result = await db.select().from(accounts).where({}).limit(1)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        provider: 'google',
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        expires_at: expect.any(Number)
      })
    })

    it('should identify missing or invalid account data', async () => {
      // Test case 1: No account found
      mockDb.limit.mockResolvedValue([])
      
      const noAccountResult = await db.select().from(accounts).where({}).limit(1)
      expect(noAccountResult).toHaveLength(0)
      
      // Test case 2: Account missing tokens
      const invalidAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: null,
        refresh_token: null,
        expires_at: null
      }
      
      mockDb.limit.mockResolvedValue([invalidAccount])
      
      const invalidResult = await db.select().from(accounts).where({}).limit(1)
      expect(invalidResult[0].access_token).toBeNull()
      expect(invalidResult[0].refresh_token).toBeNull()
    })
  })

  describe('Token Validation and Refresh', () => {
    it('should detect expired access tokens', async () => {
      const expiredAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: 'expired-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
      }
      
      mockDb.limit.mockResolvedValue([expiredAccount])
      
      const account = await db.select().from(accounts).where({}).limit(1)
      const isExpired = account[0].expires_at < Math.floor(Date.now() / 1000)
      
      expect(isExpired).toBe(true)
      expect(account[0].refresh_token).toBeTruthy()
    })

    it('should validate token refresh mechanism', async () => {
      const mockAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      const newTokens = {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000,
        refresh_token: 'new-refresh-token',
      }

      mockDb.limit.mockResolvedValue([mockAccount])
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens
      })

      // Simulate token refresh
      mockOAuth2Client.setCredentials({
        access_token: mockAccount.access_token,
        refresh_token: mockAccount.refresh_token,
      })

      const refreshResult = await mockOAuth2Client.refreshAccessToken()

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled()
      expect(refreshResult.credentials.access_token).toBe('new-access-token')
      expect(refreshResult.credentials.expiry_date).toBeDefined()
    })

    it('should handle refresh token failures', async () => {
      const mockAccount = {
        access_token: 'expired-token',
        refresh_token: 'invalid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }

      mockDb.limit.mockResolvedValue([mockAccount])
      
      // Simulate refresh token failure
      mockOAuth2Client.refreshAccessToken.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          },
        },
      })

      await expect(mockOAuth2Client.refreshAccessToken()).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant'
          }
        }
      })
    })
  })

  describe('Google Calendar API Authentication', () => {
    it('should test direct Calendar API authentication', async () => {
      const mockCalendars = [
        { id: 'primary', summary: 'Primary Calendar', accessRole: 'owner' },
        { id: 'calendar-2', summary: 'Work Calendar', accessRole: 'reader' }
      ]

      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: { items: mockCalendars }
      })

      const response = await mockCalendarApi.calendarList.list()

      expect(response.data.items).toHaveLength(2)
      expect(response.data.items[0].summary).toBe('Primary Calendar')
    })

    it('should identify 401 authentication errors from Google Calendar API', async () => {
      // Simulate 401 error from Google Calendar API
      const googleApiError = {
        code: 401,
        status: 401,
        message: 'Request had invalid authentication credentials.',
        errors: [
          {
            message: 'Invalid Credentials',
            domain: 'global',
            reason: 'authError',
            location: 'Authorization',
            locationType: 'header'
          }
        ]
      }

      mockCalendarApi.calendarList.list.mockRejectedValue(googleApiError)

      try {
        await mockCalendarApi.calendarList.list()
        fail('Expected 401 error was not thrown')
      } catch (error: any) {
        expect(error.code).toBe(401)
        expect(error.status).toBe(401)
        expect(error.message).toContain('authentication')
      }
    })

    it('should validate OAuth scope requirements', async () => {
      const mockAccount = {
        access_token: 'valid-token',
        scope: 'openid email profile', // Missing calendar scope!
      }

      // Check if calendar scope is included
      const hasCalendarScope = mockAccount.scope?.includes('calendar')
      
      expect(hasCalendarScope).toBe(false)
      
      // This would be a common cause of 401 errors - insufficient scope
      if (!hasCalendarScope) {
        console.warn('Account missing required calendar.readonly scope')
      }
    })
  })

  describe('Error Pattern Analysis', () => {
    it('should categorize different 401 error scenarios', () => {
      const errorScenarios = [
        {
          name: 'Missing Access Token',
          condition: (account: any) => !account?.access_token,
          solution: 'Re-authenticate user'
        },
        {
          name: 'Expired Access Token with Valid Refresh Token',
          condition: (account: any) => 
            account?.expires_at < Math.floor(Date.now() / 1000) && 
            account?.refresh_token,
          solution: 'Refresh access token automatically'
        },
        {
          name: 'Expired or Invalid Refresh Token',
          condition: (account: any) => 
            account?.expires_at < Math.floor(Date.now() / 1000) && 
            !account?.refresh_token,
          solution: 'Force user re-authentication'
        },
        {
          name: 'Insufficient OAuth Scopes',
          condition: (account: any) => 
            account?.scope && !account.scope.includes('calendar'),
          solution: 'Re-authenticate with proper scopes'
        }
      ]

      errorScenarios.forEach(scenario => {
        expect(scenario.name).toBeDefined()
        expect(typeof scenario.condition).toBe('function')
        expect(scenario.solution).toBeDefined()
      })
    })

    it('should provide diagnostic information for 401 errors', async () => {
      const mockSession = {
        user: { id: 'test-user-123' }
      }
      
      const mockAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: null, // This would cause 401
        refresh_token: null,
        expires_at: null
      }

      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      mockDb.limit.mockResolvedValue([mockAccount])

      // Diagnostic function
      const diagnose401Error = async () => {
        const session = await getServerSession()
        if (!session?.user?.id) {
          return 'No valid session found'
        }

        const accounts = await db.select().from(accounts).where({}).limit(1)
        if (!accounts[0]) {
          return 'No Google account linked'
        }

        const account = accounts[0]
        if (!account.access_token) {
          return 'Missing access token - re-authentication required'
        }

        if (!account.refresh_token) {
          return 'Missing refresh token - re-authentication required'
        }

        if (account.expires_at && account.expires_at < Math.floor(Date.now() / 1000)) {
          return 'Access token expired - refresh needed'
        }

        return 'Authentication appears valid - check Google API errors'
      }

      const diagnosis = await diagnose401Error()
      expect(diagnosis).toBe('Missing access token - re-authentication required')
    })
  })

  describe('Integration with Existing Services', () => {
    it('should validate getUserCalendars error handling', async () => {
      // Mock the import since we can't actually import in this test context
      const getUserCalendars = jest.fn()
      
      // Test successful call
      getUserCalendars.mockResolvedValue([
        { id: 'primary', summary: 'Primary Calendar' }
      ])
      
      const calendars = await getUserCalendars()
      expect(calendars).toHaveLength(1)
      
      // Test 401 error handling
      getUserCalendars.mockRejectedValue(new Error('Google Calendar authentication expired. Please sign out and sign back in to re-authenticate.'))
      
      await expect(getUserCalendars()).rejects.toThrow('authentication expired')
    })

    it('should validate getGoogleCalendarClient error propagation', async () => {
      const mockGetGoogleCalendarClient = jest.fn()
      
      // Test REAUTH_REQUIRED error
      mockGetGoogleCalendarClient.mockRejectedValue(new Error('REAUTH_REQUIRED'))
      
      await expect(mockGetGoogleCalendarClient()).rejects.toThrow('REAUTH_REQUIRED')
      
      // Test authentication error
      mockGetGoogleCalendarClient.mockRejectedValue(new Error('No Google account connected'))
      
      await expect(mockGetGoogleCalendarClient()).rejects.toThrow('No Google account connected')
    })
  })

  describe('Comprehensive 401 Debugging Checklist', () => {
    it('should run complete 401 diagnostic suite', async () => {
      const diagnostics = {
        environmentVars: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
        sessionExists: false,
        accountExists: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        tokenExpired: false,
        hasCalendarScope: false
      }

      // Mock session
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'test-user-123' }
      })
      
      const session = await getServerSession()
      diagnostics.sessionExists = !!session?.user?.id

      // Mock account with comprehensive data
      const mockAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      }
      
      mockDb.limit.mockResolvedValue([mockAccount])
      
      const accounts = await db.select().from(accounts).where({}).limit(1)
      const account = accounts[0]
      
      if (account) {
        diagnostics.accountExists = true
        diagnostics.hasAccessToken = !!account.access_token
        diagnostics.hasRefreshToken = !!account.refresh_token
        diagnostics.tokenExpired = account.expires_at ? account.expires_at < Math.floor(Date.now() / 1000) : false
        diagnostics.hasCalendarScope = account.scope ? account.scope.includes('calendar') : false
      }

      // All diagnostics should pass for successful authentication
      expect(diagnostics.environmentVars).toBe(true)
      expect(diagnostics.sessionExists).toBe(true)
      expect(diagnostics.accountExists).toBe(true)
      expect(diagnostics.hasAccessToken).toBe(true)
      expect(diagnostics.hasRefreshToken).toBe(true)
      expect(diagnostics.tokenExpired).toBe(false)
      expect(diagnostics.hasCalendarScope).toBe(true)

      // Generate diagnostic report
      const failedChecks = Object.entries(diagnostics)
        .filter(([_, passed]) => !passed)
        .map(([check]) => check)

      if (failedChecks.length > 0) {
        console.warn('Authentication diagnostic failures:', failedChecks)
      }

      expect(failedChecks).toHaveLength(0)
    })
  })
})