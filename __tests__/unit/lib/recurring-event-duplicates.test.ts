/**
 * @jest-environment jsdom
 */

import { CalendarEvent } from '@/lib/ics-parser';
import { generateRecurringEventInstances } from '../../test-utils/test-data-generators';
import { createMockExistingEvents } from '../../test-utils/google-calendar-mocks';

describe('Recurring Event Duplicate Detection', () => {
  describe('Unique Key Generation for Recurring Events', () => {
    it('should generate unique keys for each instance of a recurring event', () => {
      const baseEvent: CalendarEvent = {
        uid: 'recurring-meeting-123',
        summary: 'Weekly Team Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
        recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
      };

      const instances = generateRecurringEventInstances(baseEvent, 4);

      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      // All keys should be unique
      expect(uniqueKeys.size).toBe(4);
      expect(keys).toHaveLength(4);

      // Verify key format for each instance
      expect(keys[0]).toMatch(/^recurring-meeting-123-\d+:2024-08-15T10:00:00\.000Z$/);
      expect(keys[1]).toMatch(/^recurring-meeting-123-\d+:2024-08-22T10:00:00\.000Z$/);
      expect(keys[2]).toMatch(/^recurring-meeting-123-\d+:2024-08-29T10:00:00\.000Z$/);
      expect(keys[3]).toMatch(/^recurring-meeting-123-\d+:2024-09-05T10:00:00\.000Z$/);
    });

    it('should handle same base UID with different recurrence patterns', () => {
      const baseUID = 'flexible-meeting';
      
      // Daily recurring event
      const dailyEvent: CalendarEvent = {
        uid: baseUID,
        summary: 'Daily Standup',
        start: new Date('2024-08-15T09:00:00Z'),
        end: new Date('2024-08-15T09:30:00Z'),
      };

      // Weekly recurring event (same base UID)
      const weeklyEvent: CalendarEvent = {
        uid: baseUID,
        summary: 'Weekly Review', 
        start: new Date('2024-08-15T14:00:00Z'),
        end: new Date('2024-08-15T15:00:00Z'),
      };

      const dailyInstances = generateRecurringEventInstances(dailyEvent, 3);
      const weeklyInstances = generateRecurringEventInstances(weeklyEvent, 3);

      const allInstances = [...dailyInstances, ...weeklyInstances];
      const keys = allInstances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      // Should have 6 unique keys despite same base UID
      expect(uniqueKeys.size).toBe(6);
      expect(keys).toHaveLength(6);
    });
  });

  describe('Partial Recurring Series Duplicates', () => {
    it('should identify existing instances and create missing ones', () => {
      const baseEvent: CalendarEvent = {
        uid: 'recurring-series-123',
        summary: 'Recurring Project Meeting',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const allInstances = generateRecurringEventInstances(baseEvent, 4);
      
      // Mock existing events: only 1st and 3rd instances exist
      const existingEvents = createMockExistingEvents([
        {
          uid: allInstances[0].uid,
          startTime: allInstances[0].start,
          googleEventId: 'google-recurring-1',
        },
        {
          uid: allInstances[2].uid,
          startTime: allInstances[2].start,
          googleEventId: 'google-recurring-3',
        },
      ]);

      // Check which instances would be updates vs creates
      const syncResults = allInstances.map(instance => {
        const key = `${instance.uid}:${instance.start.toISOString()}`;
        const existingId = existingEvents[key];
        return {
          instance,
          key,
          action: existingId ? 'update' : 'create',
          existingId,
        };
      });

      const updates = syncResults.filter(r => r.action === 'update');
      const creates = syncResults.filter(r => r.action === 'create');

      expect(updates).toHaveLength(2); // 1st and 3rd instances
      expect(creates).toHaveLength(2); // 2nd and 4th instances

      // Verify specific instances
      expect(updates[0].existingId).toBe('google-recurring-1');
      expect(updates[1].existingId).toBe('google-recurring-3');
      expect(creates[0].existingId).toBeUndefined();
      expect(creates[1].existingId).toBeUndefined();
    });

    it('should handle all instances as new when none exist', () => {
      const baseEvent: CalendarEvent = {
        uid: 'new-recurring-series',
        summary: 'New Recurring Meeting',
        start: new Date('2024-09-01T14:00:00Z'),
        end: new Date('2024-09-01T15:00:00Z'),
      };

      const instances = generateRecurringEventInstances(baseEvent, 5);
      const existingEvents = {}; // No existing events

      const syncResults = instances.map(instance => {
        const key = `${instance.uid}:${instance.start.toISOString()}`;
        const existingId = existingEvents[key];
        return {
          action: existingId ? 'update' : 'create',
        };
      });

      const creates = syncResults.filter(r => r.action === 'create');
      const updates = syncResults.filter(r => r.action === 'update');

      expect(creates).toHaveLength(5);
      expect(updates).toHaveLength(0);
    });

    it('should handle all instances as updates when all exist', () => {
      const baseEvent: CalendarEvent = {
        uid: 'existing-recurring-series',
        summary: 'Existing Recurring Meeting',
        start: new Date('2024-08-20T16:00:00Z'),
        end: new Date('2024-08-20T17:00:00Z'),
      };

      const instances = generateRecurringEventInstances(baseEvent, 3);
      
      // All instances exist
      const existingEvents = createMockExistingEvents([
        {
          uid: instances[0].uid,
          startTime: instances[0].start,
          googleEventId: 'google-existing-1',
        },
        {
          uid: instances[1].uid,
          startTime: instances[1].start,
          googleEventId: 'google-existing-2',
        },
        {
          uid: instances[2].uid,
          startTime: instances[2].start,
          googleEventId: 'google-existing-3',
        },
      ]);

      const syncResults = instances.map(instance => {
        const key = `${instance.uid}:${instance.start.toISOString()}`;
        const existingId = existingEvents[key];
        return {
          action: existingId ? 'update' : 'create',
        };
      });

      const creates = syncResults.filter(r => r.action === 'create');
      const updates = syncResults.filter(r => r.action === 'update');

      expect(creates).toHaveLength(0);
      expect(updates).toHaveLength(3);
    });
  });

  describe('Modified Recurring Instances', () => {
    it('should handle modified single instances within a series', () => {
      const baseEvent: CalendarEvent = {
        uid: 'recurring-with-modifications',
        summary: 'Weekly Team Sync',
        start: new Date('2024-08-15T10:00:00Z'),
        end: new Date('2024-08-15T11:00:00Z'),
      };

      const instances = generateRecurringEventInstances(baseEvent, 4);
      
      // Modify the 2nd instance (different time and title)
      instances[1] = {
        ...instances[1],
        summary: 'Weekly Team Sync - Special Topic',
        start: new Date('2024-08-22T11:00:00Z'), // 1 hour later
        end: new Date('2024-08-22T12:30:00Z'), // 1.5 hours long
      };

      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      // Should still have unique keys
      expect(uniqueKeys.size).toBe(4);

      // Modified instance should have different start time in key
      expect(keys[1]).toContain('2024-08-22T11:00:00.000Z');
      expect(keys[0]).toContain('2024-08-15T10:00:00.000Z');
      expect(keys[2]).toContain('2024-08-29T10:00:00.000Z');
    });

    it('should handle cancelled instances within a series', () => {
      const baseEvent: CalendarEvent = {
        uid: 'recurring-with-cancellation',
        summary: 'Monthly Review',
        start: new Date('2024-08-01T15:00:00Z'),
        end: new Date('2024-08-01T16:00:00Z'),
      };

      const instances = generateRecurringEventInstances(baseEvent, 3);
      
      // Cancel the middle instance
      instances[1] = {
        ...instances[1],
        status: 'cancelled',
      };

      // All instances should still generate unique keys
      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(3);
      
      // Cancelled instance should still have a key for duplicate detection
      expect(keys[1]).toBeDefined();
      expect(instances[1].status).toBe('cancelled');
    });
  });

  describe('Complex Recurring Patterns', () => {
    it('should handle bi-weekly recurring events', () => {
      const baseEvent: CalendarEvent = {
        uid: 'bi-weekly-meeting',
        summary: 'Bi-weekly Planning',
        start: new Date('2024-08-01T13:00:00Z'),
        end: new Date('2024-08-01T14:00:00Z'),
      };

      // Generate bi-weekly instances (2-week intervals)
      const instances: CalendarEvent[] = [];
      for (let i = 0; i < 4; i++) {
        const instanceStart = new Date(baseEvent.start.getTime() + i * 14 * 24 * 60 * 60 * 1000); // 2 weeks
        const instanceEnd = new Date(baseEvent.end.getTime() + i * 14 * 24 * 60 * 60 * 1000);
        
        instances.push({
          ...baseEvent,
          uid: `${baseEvent.uid}-${instanceStart.getTime()}`,
          start: instanceStart,
          end: instanceEnd,
          recurrenceRule: undefined,
        });
      }

      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(4);
      
      // Verify bi-weekly pattern
      const startTimes = instances.map(e => e.start.getTime());
      for (let i = 1; i < startTimes.length; i++) {
        const diffDays = (startTimes[i] - startTimes[i-1]) / (24 * 60 * 60 * 1000);
        expect(diffDays).toBe(14); // 2 weeks apart
      }
    });

    it('should handle monthly recurring events', () => {
      const baseEvent: CalendarEvent = {
        uid: 'monthly-board-meeting',
        summary: 'Monthly Board Meeting',
        start: new Date('2024-08-01T10:00:00Z'),
        end: new Date('2024-08-01T12:00:00Z'),
      };

      // Generate monthly instances
      const instances: CalendarEvent[] = [];
      for (let i = 0; i < 6; i++) { // 6 months
        const instanceDate = new Date(2024, 7 + i, 1, 10, 0, 0); // Aug, Sep, Oct, Nov, Dec, Jan
        const instanceEnd = new Date(instanceDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours
        
        instances.push({
          ...baseEvent,
          uid: `${baseEvent.uid}-${instanceDate.getTime()}`,
          start: instanceDate,
          end: instanceEnd,
          recurrenceRule: undefined,
        });
      }

      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(6);
    });

    it('should handle workday-only recurring events', () => {
      const baseEvent: CalendarEvent = {
        uid: 'weekday-standup',
        summary: 'Daily Standup',
        start: new Date('2024-08-05T09:00:00Z'), // Monday
        end: new Date('2024-08-05T09:15:00Z'),
      };

      // Generate weekday instances (Mon-Fri only) for 2 weeks
      const instances: CalendarEvent[] = [];
      const startDate = new Date(baseEvent.start);
      
      for (let week = 0; week < 2; week++) {
        for (let day = 0; day < 5; day++) { // Mon-Fri
          const instanceStart = new Date(startDate.getTime() + (week * 7 + day) * 24 * 60 * 60 * 1000);
          const instanceEnd = new Date(instanceStart.getTime() + 15 * 60 * 1000); // 15 minutes
          
          instances.push({
            ...baseEvent,
            uid: `${baseEvent.uid}-${instanceStart.getTime()}`,
            start: instanceStart,
            end: instanceEnd,
            recurrenceRule: undefined,
          });
        }
      }

      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(10); // 5 days × 2 weeks
      
      // Verify no weekend days
      instances.forEach(instance => {
        const dayOfWeek = instance.start.getDay();
        expect(dayOfWeek).toBeGreaterThanOrEqual(1); // Monday or later
        expect(dayOfWeek).toBeLessThanOrEqual(5); // Friday or earlier
      });
    });
  });

  describe('Performance with Large Recurring Series', () => {
    it('should efficiently handle large recurring series', () => {
      const baseEvent: CalendarEvent = {
        uid: 'large-recurring-series',
        summary: 'Daily Meeting',
        start: new Date('2024-01-01T10:00:00Z'),
        end: new Date('2024-01-01T10:30:00Z'),
      };

      // Generate 365 daily instances (full year)
      const instances = generateRecurringEventInstances(baseEvent, 365);

      const startTime = performance.now();
      const keys = instances.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();

      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(365);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly

      // Verify chronological order
      const sortedKeys = [...keys].sort();
      expect(sortedKeys).toEqual(keys); // Should already be sorted
    });

    it('should efficiently match against large existing event sets', () => {
      const instances = generateRecurringEventInstances({
        uid: 'performance-recurring',
        summary: 'Performance Test Meeting',
        start: new Date('2024-08-01T10:00:00Z'),
        end: new Date('2024-08-01T11:00:00Z'),
      }, 100);

      // Create large existing events set (50% of instances exist)
      const existingEvents: { [key: string]: string } = {};
      for (let i = 0; i < instances.length; i += 2) { // Every other instance exists
        const key = `${instances[i].uid}:${instances[i].start.toISOString()}`;
        existingEvents[key] = `google-perf-${i}`;
      }

      const startTime = performance.now();
      
      const syncPlan = instances.map(instance => {
        const key = `${instance.uid}:${instance.start.toISOString()}`;
        return {
          action: existingEvents[key] ? 'update' : 'create',
          existingId: existingEvents[key],
        };
      });
      
      const endTime = performance.now();

      const updates = syncPlan.filter(p => p.action === 'update');
      const creates = syncPlan.filter(p => p.action === 'create');

      expect(updates).toHaveLength(50); // 50% exist
      expect(creates).toHaveLength(50); // 50% new
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });
  });
});