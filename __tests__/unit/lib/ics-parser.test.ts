import { parseICSData, filterEventsForMonth, CalendarEvent } from '@/lib/ics-parser'

describe('ICS Parser', () => {
  const mockICSData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-TIMEZONE:US Mountain Standard Time
BEGIN:VTIMEZONE
TZID:US Mountain Standard Time
BEGIN:STANDARD
DTSTART:20231105T020000
TZOFFSETFROM:-0600
TZOFFSETTO:-0700
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZNAME:MST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20230312T020000
TZOFFSETFROM:-0700
TZOFFSETTO:-0600
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZNAME:MDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART:20240301T100000
DTEND:20240301T110000
UID:test-event-1@example.com
SUMMARY:Test Event 1
DESCRIPTION:This is a test event
LOCATION:Test Location
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20240315T140000
DTEND:20240315T150000
UID:test-event-2@example.com
SUMMARY:Recurring Event
DESCRIPTION:This is a recurring event
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR`

  describe('parseICSData', () => {
    it('should parse basic ICS data correctly', () => {
      const events = parseICSData(mockICSData)
      
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        uid: 'test-event-1@example.com',
        summary: 'Test Event 1',
        description: 'This is a test event',
        location: 'Test Location',
        status: 'CONFIRMED',
      })
    })

    it('should extract timezone information', () => {
      const events = parseICSData(mockICSData)
      
      expect(events[0].sourceTimezone).toBe('US Mountain Standard Time')
    })

    it('should preserve recurrence rules', () => {
      const events = parseICSData(mockICSData)
      const recurringEvent = events.find(e => e.summary === 'Recurring Event')
      
      expect(recurringEvent?.recurrenceRule).toContain('FREQ=WEEKLY')
    })

    it('should handle malformed ICS data gracefully', () => {
      const malformedICS = 'INVALID ICS DATA'
      
      // The parser should return an empty array for malformed data instead of throwing
      const result = parseICSData(malformedICS)
      expect(result).toEqual([])
    })

    it('should handle empty ICS data', () => {
      const emptyICS = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`
      
      const events = parseICSData(emptyICS)
      expect(events).toHaveLength(0)
    })

    it('should set default values for missing fields', () => {
      const minimalICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20240301T100000
DTEND:20240301T110000
UID:minimal-event@example.com
END:VEVENT
END:VCALENDAR`
      
      const events = parseICSData(minimalICS)
      expect(events[0]).toMatchObject({
        summary: 'No Title',
        description: '',
        status: 'CONFIRMED',
      })
    })
  })

  describe('filterEventsForMonth', () => {
    const events: CalendarEvent[] = [
      {
        uid: 'event-1',
        summary: 'January Event',
        start: new Date(2024, 0, 15, 10, 0), // January 15, 2024
        end: new Date(2024, 0, 15, 11, 0),
      },
      {
        uid: 'event-2',
        summary: 'February Event',
        start: new Date(2024, 1, 10, 14, 0), // February 10, 2024
        end: new Date(2024, 1, 10, 15, 0),
      },
      {
        uid: 'event-3',
        summary: 'Cross-month Event',
        start: new Date(2024, 0, 30, 10, 0), // January 30, 2024
        end: new Date(2024, 1, 2, 11, 0), // February 2, 2024
      },
    ]

    it('should filter events for a specific month', () => {
      const januaryEvents = filterEventsForMonth(events, 2024, 1)
      
      expect(januaryEvents).toHaveLength(2)
      expect(januaryEvents.map(e => e.summary)).toContain('January Event')
      expect(januaryEvents.map(e => e.summary)).toContain('Cross-month Event')
    })

    it('should include cross-month events', () => {
      const februaryEvents = filterEventsForMonth(events, 2024, 2)
      
      expect(februaryEvents).toHaveLength(2)
      expect(februaryEvents.map(e => e.summary)).toContain('February Event')
      expect(februaryEvents.map(e => e.summary)).toContain('Cross-month Event')
    })

    it('should return empty array for months with no events', () => {
      const marchEvents = filterEventsForMonth(events, 2024, 3)
      
      expect(marchEvents).toHaveLength(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle events with invalid dates', () => {
      const invalidDateICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:INVALID-DATE
DTEND:INVALID-DATE
UID:invalid-event@example.com
SUMMARY:Invalid Date Event
END:VEVENT
END:VCALENDAR`
      
      const events = parseICSData(invalidDateICS)
      expect(events).toHaveLength(1)
      expect(events[0].start).toBeInstanceOf(Date)
    })

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(10000)
      const longDescICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20240301T100000
DTEND:20240301T110000
UID:long-desc-event@example.com
SUMMARY:Long Description Event
DESCRIPTION:${longDescription}
END:VEVENT
END:VCALENDAR`
      
      const events = parseICSData(longDescICS)
      expect(events[0].description).toBe(longDescription)
    })

    it('should handle special characters in event data', () => {
      const specialCharsICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20240301T100000
DTEND:20240301T110000
UID:special-chars@example.com
SUMMARY:Event with émojis 🎉 and spëcial chars
DESCRIPTION:Line 1\\nLine 2\\nLine 3
LOCATION:Café "Test" & More
END:VEVENT
END:VCALENDAR`
      
      const events = parseICSData(specialCharsICS)
      expect(events[0].summary).toContain('émojis 🎉')
      expect(events[0].location).toContain('Café "Test" & More')
    })
  })
})