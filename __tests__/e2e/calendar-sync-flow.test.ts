/**
 * End-to-end tests for calendar sync functionality
 * These tests simulate complete user workflows from authentication to sync
 */

import { createMockCalendarSync, createMockCalendarEvent, mockFetchResponse } from '../test-utils'

// Mock external dependencies for E2E tests
jest.mock('googleapis')
jest.mock('next-auth')
jest.mock('@/lib/db')

// Mock Puppeteer for browser automation (if needed)
let mockBrowser: any
let mockPage: any

describe('Calendar Sync E2E Flow', () => {
  beforeAll(async () => {
    // Setup browser automation if needed
    // For now, we'll mock the browser interactions
    mockBrowser = {
      newPage: jest.fn(),
      close: jest.fn(),
    }
    
    mockPage = {
      goto: jest.fn(),
      click: jest.fn(),
      fill: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
      screenshot: jest.fn(),
      close: jest.fn(),
    }
    
    mockBrowser.newPage.mockResolvedValue(mockPage)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mocks
    require('next-auth').getServerSession.mockResolvedValue({
      user: { id: 'test-user-123', email: 'test@example.com' }
    })
    
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      orderBy: jest.fn(),
    }
    require('@/lib/db').db = mockDb
  })

  describe('Complete Calendar Sync Workflow', () => {
    it('should complete full sync workflow: create sync → fetch ICS → sync to Google Calendar', async () => {
      // Step 1: User creates a new calendar sync
      const syncData = {
        name: 'Team Events',
        icsUrl: 'https://example.com/team-calendar.ics',
        googleCalendarId: 'primary'
      }
      
      const mockCreatedSync = createMockCalendarSync({
        ...syncData,
        id: 'sync-e2e-123'
      })
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([mockCreatedSync])
      
      // Step 2: Mock ICS data fetch and parsing
      const mockICSData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20240315T100000Z
DTEND:20240315T110000Z
UID:e2e-event-1@example.com
SUMMARY:Team Meeting
DESCRIPTION:Weekly team standup
LOCATION:Conference Room A
END:VEVENT
BEGIN:VEVENT
DTSTART:20240316T140000Z
DTEND:20240316T150000Z
UID:e2e-event-2@example.com
SUMMARY:Project Review
DESCRIPTION:Quarterly project review
LOCATION:Board Room
END:VEVENT
END:VCALENDAR`
      
      // Mock fetch for ICS data
      mockFetchResponse(mockICSData, 200)
      
      // Step 3: Mock Google Calendar API responses
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn()
        .mockResolvedValueOnce('google-event-1')
        .mockResolvedValueOnce('google-event-2')
      
      // Step 4: Execute sync
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('sync-e2e-123', 'Europe/Madrid')
      
      // Step 5: Verify complete workflow
      expect(result.success).toBe(true)
      expect(result.eventsProcessed).toBe(2)
      expect(result.eventsCreated).toBe(2)
      expect(result.eventsUpdated).toBe(0)
      expect(result.errors).toHaveLength(0)
      
      // Verify Google Calendar events were created correctly
      expect(mockGoogleCalendar.createGoogleCalendarEvent).toHaveBeenCalledTimes(2)
      expect(mockGoogleCalendar.createGoogleCalendarEvent).toHaveBeenCalledWith(
        'primary',
        expect.objectContaining({
          summary: 'Team Meeting',
          description: expect.stringContaining('Original UID: e2e-event-1@example.com'),
          location: 'Conference Room A'
        }),
        'Europe/Madrid'
      )
    })

    it('should handle authentication flow and retry after token refresh', async () => {
      // Step 1: Initial sync fails due to expired token
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync({ id: 'sync-auth-test' })])
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      
      // First call fails with auth error
      mockGoogleCalendar.getGoogleCalendarClient = jest.fn()
        .mockRejectedValueOnce(new Error('REAUTH_REQUIRED'))
        .mockResolvedValueOnce({
          events: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) }
        })
      
      // Step 2: User reauthenticates (simulated)
      require('next-auth').getServerSession.mockResolvedValue({
        user: { id: 'test-user-123' }
      })
      
      // Step 3: Mock fresh tokens in database
      mockDb.limit.mockResolvedValue([{
        access_token: 'fresh-access-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }])
      
      // Step 4: Retry sync - should succeed
      const { syncCalendar } = require('@/lib/sync-service')
      
      // First attempt should fail
      await expect(syncCalendar('sync-auth-test')).rejects.toThrow('REAUTH_REQUIRED')
      
      // After reauthentication, should succeed
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn().mockResolvedValue([])
      
      const result = await syncCalendar('sync-auth-test')
      expect(result.success).toBe(true)
    })

    it('should handle network failures and retry logic', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      // Step 1: ICS fetch fails initially
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR')
        })
      
      // Step 2: Google Calendar API temporarily fails
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary service unavailable'))
        .mockResolvedValueOnce({})
      
      const { syncCalendar } = require('@/lib/sync-service')
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn().mockResolvedValue([])
      
      // First attempt should fail
      await expect(syncCalendar('sync-network-test')).rejects.toThrow()
      
      // Retry should succeed
      const result = await syncCalendar('sync-network-test')
      expect(result.success).toBe(true)
    })
  })

  describe('User Journey Scenarios', () => {
    it('should handle new user onboarding flow', async () => {
      // Step 1: New user signs in with Google
      require('next-auth').getServerSession.mockResolvedValue({
        user: { id: 'new-user-456', email: 'newuser@example.com' }
      })
      
      // Step 2: User has no existing syncs
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockResolvedValue([])
      
      // Step 3: User creates their first sync
      const firstSyncData = {
        name: 'My First Calendar',
        icsUrl: 'https://example.com/my-calendar.ics',
        googleCalendarId: 'primary'
      }
      
      mockDb.returning.mockResolvedValue([createMockCalendarSync(firstSyncData)])
      
      // Step 4: First sync executes successfully
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn().mockResolvedValue([
        createMockCalendarEvent({ summary: 'Welcome Event' })
      ])
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn().mockResolvedValue('welcome-event-1')
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('new-sync-123')
      
      expect(result.success).toBe(true)
      expect(result.eventsCreated).toBe(1)
    })

    it('should handle power user with multiple calendar syncs', async () => {
      // Step 1: Power user with multiple syncs
      const multipleSyncs = [
        createMockCalendarSync({ id: 'work-sync', name: 'Work Calendar' }),
        createMockCalendarSync({ id: 'personal-sync', name: 'Personal Calendar' }),
        createMockCalendarSync({ id: 'family-sync', name: 'Family Calendar' })
      ]
      
      const mockDb = require('@/lib/db').db
      mockDb.where.mockResolvedValue(multipleSyncs)
      
      // Step 2: Mock different event sets for each calendar
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValueOnce([createMockCalendarEvent({ summary: 'Work Event' })])
        .mockResolvedValueOnce([createMockCalendarEvent({ summary: 'Personal Event' })])
        .mockResolvedValueOnce([createMockCalendarEvent({ summary: 'Family Event' })])
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn().mockResolvedValue('event-123')
      
      // Step 3: Sync all calendars
      const { syncAllActiveCalendars } = require('@/lib/sync-service')
      await syncAllActiveCalendars()
      
      // Step 4: Verify all calendars were processed
      expect(require('@/lib/ics-parser').parseICSFromUrlWithExpansion).toHaveBeenCalledTimes(3)
      expect(mockGoogleCalendar.createGoogleCalendarEvent).toHaveBeenCalledTimes(3)
    })

    it('should handle recurring events across multiple months', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      // Mock recurring event that spans multiple months
      const recurringEvents = Array.from({ length: 12 }, (_, i) => 
        createMockCalendarEvent({
          uid: 'recurring-meeting@example.com',
          summary: 'Monthly Team Meeting',
          start: new Date(2024, i, 15, 10, 0), // 15th of each month
          end: new Date(2024, i, 15, 11, 0)
        })
      )
      
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValue(recurringEvents)
      
      // Mock some existing events
      const existingEvents = {
        'recurring-meeting@example.com:2024-01-15T10:00:00.000Z': 'existing-event-1',
        'recurring-meeting@example.com:2024-02-15T10:00:00.000Z': 'existing-event-2'
      }
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue(existingEvents)
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn().mockResolvedValue('new-event-123')
      mockGoogleCalendar.updateGoogleCalendarEvent = jest.fn().mockResolvedValue(undefined)
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('recurring-sync-123')
      
      expect(result.success).toBe(true)
      expect(result.eventsProcessed).toBe(12)
      expect(result.eventsUpdated).toBe(2) // Two existing events updated
      expect(result.eventsCreated).toBe(10) // Ten new events created
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should recover from partial sync failures', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      const mockEvents = [
        createMockCalendarEvent({ uid: 'good-event', summary: 'Good Event' }),
        createMockCalendarEvent({ uid: 'bad-event', summary: 'Bad Event' }),
        createMockCalendarEvent({ uid: 'another-good-event', summary: 'Another Good Event' })
      ]
      
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValue(mockEvents)
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      
      // Second event fails, others succeed
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn()
        .mockResolvedValueOnce('good-event-123')
        .mockRejectedValueOnce(new Error('Insufficient permissions'))
        .mockResolvedValueOnce('another-good-event-123')
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('partial-fail-sync')
      
      expect(result.success).toBe(false) // Overall fails due to one error
      expect(result.eventsProcessed).toBe(3)
      expect(result.eventsCreated).toBe(2) // Two events succeeded
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Bad Event')
    })

    it('should handle calendar quota limits gracefully', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      // Create many events to trigger quota limits
      const manyEvents = Array.from({ length: 50 }, (_, i) => 
        createMockCalendarEvent({ 
          uid: `event-${i}@example.com`,
          summary: `Event ${i}`
        })
      )
      
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValue(manyEvents)
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      
      // Simulate quota limit hit after 30 events
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn()
        .mockImplementation((calId, event) => {
          const eventIndex = parseInt(event.uid.split('-')[1])
          if (eventIndex >= 30) {
            throw new Error('Quota exceeded')
          }
          return Promise.resolve(`google-event-${eventIndex}`)
        })
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('quota-limit-sync')
      
      expect(result.success).toBe(false)
      expect(result.eventsCreated).toBe(30) // 30 events created before quota hit
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('Quota exceeded'))).toBe(true)
    })

    it('should handle timezone conversion edge cases', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      // Events during DST transitions
      const dstEvents = [
        createMockCalendarEvent({
          uid: 'dst-start@example.com',
          summary: 'DST Start Event',
          start: new Date('2024-03-10T07:00:00Z'), // DST starts in US
          end: new Date('2024-03-10T08:00:00Z'),
          sourceTimezone: 'America/Denver'
        }),
        createMockCalendarEvent({
          uid: 'dst-end@example.com',
          summary: 'DST End Event',
          start: new Date('2024-11-03T06:00:00Z'), // DST ends in US
          end: new Date('2024-11-03T07:00:00Z'),
          sourceTimezone: 'America/Denver'
        })
      ]
      
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValue(dstEvents)
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn().mockResolvedValue('dst-event-123')
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('dst-sync', 'Europe/Madrid')
      
      expect(result.success).toBe(true)
      expect(result.eventsCreated).toBe(2)
      
      // Verify timezone conversion was applied
      expect(mockGoogleCalendar.createGoogleCalendarEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          summary: 'DST Start Event'
        }),
        'Europe/Madrid'
      )
    })
  })

  describe('Performance E2E Tests', () => {
    it('should handle large calendar sync within reasonable time', async () => {
      const startTime = Date.now()
      
      const mockDb = require('@/lib/db').db
      mockDb.limit.mockResolvedValue([createMockCalendarSync()])
      
      // Create 500 events (large calendar)
      const largeEventSet = Array.from({ length: 500 }, (_, i) => 
        createMockCalendarEvent({ 
          uid: `large-event-${i}@example.com`,
          summary: `Large Event ${i}`,
          description: 'A'.repeat(500) // 500 char description each
        })
      )
      
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion = jest.fn()
        .mockResolvedValue(largeEventSet)
      
      const mockGoogleCalendar = require('@/lib/google-calendar')
      mockGoogleCalendar.getExistingGoogleEvents = jest.fn().mockResolvedValue({})
      mockGoogleCalendar.createGoogleCalendarEvent = jest.fn()
        .mockImplementation(() => Promise.resolve('large-event-123'))
      
      const { syncCalendar } = require('@/lib/sync-service')
      const result = await syncCalendar('large-sync')
      const duration = Date.now() - startTime
      
      expect(result.success).toBe(true)
      expect(result.eventsProcessed).toBe(500)
      expect(result.eventsCreated).toBe(500)
      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds
    }, 35000) // Extend timeout for this test
  })

  afterAll(async () => {
    // Cleanup browser if real browser was used
    if (mockBrowser && mockBrowser.close) {
      await mockBrowser.close()
    }
  })
})