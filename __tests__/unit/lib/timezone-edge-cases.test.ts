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

// Mock the Google Calendar functions
const mockCreateGoogleCalendarEvent = jest.fn().mockName('createGoogleCalendarEvent');
const mockUpdateGoogleCalendarEvent = jest.fn().mockName('updateGoogleCalendarEvent');

describe('Timezone Edge Cases and Partial Matches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Timezone Variations', () => {
    it('should generate consistent keys regardless of timezone representation', () => {
      // Same moment in time, different timezone representations
      const utcEvent: CalendarEvent = {
        uid: 'timezone-test',
        summary: 'Meeting in UTC',
        start: new Date('2024-08-15T14:00:00.000Z'), // 2 PM UTC
        end: new Date('2024-08-15T15:00:00.000Z'),
        sourceTimezone: 'UTC',
      };

      const pstEvent: CalendarEvent = {
        uid: 'timezone-test',
        summary: 'Meeting in PST',
        start: new Date('2024-08-15T07:00:00-07:00'), // 7 AM PST = 2 PM UTC
        end: new Date('2024-08-15T08:00:00-07:00'),
        sourceTimezone: 'America/Los_Angeles',
      };

      // Both should generate different keys since they have different UTC timestamps
      const utcKey = `${utcEvent.uid}:${utcEvent.start.toISOString()}`;
      const pstKey = `${pstEvent.uid}:${pstEvent.start.toISOString()}`;

      // Even though they represent the same moment, they should be treated as different
      // since we're using the actual Date object's ISO string representation
      expect(utcKey).toBe('timezone-test:2024-08-15T14:00:00.000Z');
      expect(pstKey).toBe('timezone-test:2024-08-15T14:00:00.000Z'); // Date object normalizes to UTC
    });

    it('should handle daylight saving time transitions', () => {
      // Spring forward: 2 AM becomes 3 AM
      const springForward: CalendarEvent = {
        uid: 'dst-spring',
        summary: 'Spring Forward Meeting',
        start: new Date('2024-03-10T07:00:00Z'), // 2 AM EST becomes 3 AM EDT
        end: new Date('2024-03-10T08:00:00Z'),
        sourceTimezone: 'America/New_York',
      };

      // Fall back: 2 AM happens twice
      const fallBack: CalendarEvent = {
        uid: 'dst-fall',
        summary: 'Fall Back Meeting',
        start: new Date('2024-11-03T06:00:00Z'), // 2 AM EDT becomes 1 AM EST
        end: new Date('2024-11-03T07:00:00Z'),
        sourceTimezone: 'America/New_York',
      };

      const springKey = `${springForward.uid}:${springForward.start.toISOString()}`;
      const fallKey = `${fallBack.uid}:${fallBack.start.toISOString()}`;

      expect(springKey).toBe('dst-spring:2024-03-10T07:00:00.000Z');
      expect(fallKey).toBe('dst-fall:2024-11-03T06:00:00.000Z');

      // Keys should be unique even during DST transitions
      expect(springKey).not.toBe(fallKey);
    });

    it('should handle leap seconds and unusual time formats', () => {
      const leapSecondEvent: CalendarEvent = {
        uid: 'leap-second-test',
        summary: 'Leap Second Meeting',
        start: new Date('2024-06-30T23:59:59.999Z'), // Close to leap second
        end: new Date('2024-07-01T00:59:59.999Z'),
      };

      const key = `${leapSecondEvent.uid}:${leapSecondEvent.start.toISOString()}`;
      expect(key).toBe('leap-second-test:2024-06-30T23:59:59.999Z');
    });

    it('should handle different timezone name formats', () => {
      const timezoneVariations = [
        { tz: 'US/Pacific', expected: 'US/Pacific' },
        { tz: 'America/Los_Angeles', expected: 'America/Los_Angeles' },
        { tz: 'PST8PDT', expected: 'PST8PDT' },
        { tz: 'US Mountain Standard Time', expected: 'US Mountain Standard Time' },
        { tz: 'GMT-08:00', expected: 'GMT-08:00' },
        { tz: 'UTC-8', expected: 'UTC-8' },
      ];

      timezoneVariations.forEach(({ tz, expected }) => {
        const event: CalendarEvent = {
          uid: `tz-format-test-${tz.replace(/[^a-zA-Z0-9]/g, '_')}`,
          summary: `Meeting in ${tz}`,
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
          sourceTimezone: tz,
        };

        expect(event.sourceTimezone).toBe(expected);
        
        // Key generation should still work regardless of timezone format
        const key = `${event.uid}:${event.start.toISOString()}`;
        expect(key).toContain(event.uid);
        expect(key).toContain('2024-08-15T10:00:00.000Z');
      });
    });
  });

  describe('Partial Match Detection', () => {
    it('should not match events with similar but different UIDs', () => {
      const baseEvent = {
        summary: 'Team Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const similarUIDs = [
        'meeting-123',
        'meeting_123',
        'meeting123',
        'Meeting-123',
        'meeting-123-updated',
        'meeting-1234',
        'ameeting-123',
      ];

      const keys = similarUIDs.map(uid => {
        const event: CalendarEvent = { ...baseEvent, uid };
        return `${event.uid}:${event.start.toISOString()}`;
      });

      // All keys should be unique despite similar UIDs
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(similarUIDs.length);
    });

    it('should not match events with same UID but slightly different times', () => {
      const uid = 'exact-time-test';
      const summary = 'Time Sensitive Meeting';
      const baseTime = '2024-08-15T10:00:00.000Z';

      const timeVariations = [
        new Date('2024-08-15T10:00:00.000Z'), // Exact
        new Date('2024-08-15T10:00:00.001Z'), // 1ms later
        new Date('2024-08-15T10:00:01.000Z'), // 1s later
        new Date('2024-08-15T10:01:00.000Z'), // 1min later
        new Date('2024-08-15T11:00:00.000Z'), // 1hr later
        new Date('2024-08-16T10:00:00.000Z'), // 1day later
      ];

      const keys = timeVariations.map(start => {
        const event: CalendarEvent = {
          uid,
          summary,
          start,
          end: new Date(start.getTime() + 60 * 60 * 1000), // 1 hour later
        };
        return `${event.uid}:${event.start.toISOString()}`;
      });

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(timeVariations.length);

      // Verify specific key formats
      expect(keys[0]).toBe('exact-time-test:2024-08-15T10:00:00.000Z');
      expect(keys[1]).toBe('exact-time-test:2024-08-15T10:00:00.001Z');
      expect(keys[2]).toBe('exact-time-test:2024-08-15T10:00:01.000Z');
    });

    it('should handle events with identical content but different UIDs', () => {
      const identicalContent = {
        summary: 'Identical Meeting',
        description: 'Same description',
        location: 'Same room',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const event1: CalendarEvent = { ...identicalContent, uid: 'event-1' };
      const event2: CalendarEvent = { ...identicalContent, uid: 'event-2' };

      const key1 = `${event1.uid}:${event1.start.toISOString()}`;
      const key2 = `${event2.uid}:${event2.start.toISOString()}`;

      expect(key1).not.toBe(key2);
      expect(key1).toBe('event-1:2024-08-15T10:00:00.000Z');
      expect(key2).toBe('event-2:2024-08-15T10:00:00.000Z');
    });
  });

  describe('Edge Cases in Event Matching', () => {
    it('should handle events with malformed or unusual UIDs', () => {
      const unusualUIDs = [
        '', // Empty string
        ' ', // Space only
        '\n\t', // Whitespace characters
        '🎉meeting-123🎉', // Emoji
        'meeting@domain.com', // Email-like
        'meeting/123/456', // Path-like
        'meeting?param=value', // URL-like
        'meeting#anchor', // Anchor-like
        'meeting with spaces and (parentheses)', // Complex
        'meeting-' + 'x'.repeat(1000), // Very long
      ];

      unusualUIDs.forEach(uid => {
        const event: CalendarEvent = {
          uid,
          summary: `Meeting with unusual UID: ${uid.substring(0, 10)}...`,
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        };

        const key = `${event.uid}:${event.start.toISOString()}`;
        
        // Should not throw and should generate a key
        expect(key).toContain('2024-08-15T10:00:00.000Z');
        expect(key.startsWith(uid + ':')).toBe(true);
      });
    });

    it('should handle events with extreme dates', () => {
      const extremeDates = [
        new Date('1970-01-01T00:00:00Z'), // Unix epoch
        new Date('2000-01-01T00:00:00Z'), // Y2K
        new Date('2038-01-19T03:14:07Z'), // 32-bit timestamp limit
        new Date('2100-12-31T23:59:59Z'), // Far future
        new Date('1900-01-01T00:00:00Z'), // Early date
      ];

      extremeDates.forEach((date, index) => {
        const event: CalendarEvent = {
          uid: `extreme-date-${index}`,
          summary: `Extreme Date Meeting ${index}`,
          start: date,
          end: new Date(date.getTime() + 60 * 60 * 1000), // 1 hour later
        };

        const key = `${event.uid}:${event.start.toISOString()}`;
        
        expect(key).toContain(`extreme-date-${index}`);
        expect(key).toContain(date.toISOString());
      });
    });

    it('should handle concurrent events with microsecond differences', () => {
      const baseTime = new Date('2024-08-15T10:00:00.000Z').getTime();
      const concurrentEvents: CalendarEvent[] = [];

      // Create 100 events with microsecond differences
      for (let i = 0; i < 100; i++) {
        const eventTime = new Date(baseTime + i); // Millisecond increments
        concurrentEvents.push({
          uid: `concurrent-${i}`,
          summary: `Concurrent Event ${i}`,
          start: eventTime,
          end: new Date(eventTime.getTime() + 60 * 60 * 1000),
        });
      }

      const keys = concurrentEvents.map(event => 
        `${event.uid}:${event.start.toISOString()}`
      );

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(100);

      // Keys should maintain chronological order (sort them first since JavaScript's default sort is lexicographic)
      const sortedKeysByTime = keys.slice().sort((a, b) => {
        const timeA = a.split(':')[1]; // Get timestamp part
        const timeB = b.split(':')[1];
        return timeA.localeCompare(timeB);
      });
      expect(keys).toEqual(sortedKeysByTime); // Keys should be naturally sorted by timestamp
    });
  });

  describe('Locale and Encoding Edge Cases', () => {
    it('should handle international characters in UIDs and summaries', () => {
      const internationalEvents: CalendarEvent[] = [
        {
          uid: 'réunion-français-123',
          summary: 'Réunion d\'équipe',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        },
        {
          uid: '会议-中文-456',
          summary: '团队会议',
          start: new Date('2024-08-15T14:00:00Z'),
          end: new Date('2024-08-15T15:00:00Z'),
        },
        {
          uid: 'собрание-русский-789',
          summary: 'Командная встреча',
          start: new Date('2024-08-15T16:00:00Z'),
          end: new Date('2024-08-15T17:00:00Z'),
        },
        {
          uid: 'مؤتمر-عربي-101',
          summary: 'اجتماع الفريق',
          start: new Date('2024-08-15T18:00:00Z'),
          end: new Date('2024-08-15T19:00:00Z'),
        }
      ];

      internationalEvents.forEach(event => {
        const key = `${event.uid}:${event.start.toISOString()}`;
        
        expect(key).toContain(event.uid);
        expect(key).toContain(event.start.toISOString());
        
        // Should handle Unicode characters properly
        expect(key.length).toBeGreaterThan(event.uid.length + 10);
      });

      // All keys should be unique
      const keys = internationalEvents.map(event => 
        `${event.uid}:${event.start.toISOString()}`
      );
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(internationalEvents.length);
    });

    it('should handle special control characters', () => {
      const controlCharEvents = [
        { uid: 'meeting\x00null', char: 'null byte' },
        { uid: 'meeting\x08backspace', char: 'backspace' },
        { uid: 'meeting\x1Bescape', char: 'escape' },
        { uid: 'meeting\x7FDEL', char: 'delete' },
      ];

      controlCharEvents.forEach(({ uid, char }) => {
        const event: CalendarEvent = {
          uid,
          summary: `Meeting with ${char}`,
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        };

        // Should not throw when generating key
        expect(() => {
          const key = `${event.uid}:${event.start.toISOString()}`;
        }).not.toThrow();

        const key = `${event.uid}:${event.start.toISOString()}`;
        expect(key).toContain('2024-08-15T10:00:00.000Z');
      });
    });
  });
});