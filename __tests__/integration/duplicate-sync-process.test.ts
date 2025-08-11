/**
 * @jest-environment jsdom
 */

import { syncCalendar, SyncResult } from '@/lib/sync-service';
import { CalendarEvent } from '@/lib/ics-parser';
import { 
  getExistingGoogleEvents, 
  createGoogleCalendarEvent, 
  updateGoogleCalendarEvent 
} from '@/lib/google-calendar';
import { parseICSFromUrlWithExpansion } from '@/lib/ics-parser';
import { db } from '@/lib/db';
import { calendarSyncs, syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock all dependencies
jest.mock('@/lib/google-calendar');
jest.mock('@/lib/ics-parser');
jest.mock('@/lib/db');

const mockGetExistingGoogleEvents = getExistingGoogleEvents as jest.MockedFunction<typeof getExistingGoogleEvents>;
const mockCreateGoogleCalendarEvent = createGoogleCalendarEvent as jest.MockedFunction<typeof createGoogleCalendarEvent>;
const mockUpdateGoogleCalendarEvent = updateGoogleCalendarEvent as jest.MockedFunction<typeof updateGoogleCalendarEvent>;
const mockParseICSFromUrlWithExpansion = parseICSFromUrlWithExpansion as jest.MockedFunction<typeof parseICSFromUrlWithExpansion>;
const mockDb = db as jest.Mocked<typeof db>;

describe('Integration: Sync Process with Duplicates', () => {
  const mockCalendarSyncId = 'test-sync-id';
  const mockCalendarConfig = {
    id: mockCalendarSyncId,
    userId: 'user123',
    name: 'Test Calendar Sync',
    icsUrl: 'https://example.com/calendar.ics',
    googleCalendarId: 'test@gmail.com',
    isActive: true,
    lastSync: null,
    syncErrors: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database queries
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockCalendarConfig])
        }),
        orderBy: jest.fn().mockResolvedValue([mockCalendarConfig])
      })
    });
    
    mockDb.update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      })
    });
    
    mockDb.insert = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined)
    });
  });

  describe('Duplicate Event Scenarios', () => {
    it('should update existing events when duplicates are found', async () => {
      // Setup: Create source events from ICS
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'meeting-123',
          summary: 'Team Meeting',
          description: 'Updated description',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
          location: 'Conference Room A',
        },
        {
          uid: 'standup-456',
          summary: 'Daily Standup',
          description: 'Team standup',
          start: new Date('2024-08-16T09:00:00Z'),
          end: new Date('2024-08-16T09:30:00Z'),
        }
      ];

      // Setup: Mock existing events in Google Calendar
      const existingEvents = {
        'meeting-123:2024-08-15T10:00:00.000Z': 'google-event-id-1',
        'standup-456:2024-08-16T09:00:00.000Z': 'google-event-id-2',
      };

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockUpdateGoogleCalendarEvent.mockResolvedValue(undefined);

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(0);
      expect(result.eventsUpdated).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify update calls
      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledTimes(2);
      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledWith(
        'test@gmail.com',
        'google-event-id-1',
        expect.objectContaining({
          uid: 'meeting-123',
          summary: 'Team Meeting',
          description: expect.stringContaining('Original UID: meeting-123'),
        }),
        undefined
      );
    });

    it('should create new events when no duplicates are found', async () => {
      // Setup: Create source events from ICS
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'new-meeting-789',
          summary: 'New Project Meeting',
          start: new Date('2024-08-17T14:00:00Z'),
          end: new Date('2024-08-17T15:00:00Z'),
        },
        {
          uid: 'workshop-101',
          summary: 'Training Workshop',
          start: new Date('2024-08-18T10:00:00Z'),
          end: new Date('2024-08-18T12:00:00Z'),
        }
      ];

      // Setup: Mock no existing events
      const existingEvents = {};

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockCreateGoogleCalendarEvent.mockResolvedValueOnce('new-google-event-1');
      mockCreateGoogleCalendarEvent.mockResolvedValueOnce('new-google-event-2');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(2);
      expect(result.eventsUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify create calls
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledTimes(2);
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledWith(
        'test@gmail.com',
        expect.objectContaining({
          uid: 'new-meeting-789',
          summary: 'New Project Meeting',
          description: expect.stringContaining('Original UID: new-meeting-789'),
        }),
        undefined
      );
    });

    it('should handle mixed scenario with both updates and creates', async () => {
      // Setup: Mixed scenario
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'existing-meeting',
          summary: 'Existing Meeting Updated',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        },
        {
          uid: 'new-meeting',
          summary: 'Brand New Meeting',
          start: new Date('2024-08-16T14:00:00Z'),
          end: new Date('2024-08-16T15:00:00Z'),
        }
      ];

      const existingEvents = {
        'existing-meeting:2024-08-15T10:00:00.000Z': 'existing-google-id',
      };

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockUpdateGoogleCalendarEvent.mockResolvedValue(undefined);
      mockCreateGoogleCalendarEvent.mockResolvedValue('new-google-id');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(1);
      expect(result.eventsUpdated).toBe(1);
      expect(result.errors).toHaveLength(0);

      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Recurring Event Duplicates', () => {
    it('should handle recurring event instances with unique keys', async () => {
      // Setup: Recurring event with multiple instances
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'recurring-meeting-123',
          summary: 'Weekly Team Meeting',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        },
        {
          uid: 'recurring-meeting-123', // Same UID
          summary: 'Weekly Team Meeting',
          start: new Date('2024-08-22T10:00:00Z'), // Different start time
          end: new Date('2024-08-22T11:00:00Z'),
        },
        {
          uid: 'recurring-meeting-123', // Same UID
          summary: 'Weekly Team Meeting',
          start: new Date('2024-08-29T10:00:00Z'), // Different start time
          end: new Date('2024-08-29T11:00:00Z'),
        }
      ];

      // Setup: Only the first instance exists
      const existingEvents = {
        'recurring-meeting-123:2024-08-15T10:00:00.000Z': 'existing-recurring-1',
      };

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockUpdateGoogleCalendarEvent.mockResolvedValue(undefined);
      mockCreateGoogleCalendarEvent
        .mockResolvedValueOnce('new-recurring-2')
        .mockResolvedValueOnce('new-recurring-3');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(3);
      expect(result.eventsCreated).toBe(2); // 2nd and 3rd instances
      expect(result.eventsUpdated).toBe(1); // 1st instance
      expect(result.errors).toHaveLength(0);

      // Verify the update call for existing instance
      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledTimes(1);
      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledWith(
        'test@gmail.com',
        'existing-recurring-1',
        expect.objectContaining({
          uid: 'recurring-meeting-123',
          start: new Date('2024-08-15T10:00:00Z'),
        }),
        undefined
      );

      // Verify the create calls for new instances
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledTimes(2);
    });

    it('should handle all recurring instances as new events', async () => {
      // Setup: All instances are new
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'new-recurring-456',
          summary: 'New Weekly Meeting',
          start: new Date('2024-08-15T14:00:00Z'),
          end: new Date('2024-08-15T15:00:00Z'),
        },
        {
          uid: 'new-recurring-456',
          summary: 'New Weekly Meeting',
          start: new Date('2024-08-22T14:00:00Z'),
          end: new Date('2024-08-22T15:00:00Z'),
        }
      ];

      // Setup: No existing events
      const existingEvents = {};

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockCreateGoogleCalendarEvent
        .mockResolvedValueOnce('new-event-1')
        .mockResolvedValueOnce('new-event-2');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(2);
      expect(result.eventsUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling in Sync Process', () => {
    it('should handle errors during event update and continue processing', async () => {
      // Setup
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'failing-event',
          summary: 'Event That Will Fail',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        },
        {
          uid: 'success-event',
          summary: 'Event That Will Succeed',
          start: new Date('2024-08-16T10:00:00Z'),
          end: new Date('2024-08-16T11:00:00Z'),
        }
      ];

      const existingEvents = {
        'failing-event:2024-08-15T10:00:00.000Z': 'google-event-fail',
        'success-event:2024-08-16T10:00:00.000Z': 'google-event-success',
      };

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockUpdateGoogleCalendarEvent
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValueOnce(undefined);

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(false);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(0);
      expect(result.eventsUpdated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to sync event "Event That Will Fail"');
    });

    it('should handle errors during event creation', async () => {
      // Setup
      const sourceEvents: CalendarEvent[] = [
        {
          uid: 'new-failing-event',
          summary: 'New Event That Will Fail',
          start: new Date('2024-08-15T10:00:00Z'),
          end: new Date('2024-08-15T11:00:00Z'),
        },
        {
          uid: 'new-success-event',
          summary: 'New Event That Will Succeed',
          start: new Date('2024-08-16T10:00:00Z'),
          end: new Date('2024-08-16T11:00:00Z'),
        }
      ];

      const existingEvents = {}; // No existing events

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockCreateGoogleCalendarEvent
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce('new-event-success');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(false);
      expect(result.eventsProcessed).toBe(2);
      expect(result.eventsCreated).toBe(1);
      expect(result.eventsUpdated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to sync event "New Event That Will Fail"');
    });
  });

  describe('Batch Processing with Duplicates', () => {
    it('should process events in batches while handling duplicates correctly', async () => {
      // Setup: 7 events (will be processed in batches of 5)
      const sourceEvents: CalendarEvent[] = [];
      const existingEvents: { [key: string]: string } = {};

      for (let i = 1; i <= 7; i++) {
        const event: CalendarEvent = {
          uid: `batch-event-${i}`,
          summary: `Batch Event ${i}`,
          start: new Date(`2024-08-${15 + i}T10:00:00Z`),
          end: new Date(`2024-08-${15 + i}T11:00:00Z`),
        };
        sourceEvents.push(event);

        // Make events 1, 3, 5 existing (updates), others new (creates)
        if (i % 2 === 1) {
          const key = `${event.uid}:${event.start.toISOString()}`;
          existingEvents[key] = `google-event-${i}`;
        }
      }

      // Setup mocks
      mockParseICSFromUrlWithExpansion.mockResolvedValue(sourceEvents);
      mockGetExistingGoogleEvents.mockResolvedValue(existingEvents);
      mockUpdateGoogleCalendarEvent.mockResolvedValue(undefined);
      mockCreateGoogleCalendarEvent.mockResolvedValue('new-event-id');

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(7);
      expect(result.eventsCreated).toBe(3); // Events 2, 4, 6, 7 (4 new events)
      expect(result.eventsUpdated).toBe(4); // Events 1, 3, 5, 7 (4 updates)
      expect(result.errors).toHaveLength(0);

      // The exact number of calls depends on the batch processing logic
      expect(mockUpdateGoogleCalendarEvent).toHaveBeenCalledTimes(4);
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('Empty Event Scenarios', () => {
    it('should handle empty ICS feed gracefully', async () => {
      // Setup: No events from ICS
      mockParseICSFromUrlWithExpansion.mockResolvedValue([]);
      mockGetExistingGoogleEvents.mockResolvedValue({});

      // Execute
      const result = await syncCalendar(mockCalendarSyncId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(0);
      expect(result.eventsCreated).toBe(0);
      expect(result.eventsUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Should not call any Google Calendar APIs
      expect(mockCreateGoogleCalendarEvent).not.toHaveBeenCalled();
      expect(mockUpdateGoogleCalendarEvent).not.toHaveBeenCalled();
    });
  });
});