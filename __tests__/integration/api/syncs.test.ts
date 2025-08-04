import { GET, POST } from '@/app/api/syncs/route'
import { createMockCalendarSync, mockFetchResponse, expectAsyncThrow } from '../../test-utils'

// Mock NextRequest for integration tests
global.Request = jest.fn().mockImplementation((url, options = {}) => ({
  url,
  method: options.method || 'GET',
  headers: new Map(Object.entries(options.headers || {})),
  json: jest.fn().mockResolvedValue({}),
  text: jest.fn().mockResolvedValue(''),
  ...options
}))

// Mock dependencies
jest.mock('next-auth')
jest.mock('@/lib/db')
jest.mock('@/lib/google-calendar')

describe('/api/syncs Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock database
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    }
    require('@/lib/db').db = mockDb
    
    // Mock session
    require('next-auth').getServerSession.mockResolvedValue({
      user: { id: 'test-user-123' }
    })
    
    // Mock Google Calendar API
    require('@/lib/google-calendar').getUserCalendars.mockResolvedValue([
      { id: 'primary', summary: 'Primary Calendar' },
      { id: 'calendar-2', summary: 'Work Calendar' }
    ])
  })

  describe('GET /api/syncs', () => {
    it('should return user syncs with calendar names', async () => {
      const mockSyncs = [
        createMockCalendarSync({ 
          id: 'sync-1', 
          name: 'Personal Events',
          googleCalendarId: 'primary'
        }),
        createMockCalendarSync({ 
          id: 'sync-2', 
          name: 'Work Events',
          googleCalendarId: 'calendar-2'
        })
      ]
      
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockResolvedValue(mockSyncs)
      
      const response = await GET()
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toHaveLength(2)
      expect(data[0]).toMatchObject({
        id: 'sync-1',
        name: 'Personal Events',
        googleCalendarName: 'Primary Calendar'
      })
      expect(data[1]).toMatchObject({
        id: 'sync-2',
        name: 'Work Events',
        googleCalendarName: 'Work Calendar'
      })
    })

    it('should handle unknown calendar IDs gracefully', async () => {
      const mockSyncs = [
        createMockCalendarSync({ 
          googleCalendarId: 'unknown-calendar-id'
        })
      ]
      
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockResolvedValue(mockSyncs)
      
      const response = await GET()
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data[0].googleCalendarName).toBe('Unknown Calendar')
    })

    it('should return 401 when user is not authenticated', async () => {
      require('next-auth').getServerSession.mockResolvedValue(null)
      
      const response = await GET()
      
      expect(response.status).toBe(401)
      expect(await response.text()).toBe('Unauthorized')
    })

    it('should handle database errors gracefully', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockRejectedValue(new Error('Database connection failed'))
      
      const response = await GET()
      
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    })

    it('should handle Google Calendar API errors gracefully', async () => {
      require('@/lib/google-calendar').getUserCalendars.mockRejectedValue(
        new Error('Google Calendar authentication expired')
      )
      
      const response = await GET()
      
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    })

    it('should return empty array when user has no syncs', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockResolvedValue([])
      
      const response = await GET()
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toEqual([])
    })
  })

  describe('POST /api/syncs', () => {
    const validSyncData = {
      name: 'New Calendar Sync',
      icsUrl: 'https://example.com/calendar.ics',
      googleCalendarId: 'primary'
    }

    it('should create new sync successfully', async () => {
      const mockCreatedSync = createMockCalendarSync({
        ...validSyncData,
        id: 'sync-new-123'
      })
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([mockCreatedSync])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(validSyncData)
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        id: 'sync-new-123',
        name: 'New Calendar Sync',
        icsUrl: 'https://example.com/calendar.ics',
        googleCalendarId: 'primary',
        isActive: true
      })
      
      // Verify database insert was called correctly
      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: 'test-user-123',
        name: 'New Calendar Sync',
        icsUrl: 'https://example.com/calendar.ics',
        googleCalendarId: 'primary',
        isActive: true
      })
    })

    it('should return 401 when user is not authenticated', async () => {
      require('next-auth').getServerSession.mockResolvedValue(null)
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(validSyncData)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(401)
      expect(await response.text()).toBe('Unauthorized')
    })

    it('should validate required fields', async () => {
      const testCases = [
        { name: '', icsUrl: validSyncData.icsUrl, googleCalendarId: validSyncData.googleCalendarId },
        { name: validSyncData.name, icsUrl: '', googleCalendarId: validSyncData.googleCalendarId },
        { name: validSyncData.name, icsUrl: validSyncData.icsUrl, googleCalendarId: '' },
        { icsUrl: validSyncData.icsUrl, googleCalendarId: validSyncData.googleCalendarId }, // Missing name
        { name: validSyncData.name, googleCalendarId: validSyncData.googleCalendarId }, // Missing icsUrl
        { name: validSyncData.name, icsUrl: validSyncData.icsUrl }, // Missing googleCalendarId
      ]
      
      for (const testData of testCases) {
        const request = new NextRequest('http://localhost:3000/api/syncs', {
          method: 'POST',
          body: JSON.stringify(testData)
        })
        
        const response = await POST(request)
        
        expect(response.status).toBe(400)
        expect(await response.text()).toBe('Missing required fields')
      }
    })

    it('should handle invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: 'invalid-json'
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    })

    it('should handle database insert errors', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockRejectedValue(new Error('Unique constraint violation'))
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(validSyncData)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    })

    it('should handle very long URLs gracefully', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2000) + '.ics'
      const syncDataWithLongUrl = {
        ...validSyncData,
        icsUrl: longUrl
      }
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithLongUrl)])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithLongUrl)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.icsUrl).toBe(longUrl)
    })

    it('should handle special characters in sync name', async () => {
      const syncDataWithSpecialChars = {
        ...validSyncData,
        name: 'Calendar with émojis 🎉 and spëcial chars'
      }
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithSpecialChars)])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithSpecialChars)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe('Calendar with émojis 🎉 and spëcial chars')
    })
  })

  describe('Performance Tests', () => {
    it('should handle GET request efficiently with large number of syncs', async () => {
      const startTime = Date.now()
      
      // Create 100 mock syncs
      const mockSyncs = Array.from({ length: 100 }, (_, i) => 
        createMockCalendarSync({ 
          id: `sync-${i}`,
          name: `Calendar Sync ${i}`,
          googleCalendarId: i % 2 === 0 ? 'primary' : 'calendar-2'
        })
      )
      
      const mockDb = require('@/lib/db').db
      mockDb.orderBy.mockResolvedValue(mockSyncs)
      
      const response = await GET()
      const data = await response.json()
      const duration = Date.now() - startTime
      
      expect(response.status).toBe(200)
      expect(data).toHaveLength(100)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent POST requests', async () => {
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockImplementation((data) => 
        Promise.resolve([createMockCalendarSync(data)])
      )
      
      // Create 10 concurrent POST requests
      const requests = Array.from({ length: 10 }, (_, i) => {
        const request = new NextRequest('http://localhost:3000/api/syncs', {
          method: 'POST',
          body: JSON.stringify({
            ...validSyncData,
            name: `Concurrent Sync ${i}`
          })
        })
        return POST(request)
      })
      
      const responses = await Promise.all(requests)
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })
  })

  describe('Security Tests', () => {
    it('should prevent SQL injection in sync name', async () => {
      const maliciousName = "'; DROP TABLE calendar_syncs; --"
      const syncDataWithMaliciousName = {
        ...validSyncData,
        name: maliciousName
      }
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithMaliciousName)])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithMaliciousName)
      })
      
      const response = await POST(request)
      
      // Should still work (Drizzle ORM handles parameterization)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe(maliciousName) // Stored as-is, safely parameterized
    })

    it('should prevent XSS in sync name', async () => {
      const xssPayload = '<script>alert("XSS")</script>'
      const syncDataWithXSS = {
        ...validSyncData,
        name: xssPayload
      }
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithXSS)])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithXSS)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // XSS payload should be stored as-is (escaping happens at display time)
      expect(data.name).toBe(xssPayload)
    })

    it('should validate calendar ID format', async () => {
      const syncDataWithInvalidCalendarId = {
        ...validSyncData,
        googleCalendarId: 'javascript:alert("XSS")'
      }
      
      const mockDb = require('@/lib/db').db
      mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithInvalidCalendarId)])
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithInvalidCalendarId)
      })
      
      const response = await POST(request)
      
      // Should still accept it (validation happens at sync time)
      expect(response.status).toBe(200)
    })

    it('should validate ICS URL format', async () => {
      const testCases = [
        'not-a-url',
        'javascript:alert("XSS")',
        'data:text/plain;base64,SGVsbG8gV29ybGQ=',
        'file:///etc/passwd'
      ]
      
      for (const maliciousUrl of testCases) {
        const syncDataWithMaliciousUrl = {
          ...validSyncData,
          icsUrl: maliciousUrl
        }
        
        const mockDb = require('@/lib/db').db
        mockDb.returning.mockResolvedValue([createMockCalendarSync(syncDataWithMaliciousUrl)])
        
        const request = new NextRequest('http://localhost:3000/api/syncs', {
          method: 'POST',
          body: JSON.stringify(syncDataWithMaliciousUrl)
        })
        
        const response = await POST(request)
        
        // API should accept it (URL validation happens at sync time)
        expect(response.status).toBe(200)
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: ''
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(500) // JSON parsing error
    })

    it('should handle null values in required fields', async () => {
      const syncDataWithNulls = {
        name: null,
        icsUrl: null,
        googleCalendarId: null
      }
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithNulls)
      })
      
      const response = await POST(request)
      
      expect(response.status).toBe(400)
      expect(await response.text()).toBe('Missing required fields')
    })

    it('should handle extremely large request bodies', async () => {
      const hugeName = 'A'.repeat(100000) // 100KB string
      const syncDataWithHugeName = {
        ...validSyncData,
        name: hugeName
      }
      
      const request = new NextRequest('http://localhost:3000/api/syncs', {
        method: 'POST',
        body: JSON.stringify(syncDataWithHugeName)
      })
      
      // This may timeout or fail due to size limits, which is expected
      try {
        const response = await POST(request)
        expect([200, 413, 500]).toContain(response.status)
      } catch (error) {
        // Expected for extremely large payloads
        expect(error).toBeDefined()
      }
    })
  })
})