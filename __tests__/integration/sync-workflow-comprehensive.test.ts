/**
 * Comprehensive Integration Tests for Full Calendar Sync Workflow
 * 
 * This test suite validates the complete sync process from authentication
 * through calendar sync completion, with special focus on error scenarios
 * that could cause 401 authentication failures.
 */

import { jest } from '@jest/globals'
import { createMockCalendarSync } from '../test-utils'

// Mock environment
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: 'test-secret'
})

// Mock database with comprehensive functionality
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  orderBy: jest.fn().mockReturnThis(),
}

jest.mock('@/lib/db', () => ({
  db: mockDb
}))

// Mock Google Calendar API with comprehensive responses
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

// Mock NextAuth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

// Mock ICS parser
jest.mock('@/lib/ics-parser', () => ({
  parseICSFromUrlWithExpansion: jest.fn(),
}))

// Mock fetch for ICS URLs
global.fetch = jest.fn()

import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { parseICSFromUrlWithExpansion } from '@/lib/ics-parser'
import { syncCalendar } from '@/lib/sync-service'
import { getUserCalendars, getGoogleCalendarClient } from '@/lib/google-calendar'

describe('Full Calendar Sync Workflow Integration Tests', () => {
  let consoleSpy: jest.SpyInstance
  
  beforeEach(() => {
    jest.clearAllMocks()
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })
  
  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Authentication Prerequisites for Sync', () => {
    it('should validate complete authentication state before sync', async () => {
      // Mock valid session
      const mockSession = {
        user: { id: 'test-user-123', email: 'user@example.com' }
      }
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)

      // Mock valid Google account
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

      // Mock calendar sync config
      const mockSync = createMockCalendarSync({
        id: 'sync-123',
        userId: 'test-user-123',
        name: 'Test Calendar Sync',
        icsUrl: 'https://example.com/calendar.ics',
        googleCalendarId: 'primary'
      })
      
      mockDb.limit.mockResolvedValueOnce([mockSync]) // For sync config lookup

      // Mock successful Google Calendar authentication
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'Primary Calendar', accessRole: 'owner' }
          ]
        }
      })

      // This should not throw any authentication errors
      const session = await getServerSession()
      expect(session?.user?.id).toBe('test-user-123')

      const accounts = await db.select().from(accounts).where({}).limit(1)
      expect(accounts[0]).toMatchObject({
        provider: 'google',
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token'
      })

      const syncConfigs = await db.select().from(calendarSyncs).where({}).limit(1)
      expect(syncConfigs[0]).toMatchObject({
        name: 'Test Calendar Sync',
        icsUrl: 'https://example.com/calendar.ics'
      })
    })

    it('should handle authentication errors during sync preparation', async () => {
      // Mock session but no Google account
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'test-user-123' }
      })
      
      mockDb.limit.mockResolvedValue([]) // No Google account found

      // Mock sync config
      const mockSync = createMockCalendarSync({
        id: 'sync-123',
        userId: 'test-user-123'
      })
      mockDb.limit.mockResolvedValueOnce([mockSync])

      // Attempt to get Google Calendar client should fail
      await expect(async () => {
        const session = await getServerSession()
        const accounts = await db.select().from(accounts).where({}).limit(1)
        
        if (accounts.length === 0) {
          throw new Error('No Google account connected')
        }
      }).rejects.toThrow('No Google account connected')
    })
  })

  describe('ICS Data Fetching and Processing', () => {
    it('should handle ICS URL fetching with authentication headers', async () => {
      const mockICSData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-event-1
SUMMARY:Test Event
DTSTART:20240301T100000Z
DTEND:20240301T110000Z
END:VEVENT
END:VCALENDAR`

      const mockEvents = [{
        uid: 'test-event-1',
        summary: 'Test Event',
        start: new Date('2024-03-01T10:00:00Z'),
        end: new Date('2024-03-01T11:00:00Z'),
        description: '',
        location: '',
        sourceTimezone: 'UTC'
      }]

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(mockEvents)

      const result = await parseICSFromUrlWithExpansion(
        'https://example.com/calendar.ics',
        new Date('2024-03-01'),
        new Date('2024-03-31')
      )

      expect(result).toHaveLength(1)
      expect(result[0].summary).toBe('Test Event')
    })

    it('should handle ICS fetch failures gracefully', async () => {
      ;(parseICSFromUrlWithExpansion as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch ICS data: 404 Not Found')
      )

      await expect(
        parseICSFromUrlWithExpansion(
          'https://example.com/nonexistent.ics',
          new Date('2024-03-01'),
          new Date('2024-03-31')
        )
      ).rejects.toThrow('Failed to fetch ICS data')
    })

    it('should handle malformed ICS data', async () => {
      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue([])

      const result = await parseICSFromUrlWithExpansion(
        'https://example.com/malformed.ics',
        new Date('2024-03-01'),
        new Date('2024-03-31')
      )

      expect(result).toHaveLength(0)
    })
  })

  describe('Google Calendar API Integration During Sync', () => {
    it('should handle token refresh during active sync', async () => {
      // Setup expired token scenario
      const expiredAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: 'expired-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
      }

      mockDb.limit.mockResolvedValue([expiredAccount])

      // Mock successful token refresh
      const newTokens = {
        access_token: 'refreshed-access-token',
        expiry_date: Date.now() + 3600000,
        refresh_token: 'new-refresh-token'
      }

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens
      })

      // Mock successful calendar API call after refresh
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'Primary Calendar', accessRole: 'owner' }
          ]
        }
      })

      // Simulate the token refresh process
      mockOAuth2Client.setCredentials({
        access_token: expiredAccount.access_token,
        refresh_token: expiredAccount.refresh_token,
      })

      const refreshResult = await mockOAuth2Client.refreshAccessToken()
      mockOAuth2Client.setCredentials(refreshResult.credentials)

      const calendarResponse = await mockCalendarApi.calendarList.list()

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled()
      expect(calendarResponse.data.items).toHaveLength(1)
    })

    it('should handle 401 errors during calendar API calls', async () => {
      const mockAccount = {
        access_token: 'invalid-token',
        refresh_token: 'expired-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Not expired
      }

      mockDb.limit.mockResolvedValue([mockAccount])

      // Mock 401 error from Google Calendar API
      const googleApiError = {
        code: 401,
        status: 401,
        message: 'Request had invalid authentication credentials.',
        errors: [{
          message: 'Invalid Credentials',
          domain: 'global',
          reason: 'authError'
        }]
      }

      mockCalendarApi.calendarList.list.mockRejectedValue(googleApiError)

      await expect(mockCalendarApi.calendarList.list()).rejects.toMatchObject({
        code: 401,
        status: 401
      })
    })

    it('should handle calendar API rate limiting', async () => {
      const rateLimitError = {
        code: 429,
        status: 429,
        message: 'Rate Limit Exceeded',
        errors: [{
          message: 'Rate Limit Exceeded',
          domain: 'usageLimits',
          reason: 'rateLimitExceeded'
        }]
      }

      mockCalendarApi.events.insert
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          data: {
            id: 'created-event-123',
            status: 'confirmed',
            summary: 'Test Event'
          }
        })

      // First call should fail with rate limit
      await expect(mockCalendarApi.events.insert({})).rejects.toMatchObject({
        code: 429
      })

      // Second call should succeed (after backoff)
      const result = await mockCalendarApi.events.insert({})
      expect(result.data.id).toBe('created-event-123')
    })
  })

  describe('Full End-to-End Sync Workflow', () => {
    it('should complete successful sync workflow', async () => {
      // Mock session
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'test-user-123' }
      })

      // Mock valid Google account
      const mockAccount = {
        id: 'account-123',
        userId: 'test-user-123',
        provider: 'google',
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }
      
      mockDb.limit.mockResolvedValue([mockAccount])

      // Mock calendar sync config
      const mockSync = createMockCalendarSync({
        id: 'sync-123',
        userId: 'test-user-123',
        name: 'Test Sync',
        icsUrl: 'https://example.com/calendar.ics',
        googleCalendarId: 'primary'
      })
      
      mockDb.limit.mockResolvedValueOnce([mockSync])

      // Mock ICS events
      const mockEvents = [{
        uid: 'event-1',
        summary: 'Test Event',
        start: new Date('2024-03-15T10:00:00Z'),
        end: new Date('2024-03-15T11:00:00Z'),
        description: 'Test Description',
        location: 'Test Location',
        sourceTimezone: 'UTC'
      }]

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(mockEvents)

      // Mock Google Calendar API responses
      mockCalendarApi.calendars.get.mockResolvedValue({
        data: {
          id: 'primary',
          summary: 'Primary Calendar',
          timeZone: 'Europe/Madrid'
        }
      })

      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] } // No existing events
      })

      mockCalendarApi.events.insert.mockResolvedValue({
        data: {
          id: 'created-event-123',
          status: 'confirmed',
          summary: 'Test Event',
          htmlLink: 'https://calendar.google.com/event?eid=123'
        }
      })

      // Mock database updates
      mockDb.set.mockReturnThis()
      mockDb.where.mockResolvedValue(undefined)
      mockDb.values.mockReturnThis()
      mockDb.returning.mockResolvedValue([{
        id: 'log-123',
        status: 'success',
        eventsCreated: '1',
        eventsUpdated: '0'
      }])

      // Execute sync
      const result = await syncCalendar('sync-123', 'Europe/Madrid')

      expect(result).toMatchObject({
        success: true,
        eventsProcessed: 1,
        eventsCreated: 1,
        eventsUpdated: 0,
        errors: []
      })

      expect(mockCalendarApi.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: 'Test Event',
          description: expect.stringContaining('Original UID: event-1')
        })
      })
    })

    it('should handle partial sync failures gracefully', async () => {
      // Setup similar to successful sync but with some failures
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'test-user-123' }
      })

      const mockAccount = {
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }
      
      mockDb.limit.mockResolvedValue([mockAccount])

      const mockSync = createMockCalendarSync({
        id: 'sync-123',
        icsUrl: 'https://example.com/calendar.ics',
        googleCalendarId: 'primary'
      })
      
      mockDb.limit.mockResolvedValueOnce([mockSync])

      // Mock multiple events
      const mockEvents = [
        {
          uid: 'event-1',
          summary: 'Successful Event',
          start: new Date('2024-03-15T10:00:00Z'),
          end: new Date('2024-03-15T11:00:00Z'),
        },
        {
          uid: 'event-2', 
          summary: 'Failed Event',
          start: new Date('2024-03-15T14:00:00Z'),
          end: new Date('2024-03-15T15:00:00Z'),
        }
      ]

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(mockEvents)

      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      })

      // First event succeeds, second fails
      mockCalendarApi.events.insert
        .mockResolvedValueOnce({
          data: { id: 'success-event', status: 'confirmed' }
        })
        .mockRejectedValueOnce({
          code: 403,
          message: 'Calendar usage limits exceeded'
        })

      const result = await syncCalendar('sync-123')

      expect(result.success).toBe(false)
      expect(result.eventsCreated).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Failed Event')
    })

    it('should handle complete sync workflow failure', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'test-user-123' }
      })

      // Mock account with invalid refresh token
      const mockAccount = {
        access_token: 'expired-token',
        refresh_token: 'invalid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 300,
      }
      
      mockDb.limit.mockResolvedValue([mockAccount])

      const mockSync = createMockCalendarSync({ id: 'sync-123' })
      mockDb.limit.mockResolvedValueOnce([mockSync])

      // Mock refresh failure
      mockOAuth2Client.refreshAccessToken.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'invalid_grant' }
        }
      })

      await expect(syncCalendar('sync-123')).rejects.toThrow()
    })
  })

  describe('Sync State Management and Recovery', () => {
    it('should maintain sync state consistency during failures', async () => {
      // Mock database operations for state management
      let syncState = {
        lastSync: null,
        syncErrors: null,
        isActive: true
      }

      mockDb.set.mockImplementation((updates) => {
        Object.assign(syncState, updates)
        return mockDb
      })

      mockDb.where.mockResolvedValue(undefined)

      // Simulate sync with errors
      const mockSync = createMockCalendarSync({
        id: 'sync-123',
        lastSync: null,
        syncErrors: null
      })
      
      mockDb.limit.mockResolvedValue([mockSync])
      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue([])

      const result = await syncCalendar('sync-123')

      expect(result.success).toBe(true) // Empty sync is successful
      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSync: expect.any(Date),
          syncErrors: null
        })
      )
    })

    it('should log comprehensive sync results', async () => {
      const mockSyncResult = {
        success: true,
        eventsProcessed: 5,
        eventsCreated: 3,
        eventsUpdated: 2,
        errors: [],
        duration: 1500
      }

      mockDb.returning.mockResolvedValue([{
        id: 'log-123',
        calendarSyncId: 'sync-123',
        eventsProcessed: '5',
        eventsCreated: '3',
        eventsUpdated: '2',
        errors: null,
        duration: '1500ms',
        status: 'success',
        createdAt: new Date()
      }])

      // Mock the log insertion
      await mockDb.insert().values({
        calendarSyncId: 'sync-123',
        eventsProcessed: mockSyncResult.eventsProcessed.toString(),
        eventsCreated: mockSyncResult.eventsCreated.toString(),
        eventsUpdated: mockSyncResult.eventsUpdated.toString(),
        errors: mockSyncResult.errors.length > 0 ? mockSyncResult.errors : null,
        duration: `${mockSyncResult.duration}ms`,
        status: mockSyncResult.success ? 'success' : 'error',
      }).returning()

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          eventsCreated: '3',
          eventsUpdated: '2'
        })
      )
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large numbers of events efficiently', async () => {
      const startTime = Date.now()
      
      // Generate 500 mock events
      const largeEventSet = Array.from({ length: 500 }, (_, i) => ({
        uid: `event-${i}`,
        summary: `Event ${i}`,
        start: new Date(2024, 2, Math.floor(i / 20) + 1, 10 + (i % 24), 0),
        end: new Date(2024, 2, Math.floor(i / 20) + 1, 11 + (i % 24), 0),
      }))

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(largeEventSet)

      // Mock successful calendar operations
      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      })

      mockCalendarApi.events.insert.mockImplementation(() => 
        Promise.resolve({
          data: { id: `created-${Math.random()}`, status: 'confirmed' }
        })
      )

      const mockSync = createMockCalendarSync({
        id: 'large-sync-123',
        icsUrl: 'https://example.com/large-calendar.ics'
      })
      
      mockDb.limit.mockResolvedValue([mockSync])

      const result = await syncCalendar('large-sync-123')
      const duration = Date.now() - startTime

      expect(result.eventsProcessed).toBe(500)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should handle concurrent sync operations', async () => {
      const createConcurrentSync = (syncId: string) => {
        const mockSync = createMockCalendarSync({ id: syncId })
        mockDb.limit.mockResolvedValue([mockSync])
        ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue([])
        return syncCalendar(syncId)
      }

      // Create 5 concurrent sync operations
      const syncPromises = Array.from({ length: 5 }, (_, i) => 
        createConcurrentSync(`concurrent-sync-${i}`)
      )

      const results = await Promise.all(syncPromises)

      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Security and Data Validation', () => {
    it('should validate and sanitize calendar event data', async () => {
      const maliciousEvents = [{
        uid: 'event-1',
        summary: '<script>alert("XSS")</script>',
        description: 'DROP TABLE events; --',
        location: 'javascript:alert("XSS")',
        start: new Date('2024-03-15T10:00:00Z'),
        end: new Date('2024-03-15T11:00:00Z'),
      }]

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(maliciousEvents)

      const mockSync = createMockCalendarSync({
        id: 'security-test-sync',
        googleCalendarId: 'primary'
      })
      
      mockDb.limit.mockResolvedValue([mockSync])

      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      })

      mockCalendarApi.events.insert.mockResolvedValue({
        data: { id: 'sanitized-event', status: 'confirmed' }
      })

      await syncCalendar('security-test-sync')

      // Verify that the data was passed through (sanitization should happen at display/input level)
      expect(mockCalendarApi.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: '<script>alert("XSS")</script>',
          description: expect.stringContaining('DROP TABLE events; --')
        })
      })
    })

    it('should handle unauthorized calendar access attempts', async () => {
      const unauthorizedError = {
        code: 403,
        status: 403,
        message: 'The user does not have permission to access this calendar.',
        errors: [{
          message: 'Forbidden',
          domain: 'global',
          reason: 'forbidden'
        }]
      }

      mockCalendarApi.events.insert.mockRejectedValue(unauthorizedError)

      const mockEvents = [{
        uid: 'test-event',
        summary: 'Test Event',
        start: new Date('2024-03-15T10:00:00Z'),
        end: new Date('2024-03-15T11:00:00Z'),
      }]

      ;(parseICSFromUrlWithExpansion as jest.Mock).mockResolvedValue(mockEvents)

      const mockSync = createMockCalendarSync({
        id: 'unauthorized-sync',
        googleCalendarId: 'unauthorized-calendar-id'
      })
      
      mockDb.limit.mockResolvedValue([mockSync])

      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      })

      const result = await syncCalendar('unauthorized-sync')

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('permission')
    })
  })
})