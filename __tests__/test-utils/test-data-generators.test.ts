/**
 * @jest-environment jsdom
 */

import {
  generateTestEvent,
  generateTestEvents,
  generateWorkDayMeetings,
  generatePerformanceTestData,
  generateDuplicateScenarios,
  generateTimezoneScenarios,
} from './test-data-generators';

describe('Test Data Generators', () => {
  describe('generateTestEvent', () => {
    it('should generate a valid calendar event with defaults', () => {
      const event = generateTestEvent();
      
      expect(event.uid).toBeDefined();
      expect(event.summary).toBeDefined();
      expect(event.start).toBeInstanceOf(Date);
      expect(event.end).toBeInstanceOf(Date);
      expect(event.end.getTime()).toBeGreaterThan(event.start.getTime());
    });

    it('should respect custom options', () => {
      const customEvent = generateTestEvent({
        uid: 'custom-uid-123',
        summary: 'Custom Meeting',
        location: 'Custom Location',
        start: new Date('2024-08-15T10:00:00Z'),
        duration: 90, // 90 minutes
      });

      expect(customEvent.uid).toBe('custom-uid-123');
      expect(customEvent.summary).toBe('Custom Meeting');
      expect(customEvent.location).toBe('Custom Location');
      expect(customEvent.start.toISOString()).toBe('2024-08-15T10:00:00.000Z');
      
      const durationMs = customEvent.end.getTime() - customEvent.start.getTime();
      const durationMinutes = durationMs / (1000 * 60);
      expect(durationMinutes).toBe(90);
    });
  });

  describe('generateTestEvents', () => {
    it('should generate multiple events', () => {
      const events = generateTestEvents({ count: 5 });
      
      expect(events).toHaveLength(5);
      
      // All events should have required fields
      events.forEach(event => {
        expect(event.uid).toBeDefined();
        expect(event.summary).toBeDefined();
        expect(event.start).toBeInstanceOf(Date);
        expect(event.end).toBeInstanceOf(Date);
      });
    });

    it('should generate events in chronological order', () => {
      const events = generateTestEvents({ count: 10 });
      
      for (let i = 1; i < events.length; i++) {
        expect(events[i].start.getTime()).toBeGreaterThanOrEqual(events[i-1].start.getTime());
      }
    });

    it('should include cancelled events when requested', () => {
      const events = generateTestEvents({ 
        count: 100, 
        includeCancelled: true 
      });
      
      const cancelledEvents = events.filter(e => e.status === 'cancelled');
      
      // Should have some cancelled events (around 10% based on logic)
      expect(cancelledEvents.length).toBeGreaterThan(0);
      expect(cancelledEvents.length).toBeLessThan(50); // Shouldn't be too many
    });
  });

  describe('generateWorkDayMeetings', () => {
    it('should generate realistic work day schedule', () => {
      const meetings = generateWorkDayMeetings();
      
      expect(meetings).toHaveLength(5);
      expect(meetings[0].summary).toBe('Daily Standup');
      expect(meetings[1].summary).toBe('Development Block');
      expect(meetings[2].summary).toBe('Sprint Planning');
      expect(meetings[3].summary).toBe('Client Check-in');
      expect(meetings[4].summary).toBe('Team Retrospective');
    });

    it('should schedule meetings in chronological order', () => {
      const meetings = generateWorkDayMeetings();
      
      for (let i = 1; i < meetings.length; i++) {
        expect(meetings[i].start.getTime()).toBeGreaterThan(meetings[i-1].start.getTime());
      }
    });

    it('should respect the provided date', () => {
      const testDate = new Date('2024-08-20T00:00:00Z');
      const meetings = generateWorkDayMeetings(testDate);
      
      meetings.forEach(meeting => {
        expect(meeting.start.getDate()).toBe(20);
        expect(meeting.start.getMonth()).toBe(7); // August (0-based)
        expect(meeting.start.getFullYear()).toBe(2024);
      });
    });
  });

  describe('generatePerformanceTestData', () => {
    it('should generate large datasets efficiently', () => {
      const startTime = performance.now();
      const events = generatePerformanceTestData(1000);
      const endTime = performance.now();
      
      expect(events).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500); // Should be fast
      
      // All events should have unique UIDs
      const uids = events.map(e => e.uid);
      const uniqueUids = new Set(uids);
      expect(uniqueUids.size).toBe(1000);
    });

    it('should generate events with predictable scheduling', () => {
      const events = generatePerformanceTestData(10);
      
      // Events should be spaced 30 minutes apart
      for (let i = 1; i < events.length; i++) {
        const timeDiff = events[i].start.getTime() - events[i-1].start.getTime();
        const minutesDiff = timeDiff / (1000 * 60);
        expect(minutesDiff).toBe(30);
      }
    });
  });

  describe('generateDuplicateScenarios', () => {
    it('should create scenarios for testing duplicates', () => {
      const { source, existing } = generateDuplicateScenarios();
      
      expect(source).toHaveLength(4);
      expect(Object.keys(existing)).toHaveLength(1);
      
      // First event should have a matching existing entry
      const firstEventKey = `${source[0].uid}:${source[0].start.toISOString()}`;
      expect(existing[firstEventKey]).toBeDefined();
    });
  });

  describe('generateTimezoneScenarios', () => {
    it('should create events in different timezones', () => {
      const events = generateTimezoneScenarios();
      
      expect(events).toHaveLength(5);
      
      const timezones = events.map(e => e.sourceTimezone);
      expect(timezones).toContain('UTC');
      expect(timezones).toContain('America/Los_Angeles');
      expect(timezones).toContain('America/New_York');
      expect(timezones).toContain('Europe/Berlin');
      expect(timezones).toContain('Asia/Tokyo');
    });

    it('should create events that represent the same moment in different timezones', () => {
      const events = generateTimezoneScenarios();
      
      // All events should represent the same UTC moment
      const utcTimes = events.map(e => e.start.getTime());
      const uniqueTimes = new Set(utcTimes);
      
      expect(uniqueTimes.size).toBe(1); // All same UTC time
    });
  });

  describe('Event Generation Quality', () => {
    it('should generate realistic event summaries', () => {
      const events = generateTestEvents({ count: 20 });
      const summaries = events.map(e => e.summary);
      
      // Should have variety in summaries
      const uniqueSummaries = new Set(summaries);
      expect(uniqueSummaries.size).toBeGreaterThan(10);
      
      // Summaries should contain common meeting terms
      const allSummariesText = summaries.join(' ').toLowerCase();
      expect(allSummariesText).toMatch(/(meeting|sync|review|call|session|standup|planning)/);
    });

    it('should generate realistic locations', () => {
      const events = generateTestEvents({ count: 20 });
      const locations = events.map(e => e.location).filter(Boolean);
      
      expect(locations.length).toBeGreaterThan(0);
      
      const allLocationsText = locations.join(' ').toLowerCase();
      expect(allLocationsText).toMatch(/(room|video|zoom|teams|office|remote)/);
    });

    it('should generate proper event durations', () => {
      const events = generateTestEvents({ count: 50 });
      
      events.forEach(event => {
        const durationMs = event.end.getTime() - event.start.getTime();
        const durationMinutes = durationMs / (1000 * 60);
        
        // Duration should be reasonable (15-120 minutes)
        expect(durationMinutes).toBeGreaterThanOrEqual(15);
        expect(durationMinutes).toBeLessThanOrEqual(120);
      });
    });
  });
});