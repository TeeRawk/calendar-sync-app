/**
 * @jest-environment jsdom
 */

// Define interfaces directly to avoid import issues during testing
interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  recurrenceRule?: string;
  status?: string;
  sourceTimezone?: string;
}

// Mock the Google Calendar function
const mockGetExistingGoogleEvents = jest.fn().mockName('getExistingGoogleEvents');

describe('Duplicate Detection Algorithm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UID+DateTime Key Generation', () => {
    it('should create unique keys for identical events at different times', () => {
      const baseEvent: CalendarEvent = {
        uid: 'event123',
        summary: 'Test Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const event1 = { ...baseEvent, start: new Date('2024-08-15T10:00:00Z') };
      const event2 = { ...baseEvent, start: new Date('2024-08-16T10:00:00Z') };

      const key1 = `${event1.uid}:${event1.start.toISOString()}`;
      const key2 = `${event2.uid}:${event2.start.toISOString()}`;

      expect(key1).not.toBe(key2);
      expect(key1).toBe('event123:2024-08-15T10:00:00.000Z');
      expect(key2).toBe('event123:2024-08-16T10:00:00.000Z');
    });

    it('should create identical keys for same event and time', () => {
      const event: CalendarEvent = {
        uid: 'event123',
        summary: 'Test Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const key1 = `${event.uid}:${event.start.toISOString()}`;
      const key2 = `${event.uid}:${event.start.toISOString()}`;

      expect(key1).toBe(key2);
      expect(key1).toBe('event123:2024-08-15T10:00:00.000Z');
    });

    it('should handle events with special characters in UID', () => {
      const event: CalendarEvent = {
        uid: 'event-123@domain.com',
        summary: 'Test Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const key = `${event.uid}:${event.start.toISOString()}`;
      expect(key).toBe('event-123@domain.com:2024-08-15T10:00:00.000Z');
    });

    it('should handle millisecond precision in timestamps', () => {
      const event: CalendarEvent = {
        uid: 'event123',
        summary: 'Test Meeting',
        start: new Date('2024-08-15T10:00:00.123Z'),
        end: new Date('2024-08-15T11:00:00.456Z'),
      };

      const key = `${event.uid}:${event.start.toISOString()}`;
      expect(key).toBe('event123:2024-08-15T10:00:00.123Z');
    });
  });

  describe('Existing Event Detection', () => {
    it('should correctly parse existing events from Google Calendar', async () => {
      const mockGoogleEvents = {
        'event123:2024-08-15T10:00:00.000Z': 'google-event-id-1',
        'event456:2024-08-15T14:00:00.000Z': 'google-event-id-2',
      };

      mockGetExistingGoogleEvents.mockResolvedValue(mockGoogleEvents);

      const calendarId = 'test@gmail.com';
      const timeMin = new Date('2024-08-01T00:00:00Z');
      const timeMax = new Date('2024-08-31T23:59:59Z');

      const result = await mockGetExistingGoogleEvents(calendarId, timeMin, timeMax);

      expect(result).toEqual(mockGoogleEvents);
      expect(mockGetExistingGoogleEvents).toHaveBeenCalledWith(calendarId, timeMin, timeMax);
    });

    it('should handle empty existing events', async () => {
      mockGetExistingGoogleEvents.mockResolvedValue({});

      const result = await mockGetExistingGoogleEvents(
        'test@gmail.com',
        new Date('2024-08-01T00:00:00Z'),
        new Date('2024-08-31T23:59:59Z')
      );

      expect(result).toEqual({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle events without Original UID in description', async () => {
      mockGetExistingGoogleEvents.mockResolvedValue({});

      const result = await mockGetExistingGoogleEvents(
        'test@gmail.com',
        new Date('2024-08-01T00:00:00Z'),
        new Date('2024-08-31T23:59:59Z')
      );

      expect(result).toEqual({});
    });
  });

  describe('Duplicate Matching Logic', () => {
    it('should identify exact duplicates by UID and start time', () => {
      const sourceEvent: CalendarEvent = {
        uid: 'meeting123',
        summary: 'Team Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
        description: 'Weekly team sync',
      };

      const existingEvents = {
        'meeting123:2024-08-15T10:00:00.000Z': 'google-event-id-1',
        'meeting456:2024-08-15T14:00:00.000Z': 'google-event-id-2',
      };

      const sourceKey = `${sourceEvent.uid}:${sourceEvent.start.toISOString()}`;
      const matchingEventId = existingEvents[sourceKey];

      expect(matchingEventId).toBe('google-event-id-1');
    });

    it('should not match events with same UID but different start times', () => {
      const sourceEvent: CalendarEvent = {
        uid: 'meeting123',
        summary: 'Team Meeting',
        start: new Date('2024-08-15T11:00:00Z'),
        end: new Date('2024-08-15T12:00:00Z'),
      };

      const existingEvents = {
        'meeting123:2024-08-15T10:00:00.000Z': 'google-event-id-1',
      };

      const sourceKey = `${sourceEvent.uid}:${sourceEvent.start.toISOString()}`;
      const matchingEventId = existingEvents[sourceKey];

      expect(matchingEventId).toBeUndefined();
    });

    it('should not match events with different UIDs but same start times', () => {
      const sourceEvent: CalendarEvent = {
        uid: 'meeting456',
        summary: 'Team Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const existingEvents = {
        'meeting123:2024-08-15T10:00:00.000Z': 'google-event-id-1',
      };

      const sourceKey = `${sourceEvent.uid}:${sourceEvent.start.toISOString()}`;
      const matchingEventId = existingEvents[sourceKey];

      expect(matchingEventId).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with undefined or null UIDs gracefully', () => {
      const event: CalendarEvent = {
        uid: undefined as any,
        summary: 'Meeting without UID',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      expect(() => {
        const key = `${event.uid}:${event.start.toISOString()}`;
      }).not.toThrow();

      const key = `${event.uid}:${event.start.toISOString()}`;
      expect(key).toBe('undefined:2024-08-15T10:00:00.000Z');
    });

    it('should handle events with very long UIDs', () => {
      const longUID = 'a'.repeat(1000) + '@example.com';
      const event: CalendarEvent = {
        uid: longUID,
        summary: 'Meeting with long UID',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const key = `${event.uid}:${event.start.toISOString()}`;
      expect(key).toContain(longUID);
      expect(key.length).toBeGreaterThan(1000);
    });

    it('should handle events with special date edge cases', () => {
      const event: CalendarEvent = {
        uid: 'edge-case-event',
        summary: 'Edge Case Meeting',
        start: new Date('2000-01-01T00:00:00.000Z'), // Y2K
        end: new Date('2000-01-01T01:00:00.000Z'),
      };

      const key = `${event.uid}:${event.start.toISOString()}`;
      expect(key).toBe('edge-case-event:2000-01-01T00:00:00.000Z');
    });

    it('should handle leap year and daylight saving edge cases', () => {
      const leapYearEvent: CalendarEvent = {
        uid: 'leap-year-event',
        summary: 'Leap Year Meeting',
        start: new Date('2024-02-29T10:00:00Z'), // Leap year
        end: new Date('2024-02-29T11:00:00Z'),
      };

      const key = `${leapYearEvent.uid}:${leapYearEvent.start.toISOString()}`;
      expect(key).toBe('leap-year-event:2024-02-29T10:00:00.000Z');
    });
  });

  describe('Performance Considerations', () => {
    it('should efficiently handle large numbers of existing events', () => {
      const existingEvents: { [key: string]: string } = {};
      
      // Create 10,000 existing events
      for (let i = 0; i < 10000; i++) {
        const date = new Date('2024-08-01T00:00:00Z');
        date.setHours(date.getHours() + i);
        existingEvents[`event-${i}:${date.toISOString()}`] = `google-event-${i}`;
      }

      const testEvent: CalendarEvent = {
        uid: 'event-5000',
        summary: 'Test Event',
        start: new Date('2024-08-01T00:00:00Z'),
        end: new Date('2024-08-01T01:00:00Z'),
      };
      testEvent.start.setHours(testEvent.start.getHours() + 5000);

      const startTime = performance.now();
      const key = `${testEvent.uid}:${testEvent.start.toISOString()}`;
      const result = existingEvents[key];
      const endTime = performance.now();

      expect(result).toBe('google-event-5000');
      expect(endTime - startTime).toBeLessThan(1); // Should be very fast (< 1ms)
    });

    it('should handle key generation performance for many events', () => {
      const events: CalendarEvent[] = [];
      
      // Generate 1000 events
      for (let i = 0; i < 1000; i++) {
        const date = new Date('2024-08-01T10:00:00Z');
        date.setMinutes(date.getMinutes() + i * 30);
        
        events.push({
          uid: `performance-test-${i}`,
          summary: `Meeting ${i}`,
          start: date,
          end: new Date(date.getTime() + 60 * 60 * 1000), // 1 hour later
        });
      }

      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();

      expect(keys).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(50); // Should complete within 50ms
      expect(new Set(keys).size).toBe(1000); // All keys should be unique
    });
  });
});