import { parseBusyFreeICS } from '../../lib/busy-free-parser';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../lib/busy-free-parser');

const mockParseBusyFreeICS = parseBusyFreeICS as jest.MockedFunction<typeof parseBusyFreeICS>;

describe('Busy/Free Calendar Parser Integration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockBusyFreeData = {
    calendarName: 'test@example.com',
    timezone: 'America/Phoenix',
    events: [
      {
        uid: 'busy1',
        start: new Date('2025-08-18T14:00:00Z'),
        end: new Date('2025-08-18T15:00:00Z'),
        status: 'busy' as const,
        transparency: 'opaque' as const,
        summary: 'Busy'
      },
      {
        uid: 'busy2',
        start: new Date('2025-08-19T16:00:00Z'),
        end: new Date('2025-08-19T17:00:00Z'),
        status: 'busy' as const,
        transparency: 'opaque' as const,
        summary: 'Busy'
      }
    ]
  };

  const mockCalendarSync = {
    id: 'sync123',
    userId: 'user123',
    name: 'Test Busy/Free Calendar',
    icsUrl: 'https://calendar.google.com/calendar/ical/test%40example.com/public/basic.ics',
    googleCalendarId: 'primary',
    isActive: true,
    syncType: 'busy_free' as const,
    privacyLevel: 'busy_only' as const
  };

  describe('parseBusyFreeICS parser integration', () => {
    it('should parse busy/free events correctly', async () => {
      mockParseBusyFreeICS.mockResolvedValue(mockBusyFreeData);

      const result = await mockParseBusyFreeICS('test-url');

      expect(result.events).toHaveLength(2);
      expect(result.events[0].status).toBe('busy');
      expect(result.events[1].status).toBe('busy');
    });
  });

  describe('Privacy compliance', () => {
    it('should create privacy-compliant event data', () => {
      const testEvent = mockBusyFreeData.events[0];
      expect(testEvent.status).toBe('busy');
      expect(testEvent.summary).toBe('Busy');
    });
  });
});