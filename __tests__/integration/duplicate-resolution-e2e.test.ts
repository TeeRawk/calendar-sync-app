import { syncCalendar, SyncResult } from '@/lib/sync-service';
import { createDuplicateResolver } from '@/lib/duplicate-resolution';
import { CalendarEvent } from '@/lib/ics-parser';
import { createMockCalendarSync } from '../test-utils';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/lib/ics-parser');
jest.mock('@/lib/google-calendar');
jest.mock('@/lib/duplicate-resolution');

describe('End-to-End Duplicate Resolution', () => {
  const mockCalendarSyncId = 'test-sync-id';
  const mockGoogleCalendarId = 'test-google-calendar-id';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
    };
    
    require('@/lib/db').db = mockDb;
    
    // Mock calendar sync config
    mockDb.limit.mockResolvedValue([createMockCalendarSync({
      id: mockCalendarSyncId,
      googleCalendarId: mockGoogleCalendarId,
    })]);
    
    // Mock sync logs insertion
    mockDb.values.mockResolvedValue([]);
  });

  describe('Duplicate Resolution in Real Sync Scenarios', () => {
    it('should handle scenario with mix of new, duplicate, and updated events', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          uid: 'new-event-1',
          summary: 'New Team Meeting',
          description: 'Brand new meeting',
          start: new Date('2023-07-20T10:00:00Z'),
          end: new Date('2023-07-20T11:00:00Z'),
        },
        {
          uid: 'duplicate-event-1',
          summary: 'Existing Team Meeting',
          description: 'This event already exists',
          start: new Date('2023-07-21T14:00:00Z'),
          end: new Date('2023-07-21T15:00:00Z'),
        },
        {
          uid: 'updated-event-1',
          summary: 'Updated Team Meeting',
          description: 'This event has been updated',
          start: new Date('2023-07-22T16:00:00Z'),
          end: new Date('2023-07-22T17:00:00Z'),
        },
      ];

      // Mock ICS parser
      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(mockEvents);

      // Mock duplicate resolver
      const mockResolver = {
        findDuplicateMeeting: jest.fn()
      };
      
      // Configure different responses for each event
      mockResolver.findDuplicateMeeting
        .mockResolvedValueOnce({ // new event
          isDuplicate: false,
          action: 'create',
          reason: 'No existing events found',
          confidence: 1.0,
        })
        .mockResolvedValueOnce({ // duplicate event
          isDuplicate: true,
          action: 'skip',
          reason: 'High confidence duplicate found',
          confidence: 0.95,
          existingEventId: 'existing-duplicate-id',
        })
        .mockResolvedValueOnce({ // updated event
          isDuplicate: true,
          action: 'update',
          reason: 'UID match with content changes',
          confidence: 0.9,
          existingEventId: 'existing-update-id',
        });

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);

      // Mock Google Calendar operations
      const mockCreateEvent = require('@/lib/google-calendar').createGoogleCalendarEvent;
      const mockUpdateEvent = require('@/lib/google-calendar').updateGoogleCalendarEvent;
      
      mockCreateEvent.mockResolvedValue('new-event-google-id');
      mockUpdateEvent.mockResolvedValue(undefined);

      // Execute sync
      const result: SyncResult = await syncCalendar(mockCalendarSyncId, 'Europe/Madrid');

      // Verify results
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(3);
      expect(result.eventsCreated).toBe(1);
      expect(result.eventsUpdated).toBe(1);
      expect(result.eventsSkipped).toBe(1);
      expect(result.duplicatesResolved).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify duplicate resolver was called for each event
      expect(mockResolver.findDuplicateMeeting).toHaveBeenCalledTimes(3);
      
      // Verify Google Calendar operations
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle error recovery in duplicate resolution', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          uid: 'problematic-event',
          summary: 'Event that causes error',
          start: new Date('2023-07-20T10:00:00Z'),
          end: new Date('2023-07-20T11:00:00Z'),
        },
        {
          uid: 'normal-event',
          summary: 'Normal event',
          start: new Date('2023-07-20T14:00:00Z'),
          end: new Date('2023-07-20T15:00:00Z'),
        },
      ];

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(mockEvents);

      // Mock duplicate resolver with one error
      const mockResolver = {
        findDuplicateMeeting: jest.fn()
      };
      
      mockResolver.findDuplicateMeeting
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValueOnce({
          isDuplicate: false,
          action: 'create',
          reason: 'Error in duplicate detection: API rate limit exceeded',
          confidence: 0,
        });

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);

      // Mock Google Calendar operations
      require('@/lib/google-calendar').createGoogleCalendarEvent.mockResolvedValue('created-id');

      // Execute sync
      const result = await syncCalendar(mockCalendarSyncId);

      // Should still process both events despite the error
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(2); // Both get created due to error fallback
      expect(result.errors).toHaveLength(0); // Errors handled gracefully
    });

    it('should respect performance limits with large event sets', async () => {
      // Generate 100 mock events
      const mockEvents: CalendarEvent[] = Array.from({ length: 100 }, (_, i) => ({
        uid: `bulk-event-${i}`,
        summary: `Bulk Event ${i}`,
        start: new Date(`2023-07-${Math.floor(i / 10) + 1}T${10 + (i % 10)}:00:00Z`),
        end: new Date(`2023-07-${Math.floor(i / 10) + 1}T${11 + (i % 10)}:00:00Z`),
      }));

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(mockEvents);

      // Mock duplicate resolver to return quickly
      const mockResolver = {
        findDuplicateMeeting: jest.fn().mockResolvedValue({
          isDuplicate: false,
          action: 'create',
          reason: 'No duplicates in bulk test',
          confidence: 1.0,
        })
      };
      
      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);
      
      // Mock fast Google Calendar operations
      require('@/lib/google-calendar').createGoogleCalendarEvent.mockImplementation(
        async () => `created-${Date.now()}-${Math.random()}`
      );

      const startTime = Date.now();
      const result = await syncCalendar(mockCalendarSyncId);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (under 30 seconds for 100 events)
      expect(duration).toBeLessThan(30000);
      expect(result.eventsProcessed).toBe(100);
      expect(result.eventsCreated).toBe(100);
      expect(result.success).toBe(true);

      // Should process in batches (verify batch processing worked)
      expect(require('@/lib/google-calendar').createGoogleCalendarEvent).toHaveBeenCalledTimes(100);
    });

    it('should handle recurring events with proper UID matching', async () => {
      const recurringEvents: CalendarEvent[] = [
        {
          uid: 'recurring-meeting-base',
          summary: 'Weekly Team Standup',
          start: new Date('2023-07-17T09:00:00Z'),
          end: new Date('2023-07-17T09:30:00Z'),
        },
        {
          uid: 'recurring-meeting-base-1689577200000', // Same base UID with timestamp
          summary: 'Weekly Team Standup',
          start: new Date('2023-07-24T09:00:00Z'),
          end: new Date('2023-07-24T09:30:00Z'),
        },
        {
          uid: 'recurring-meeting-base-1690182000000', // Same base UID, different timestamp
          summary: 'Weekly Team Standup',
          start: new Date('2023-07-31T09:00:00Z'),
          end: new Date('2023-07-31T09:30:00Z'),
        },
      ];

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(recurringEvents);

      const mockResolver = {
        findDuplicateMeeting: jest.fn()
      };

      // First occurrence is new, others are duplicates
      mockResolver.findDuplicateMeeting
        .mockResolvedValueOnce({
          isDuplicate: false,
          action: 'create',
          reason: 'First occurrence of recurring event',
          confidence: 1.0,
        })
        .mockResolvedValueOnce({
          isDuplicate: true,
          action: 'update',
          reason: 'Base UID match: recurring-meeting-base',
          confidence: 0.85,
          existingEventId: 'existing-occurrence-1',
        })
        .mockResolvedValueOnce({
          isDuplicate: true,
          action: 'update',
          reason: 'Base UID match: recurring-meeting-base',
          confidence: 0.85,
          existingEventId: 'existing-occurrence-2',
        });

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);

      require('@/lib/google-calendar').createGoogleCalendarEvent.mockResolvedValue('new-occurrence-id');
      require('@/lib/google-calendar').updateGoogleCalendarEvent.mockResolvedValue(undefined);

      const result = await syncCalendar(mockCalendarSyncId);

      expect(result.eventsProcessed).toBe(3);
      expect(result.eventsCreated).toBe(1);
      expect(result.eventsUpdated).toBe(2);
      expect(result.duplicatesResolved).toBe(2);
      expect(result.success).toBe(true);
    });

    it('should preserve Google Calendar metadata during updates', async () => {
      const updateEvent: CalendarEvent = {
        uid: 'update-test-event',
        summary: 'Updated Meeting Title',
        description: 'Updated description',
        location: 'New Location',
        start: new Date('2023-07-20T14:00:00Z'),
        end: new Date('2023-07-20T15:00:00Z'),
      };

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue([updateEvent]);

      const mockResolver = {
        findDuplicateMeeting: jest.fn().mockResolvedValue({
          isDuplicate: true,
          action: 'update',
          reason: 'UID match for existing event',
          confidence: 0.9,
          existingEventId: 'existing-google-event-id',
        })
      };

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);

      const mockUpdateEvent = require('@/lib/google-calendar').updateGoogleCalendarEvent;
      mockUpdateEvent.mockResolvedValue(undefined);

      await syncCalendar(mockCalendarSyncId, 'Europe/Madrid');

      // Verify update was called with the correct parameters
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        mockGoogleCalendarId,
        'existing-google-event-id',
        expect.objectContaining({
          uid: 'update-test-event',
          summary: 'Updated Meeting Title',
          description: 'Updated description\n\nOriginal UID: update-test-event',
          location: 'New Location',
        }),
        'Europe/Madrid'
      );
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle Google Calendar API rate limits gracefully', async () => {
      const mockEvents = Array.from({ length: 10 }, (_, i) => ({
        uid: `rate-limit-test-${i}`,
        summary: `Test Event ${i}`,
        start: new Date(`2023-07-20T${10 + i}:00:00Z`),
        end: new Date(`2023-07-20T${11 + i}:00:00Z`),
      }));

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(mockEvents);

      const mockResolver = {
        findDuplicateMeeting: jest.fn()
      };

      // Simulate some API rate limit errors in duplicate detection
      for (let i = 0; i < 10; i++) {
        if (i % 3 === 0) {
          mockResolver.findDuplicateMeeting.mockResolvedValueOnce({
            isDuplicate: false,
            action: 'create',
            reason: 'Error in duplicate detection: Rate limit exceeded',
            confidence: 0,
          });
        } else {
          mockResolver.findDuplicateMeeting.mockResolvedValueOnce({
            isDuplicate: false,
            action: 'create',
            reason: 'No duplicates found',
            confidence: 1.0,
          });
        }
      }

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);
      require('@/lib/google-calendar').createGoogleCalendarEvent.mockResolvedValue('created-id');

      const result = await syncCalendar(mockCalendarSyncId);

      // Should still complete successfully despite rate limit errors
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(10);
      expect(result.eventsCreated).toBe(10);
    });

    it('should maintain data consistency during concurrent operations', async () => {
      // This test ensures that the batch processing doesn't cause race conditions
      const concurrentEvents = Array.from({ length: 20 }, (_, i) => ({
        uid: `concurrent-test-${i}`,
        summary: `Concurrent Event ${i}`,
        start: new Date(`2023-07-20T${Math.floor(i / 2) + 8}:${(i % 2) * 30}:00Z`),
        end: new Date(`2023-07-20T${Math.floor(i / 2) + 8}:${(i % 2) * 30 + 30}:00Z`),
      }));

      require('@/lib/ics-parser').parseICSFromUrlWithExpansion.mockResolvedValue(concurrentEvents);

      let duplicateCallCount = 0;
      let createCallCount = 0;

      const mockResolver = {
        findDuplicateMeeting: jest.fn().mockImplementation(async () => {
          duplicateCallCount++;
          // Add small random delay to simulate real API calls
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return {
            isDuplicate: false,
            action: 'create',
            reason: `Processed call ${duplicateCallCount}`,
            confidence: 1.0,
          };
        })
      };

      require('@/lib/duplicate-resolution').createDuplicateResolver.mockReturnValue(mockResolver);
      
      require('@/lib/google-calendar').createGoogleCalendarEvent.mockImplementation(async () => {
        createCallCount++;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return `created-id-${createCallCount}`;
      });

      const result = await syncCalendar(mockCalendarSyncId);

      // Verify all operations completed correctly
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(20);
      expect(result.eventsCreated).toBe(20);
      expect(duplicateCallCount).toBe(20);
      expect(createCallCount).toBe(20);

      // Verify no data corruption occurred
      expect(result.eventsUpdated + result.eventsCreated + result.eventsSkipped).toBe(result.eventsProcessed);
    });
  });
});