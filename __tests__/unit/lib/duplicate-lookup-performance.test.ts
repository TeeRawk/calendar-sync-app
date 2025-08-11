/**
 * @jest-environment jsdom
 */

import { CalendarEvent } from '@/lib/ics-parser';
import { generatePerformanceTestData } from '../../test-utils/test-data-generators';
import { createMockExistingEvents, createLargeMockEventSet } from '../../test-utils/google-calendar-mocks';

describe('Duplicate Lookup Performance Tests', () => {
  describe('Key Generation Performance', () => {
    it('should generate keys for 1000 events under 50ms', () => {
      const events = generatePerformanceTestData(1000);
      
      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();
      
      expect(keys).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(50);
      
      // Verify all keys are unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1000);
    });

    it('should generate keys for 10000 events under 200ms', () => {
      const events = generatePerformanceTestData(10000);
      
      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();
      
      expect(keys).toHaveLength(10000);
      expect(endTime - startTime).toBeLessThan(200);
      
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(10000);
    });

    it('should handle concurrent key generation efficiently', async () => {
      // Generate 10 batches of 100 unique events each
      const eventBatches = Array.from({ length: 10 }, (_, batchIndex) => 
        Array.from({ length: 100 }, (_, eventIndex) => ({
          uid: `batch-${batchIndex}-event-${eventIndex}`,
          summary: `Event ${batchIndex}-${eventIndex}`,
          start: new Date(2024, 0, 1 + batchIndex, 10 + eventIndex % 24),
          end: new Date(2024, 0, 1 + batchIndex, 11 + eventIndex % 24),
          description: '',
          location: '',
          status: 'confirmed',
          recurrenceRule: '',
          sourceTimezone: 'UTC'
        } as CalendarEvent))
      );
      
      const startTime = performance.now();
      
      const keyBatchPromises = eventBatches.map(async (events) => {
        return events.map(event => `${event.uid}:${event.start.toISOString()}`);
      });
      
      const allKeyBatches = await Promise.all(keyBatchPromises);
      const allKeys = allKeyBatches.flat();
      
      const endTime = performance.now();
      
      expect(allKeys).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100);
      
      const uniqueKeys = new Set(allKeys);
      expect(uniqueKeys.size).toBe(1000);
    });
  });

  describe('Duplicate Lookup Performance', () => {
    it('should perform O(1) lookups in existing events hash map', () => {
      // Create large existing events set (10,000 events)
      const existingEventData = Array.from({ length: 10000 }, (_, i) => ({
        uid: `existing-event-${i.toString().padStart(5, '0')}`,
        startTime: new Date('2024-08-01T00:00:00Z'),
        googleEventId: `google-event-${i}`,
      }));
      
      // Adjust start times to be unique
      existingEventData.forEach((event, i) => {
        event.startTime = new Date(event.startTime.getTime() + i * 30 * 60 * 1000); // 30 min intervals
      });
      
      const existingEvents = createMockExistingEvents(existingEventData);
      
      // Test lookups for various scenarios
      const testCases = [
        { uid: 'existing-event-00000', startTime: existingEventData[0].startTime }, // First
        { uid: 'existing-event-05000', startTime: existingEventData[5000].startTime }, // Middle
        { uid: 'existing-event-09999', startTime: existingEventData[9999].startTime }, // Last
        { uid: 'non-existent-event', startTime: new Date('2024-12-31T23:59:59Z') }, // Not found
      ];
      
      const startTime = performance.now();
      
      const results = testCases.map(testCase => {
        const key = `${testCase.uid}:${testCase.startTime.toISOString()}`;
        return existingEvents[key];
      });
      
      const endTime = performance.now();
      
      // Should be extremely fast (< 1ms for hash lookups)
      expect(endTime - startTime).toBeLessThan(1);
      
      // Verify results
      expect(results[0]).toBe('google-event-0');
      expect(results[1]).toBe('google-event-5000');
      expect(results[2]).toBe('google-event-9999');
      expect(results[3]).toBeUndefined();
    });

    it('should efficiently batch process duplicate detection', () => {
      // Large existing events set
      const existingEventCount = 5000;
      const existingEventData = Array.from({ length: existingEventCount }, (_, i) => ({
        uid: `batch-event-${i}`,
        startTime: new Date('2024-08-01T00:00:00Z'),
        googleEventId: `google-batch-${i}`,
      }));
      
      existingEventData.forEach((event, i) => {
        event.startTime = new Date(event.startTime.getTime() + i * 15 * 60 * 1000); // 15 min intervals
      });
      
      const existingEvents = createMockExistingEvents(existingEventData);
      
      // New events to process (mix of existing and new)
      const newEvents = generatePerformanceTestData(1000);
      
      // Make 30% of new events duplicates
      for (let i = 0; i < 300; i++) {
        const existingIndex = Math.floor(Math.random() * existingEventCount);
        newEvents[i] = {
          ...newEvents[i],
          uid: existingEventData[existingIndex].uid,
          start: existingEventData[existingIndex].startTime,
        };
      }
      
      const startTime = performance.now();
      
      // Simulate batch duplicate detection
      const BATCH_SIZE = 50;
      const batches: CalendarEvent[][] = [];
      for (let i = 0; i < newEvents.length; i += BATCH_SIZE) {
        batches.push(newEvents.slice(i, i + BATCH_SIZE));
      }
      
      const batchResults = batches.map(batch => {
        return batch.map(event => {
          const key = `${event.uid}:${event.start.toISOString()}`;
          const existingId = existingEvents[key];
          return {
            event,
            action: existingId ? 'update' : 'create',
            existingId,
          };
        });
      });
      
      const allResults = batchResults.flat();
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should process 1000 events quickly
      expect(allResults).toHaveLength(1000);
      
      const updates = allResults.filter(r => r.action === 'update');
      const creates = allResults.filter(r => r.action === 'create');
      
      // Should have found approximately 30% duplicates
      expect(updates.length).toBeGreaterThan(250);
      expect(updates.length).toBeLessThan(350);
      expect(creates.length).toBe(1000 - updates.length);
    });

    it('should scale linearly with increasing event counts', () => {
      const testSizes = [100, 500, 1000, 2500];
      const results: Array<{ size: number; time: number; timePerEvent: number }> = [];
      
      testSizes.forEach(size => {
        const events = generatePerformanceTestData(size);
        
        const startTime = performance.now();
        const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
        const endTime = performance.now();
        
        const totalTime = endTime - startTime;
        const timePerEvent = totalTime / size;
        
        results.push({ size, time: totalTime, timePerEvent });
      });
      
      // Time per event should remain relatively constant (linear scaling)
      const avgTimePerEvent = results.reduce((sum, r) => sum + r.timePerEvent, 0) / results.length;
      
      results.forEach(result => {
        // Each event should take similar time (within reasonable bounds for performance variation)
        expect(result.timePerEvent).toBeLessThan(avgTimePerEvent * 2.0); // More lenient upper bound
        expect(result.timePerEvent).toBeGreaterThan(avgTimePerEvent * 0.25); // More lenient lower bound
      });
      
      // Largest test should still complete quickly
      const largestTest = results[results.length - 1];
      expect(largestTest.time).toBeLessThan(200); // 2500 events in < 200ms
    });
  });

  describe('Memory Efficiency', () => {
    it('should maintain reasonable memory usage for large event sets', () => {
      const initialMemory = (global as any).gc ? process.memoryUsage().heapUsed : 0;
      
      // Create large event set
      const events = generatePerformanceTestData(5000);
      const existingEvents: { [key: string]: string } = {};
      
      // Populate existing events
      for (let i = 0; i < 10000; i++) {
        const date = new Date('2024-08-01T00:00:00Z');
        date.setMinutes(date.getMinutes() + i * 15); // 15-minute intervals
        existingEvents[`existing-${i}:${date.toISOString()}`] = `google-${i}`;
      }
      
      // Perform duplicate detection
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const lookupResults = keys.map(key => existingEvents[key] || null);
      
      // Force garbage collection if available
      if ((global as any).gc) {
        (global as any).gc();
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        
        // Memory increase should be reasonable (less than 100MB for this test)
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      }
      
      // Verify results were processed
      expect(keys).toHaveLength(5000);
      expect(lookupResults).toHaveLength(5000);
    });

    it('should efficiently handle string concatenation for key generation', () => {
      const events = generatePerformanceTestData(1000);
      
      // Test different key generation approaches
      const approaches = [
        {
          name: 'template_literal',
          fn: (event: CalendarEvent) => `${event.uid}:${event.start.toISOString()}`,
        },
        {
          name: 'string_concat',
          fn: (event: CalendarEvent) => event.uid + ':' + event.start.toISOString(),
        },
        {
          name: 'array_join',
          fn: (event: CalendarEvent) => [event.uid, event.start.toISOString()].join(':'),
        },
      ];
      
      approaches.forEach(approach => {
        const startTime = performance.now();
        const keys = events.map(approach.fn);
        const endTime = performance.now();
        
        expect(keys).toHaveLength(1000);
        expect(endTime - startTime).toBeLessThan(100); // All approaches should be fast
        
        // Verify key format consistency
        keys.forEach(key => {
          expect(key).toMatch(/^.+:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
      });
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle events with very long UIDs efficiently', () => {
      const longUID = 'a'.repeat(1000) + '@very-long-domain-name.example.com';
      const events: CalendarEvent[] = Array.from({ length: 100 }, (_, i) => ({
        uid: `${longUID}-${i}`,
        summary: `Event with long UID ${i}`,
        start: new Date('2024-08-01T10:00:00Z'),
        end: new Date('2024-08-01T11:00:00Z'),
      }));
      
      events.forEach((event, i) => {
        event.start = new Date(event.start.getTime() + i * 60 * 60 * 1000); // Hourly
      });
      
      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();
      
      expect(keys).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(50);
      
      // Verify long UIDs work correctly
      keys.forEach(key => {
        expect(key.length).toBeGreaterThan(1050); // Long UID + timestamp
        expect(key).toContain(longUID);
      });
    });

    it('should handle events with special characters in UIDs', () => {
      const specialChars = ['@', '#', '$', '%', '&', '(', ')', '[', ']', '{', '}', '|', '\\'];
      const events: CalendarEvent[] = specialChars.map((char, i) => ({
        uid: `special${char}event${char}${i}@domain.com`,
        summary: `Event with ${char} character`,
        start: new Date(`2024-08-01T${String(i + 10).padStart(2, '0')}:00:00Z`),
        end: new Date(`2024-08-01T${String(i + 11).padStart(2, '0')}:00:00Z`),
      }));
      
      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();
      
      expect(keys).toHaveLength(specialChars.length);
      expect(endTime - startTime).toBeLessThan(10);
      
      // All keys should be unique despite special characters
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(specialChars.length);
    });

    it('should handle high-frequency events efficiently', () => {
      // Events every minute for 24 hours (1440 events)
      const baseTime = new Date('2024-08-01T00:00:00Z');
      const events: CalendarEvent[] = Array.from({ length: 1440 }, (_, i) => {
        const eventTime = new Date(baseTime.getTime() + i * 60 * 1000); // Every minute
        return {
          uid: `minute-event-${i.toString().padStart(4, '0')}`,
          summary: `Minute Event ${i}`,
          start: eventTime,
          end: new Date(eventTime.getTime() + 30 * 1000), // 30 seconds long
        };
      });
      
      const startTime = performance.now();
      const keys = events.map(event => `${event.uid}:${event.start.toISOString()}`);
      const endTime = performance.now();
      
      expect(keys).toHaveLength(1440);
      expect(endTime - startTime).toBeLessThan(100);
      
      // Verify chronological ordering
      const sortedKeys = [...keys].sort();
      expect(sortedKeys).toEqual(keys);
    });
  });
});