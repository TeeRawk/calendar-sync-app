import { parseBusyFreeICS, BusyFreeEvent, BusyFreeCalendar } from '../../../lib/busy-free-parser';
import { jest } from '@jest/globals';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Busy/Free ICS Parser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockBusyFreeICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:michael.klypalskyi.ext@sonymusic-pde.com
X-WR-TIMEZONE:America/Phoenix
BEGIN:VEVENT
DTSTART:20250818T140000Z
DTEND:20250818T150000Z
DTSTAMP:20250818T120000Z
UID:abc123
CREATED:20250818T120000Z
DESCRIPTION:
LAST-MODIFIED:20250818T120000Z
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Busy
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20250819T160000Z
DTEND:20250819T170000Z
DTSTAMP:20250818T120000Z
UID:def456
CREATED:20250818T120000Z
DESCRIPTION:
LAST-MODIFIED:20250818T120000Z
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Busy
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

  describe('parseBusyFreeICS', () => {
    it('should parse basic busy/free calendar data', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockBusyFreeICS,
      } as Response);

      const result = await parseBusyFreeICS('https://example.com/calendar.ics');

      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toMatchObject({
        uid: 'abc123',
        start: new Date('2025-08-18T14:00:00.000Z'),
        end: new Date('2025-08-18T15:00:00.000Z'),
        status: 'busy',
        transparency: 'opaque',
        summary: 'Busy'
      });
      expect(result.events[1]).toMatchObject({
        uid: 'def456',
        start: new Date('2025-08-19T16:00:00.000Z'),
        end: new Date('2025-08-19T17:00:00.000Z'),
        status: 'busy',
        transparency: 'opaque',
        summary: 'Busy'
      });
    });

    it('should handle free time events', async () => {
      const freeTimeICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:test@example.com
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
DTSTART:20250818T140000Z
DTEND:20250818T150000Z
DTSTAMP:20250818T120000Z
UID:free123
SUMMARY:Free
TRANSP:TRANSPARENT
STATUS:FREE
END:VEVENT
END:VCALENDAR`;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => freeTimeICS,
      } as Response);

      const result = await parseBusyFreeICS('https://example.com/free.ics');

      expect(result.events[0]).toMatchObject({
        uid: 'free123',
        status: 'free',
        transparency: 'transparent',
        summary: 'Free'
      });
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(parseBusyFreeICS('https://example.com/error.ics'))
        .rejects
        .toThrow('Failed to fetch busy/free calendar: Network error');
    });

    it('should handle HTTP errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(parseBusyFreeICS('https://example.com/notfound.ics'))
        .rejects
        .toThrow('Failed to fetch busy/free calendar: HTTP 404 Not Found');
    });

    it('should handle recurring events within date range', async () => {
      const recurringICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:test@example.com
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
DTSTART:20250818T140000Z
DTEND:20250818T150000Z
DTSTAMP:20250818T120000Z
UID:recurring123
SUMMARY:Busy
RRULE:FREQ=DAILY;COUNT=3
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => recurringICS,
      } as Response);

      const startDate = new Date('2025-08-18');
      const endDate = new Date('2025-08-25');
      
      const result = await parseBusyFreeICS('https://example.com/recurring.ics', {
        startDate,
        endDate
      });

      expect(result.events).toHaveLength(3);
      expect(result.events[0].uid).toMatch(/recurring123-\d+/);
      expect(result.events[1].uid).toMatch(/recurring123-\d+/);
      expect(result.events[2].uid).toMatch(/recurring123-\d+/);
    });
  });

  describe('BusyFreeEvent model', () => {
    it('should create valid busy/free event', () => {
      const event: BusyFreeEvent = {
        uid: 'test123',
        start: new Date('2025-08-18T14:00:00Z'),
        end: new Date('2025-08-18T15:00:00Z'),
        status: 'busy',
        transparency: 'opaque',
        summary: 'Busy'
      };

      expect(event.status).toBe('busy');
      expect(event.transparency).toBe('opaque');
      expect(event.uid).toBe('test123');
    });

    it('should handle optional fields', () => {
      const event: BusyFreeEvent = {
        uid: 'test123',
        start: new Date('2025-08-18T14:00:00Z'),
        end: new Date('2025-08-18T15:00:00Z'),
        status: 'free',
        transparency: 'transparent',
        summary: 'Free',
        location: 'Virtual',
        attendee: 'test@example.com'
      };

      expect(event.location).toBe('Virtual');
      expect(event.attendee).toBe('test@example.com');
    });
  });

  describe('Date range filtering', () => {
    it('should filter events within date range', async () => {
      const icsWithMultipleDates = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
DTSTART:20250817T140000Z
DTEND:20250817T150000Z
UID:before123
SUMMARY:Busy
END:VEVENT
BEGIN:VEVENT
DTSTART:20250818T140000Z
DTEND:20250818T150000Z
UID:during123
SUMMARY:Busy
END:VEVENT
BEGIN:VEVENT
DTSTART:20250820T140000Z
DTEND:20250820T150000Z
UID:after123
SUMMARY:Busy
END:VEVENT
END:VCALENDAR`;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => icsWithMultipleDates,
      } as Response);

      const result = await parseBusyFreeICS('https://example.com/multiple.ics', {
        startDate: new Date('2025-08-18'),
        endDate: new Date('2025-08-19')
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].uid).toBe('during123');
    });
  });
});