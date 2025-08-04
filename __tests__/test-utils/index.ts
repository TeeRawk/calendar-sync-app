import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import * as React from 'react'

// Mock session data
export const mockSession = {
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg'
  },
  expires: '2099-01-01T00:00:00.000Z'
}

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  // Mock SessionProvider since we're testing with mocks
  return React.createElement('div', { 'data-testid': 'session-provider' }, children)
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// Test data factories
export const createMockCalendarSync = (overrides = {}) => ({
  id: 'sync-123',
  userId: 'test-user-123',
  name: 'Test Calendar Sync',
  icsUrl: 'https://example.com/calendar.ics',
  googleCalendarId: 'primary',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastSync: new Date('2024-01-01'),
  syncErrors: null,
  ...overrides
})

export const createMockCalendarEvent = (overrides = {}) => ({
  uid: 'event-123@example.com',
  summary: 'Test Event',
  description: 'Test event description',
  location: 'Test Location',
  start: new Date('2024-03-01T10:00:00Z'),
  end: new Date('2024-03-01T11:00:00Z'),
  status: 'CONFIRMED',
  sourceTimezone: 'UTC',
  recurrenceRule: undefined,
  attendees: [],
  ...overrides
})

export const createMockGoogleCalendar = (overrides = {}) => ({
  id: 'calendar-123@group.calendar.google.com',
  summary: 'Test Calendar',
  description: 'Test calendar description',
  primary: false,
  accessRole: 'owner',
  ...overrides
})

export const createMockSyncResult = (overrides = {}) => ({
  success: true,
  eventsProcessed: 5,
  eventsCreated: 3,
  eventsUpdated: 2,
  errors: [],
  duration: 1500,
  ...overrides
})

// Mock response helpers
export const mockFetchResponse = (data: any, status = 200) => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
  }
  
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response)
  return response
}

export const mockFetchError = (message: string, status = 500) => {
  const error = new Error(message)
  ;(global.fetch as jest.Mock).mockRejectedValueOnce(error)
  return error
}

// Database helpers
export const mockDrizzleQuery = (returnValue: any) => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(returnValue),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue(returnValue),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
})

// Google API helpers
export const createMockGoogleCalendarAPI = () => ({
  calendarList: {
    list: jest.fn().mockResolvedValue({
      data: {
        items: [
          createMockGoogleCalendar({ id: 'primary', summary: 'Primary Calendar', primary: true }),
          createMockGoogleCalendar({ id: 'calendar-2', summary: 'Secondary Calendar' })
        ]
      }
    })
  },
  calendars: {
    get: jest.fn().mockResolvedValue({
      data: {
        id: 'primary',
        summary: 'Primary Calendar',
        timeZone: 'America/Denver'
      }
    })
  },
  events: {
    list: jest.fn().mockResolvedValue({
      data: {
        items: []
      }
    }),
    insert: jest.fn().mockResolvedValue({
      data: {
        id: 'google-event-123',
        status: 'confirmed',
        summary: 'Test Event',
        htmlLink: 'https://calendar.google.com/event?eid=123'
      }
    }),
    update: jest.fn().mockResolvedValue({
      data: {
        id: 'google-event-123',
        status: 'confirmed'
      }
    })
  }
})

// Time and date helpers
export const advanceTime = (ms: number) => {
  jest.advanceTimersByTime(ms)
}

export const mockDate = (dateString: string) => {
  const mockDate = new Date(dateString)
  jest.spyOn(global, 'Date').mockImplementation((...args) => {
    if (args.length === 0) {
      return mockDate
    }
    return new Date(...args as ConstructorParameters<typeof Date>)
  })
  return mockDate
}

// Async test helpers
export const waitForAsync = () => new Promise(resolve => setImmediate(resolve))

export const expectAsyncThrow = async (fn: () => Promise<any>, expectedError?: string) => {
  let error: Error | undefined
  try {
    await fn()
  } catch (e) {
    error = e as Error
  }
  
  expect(error).toBeDefined()
  if (expectedError) {
    expect(error?.message).toContain(expectedError)
  }
}

// Console helpers for testing
export const captureConsoleOutput = () => {
  const logs: string[] = []
  const errors: string[] = []
  const warns: string[] = []
  
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn
  
  console.log = jest.fn((...args) => {
    logs.push(args.join(' '))
  })
  
  console.error = jest.fn((...args) => {
    errors.push(args.join(' '))
  })
  
  console.warn = jest.fn((...args) => {
    warns.push(args.join(' '))
  })
  
  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }
}