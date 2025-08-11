import { DuplicateCleanupService } from '@/lib/duplicate-cleanup-service';
import { jest } from '@jest/globals';

// Mock Google Calendar API
const mockGoogleCalendar = {
  events: {
    list: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
  calendars: {
    get: jest.fn(),
  },
};

// Mock the Google Calendar client
jest.mock('@/lib/google-calendar', () => ({
  getGoogleCalendarClient: jest.fn(() => Promise.resolve(mockGoogleCalendar)),
}));

// Mock database
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'test-id' }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(1),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

describe('DuplicateCleanupService', () => {
  let service: DuplicateCleanupService;

  beforeEach(() => {
    service = new DuplicateCleanupService();
    jest.clearAllMocks();
  });

  describe('fetchCalendarEvents', () => {
    it('should fetch events from multiple calendars', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Test Event 1',
          description: 'Original UID: original-1',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
        {
          id: 'event-2',
          summary: 'Test Event 2',
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
          created: '2024-01-02T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const events = await service.fetchCalendarEvents(['primary', 'test-calendar']);

      expect(mockGoogleCalendar.events.list).toHaveBeenCalledTimes(2);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        id: 'event-1',
        title: 'Test Event 1',
        sourceUid: 'original-1',
      });
    });

    it('should handle calendar API errors gracefully', async () => {
      mockGoogleCalendar.events.list.mockRejectedValueOnce(new Error('Calendar not found'));

      await expect(
        service.fetchCalendarEvents(['invalid-calendar'])
      ).rejects.toThrow('Failed to fetch events from calendar invalid-calendar');
    });

    it('should filter events with missing required fields', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Valid Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
        },
        {
          id: 'event-2',
          // Missing summary
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
        },
        {
          // Missing id
          summary: 'Invalid Event',
          start: { dateTime: '2024-01-03T10:00:00Z' },
          end: { dateTime: '2024-01-03T11:00:00Z' },
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const events = await service.fetchCalendarEvents(['primary']);

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Valid Event');
    });
  });

  describe('analyzeDuplicates', () => {
    beforeEach(() => {
      // Mock successful calendar fetch
      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: [] },
      });
    });

    it('should identify exact duplicate matches', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Team Meeting',
          description: 'Weekly team sync',
          location: 'Conference Room A',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Team Meeting',
          description: 'Weekly team sync',
          location: 'Conference Room A',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z', // Created later
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.analyzeDuplicates(['primary']);

      expect(result.totalEvents).toBe(2);
      expect(result.summary.totalDuplicates).toBe(1);
      expect(result.summary.exactMatches).toBe(1);
      expect(result.duplicateGroups).toHaveLength(1);

      const group = result.duplicateGroups[0];
      expect(group.matchType).toBe('exact');
      expect(group.confidence).toBe(100);
      expect(group.primaryEvent.id).toBe('original-1'); // Should preserve older event
      expect(group.duplicates).toHaveLength(1);
      expect(group.duplicates[0].id).toBe('duplicate-1');
    });

    it('should identify fuzzy duplicate matches', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Daily Standup Meeting',
          start: { dateTime: '2024-01-01T09:00:00Z' },
          end: { dateTime: '2024-01-01T09:30:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'event-2',
          summary: 'Daily Standup', // Similar title
          start: { dateTime: '2024-01-01T09:30:00Z' }, // Close time (within 2 hours)
          end: { dateTime: '2024-01-01T10:00:00Z' },
          created: '2024-01-01T08:30:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.analyzeDuplicates(['primary']);

      expect(result.summary.fuzzyMatches).toBeGreaterThan(0);
      const fuzzyGroup = result.duplicateGroups.find(g => g.matchType === 'fuzzy');
      expect(fuzzyGroup).toBeDefined();
      expect(fuzzyGroup?.confidence).toBe(85);
    });

    it('should identify pattern-based matches with Original UID', async () => {
      const mockEvents = [
        {
          id: 'google-1',
          summary: 'Imported Event',
          description: 'Original UID: external-uid-123',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'google-2',
          summary: 'Imported Event',
          description: 'Original UID: external-uid-123', // Same UID
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.analyzeDuplicates(['primary']);

      expect(result.summary.patternMatches).toBe(1);
      const patternGroup = result.duplicateGroups.find(g => g.matchType === 'pattern');
      expect(patternGroup).toBeDefined();
      expect(patternGroup?.confidence).toBe(95);
    });

    it('should apply date range filters correctly', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Old Event',
          start: { dateTime: '2023-12-01T10:00:00Z' },
          end: { dateTime: '2023-12-01T11:00:00Z' },
        },
        {
          id: 'event-2',
          summary: 'Recent Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const filters = {
        dateRange: {
          start: new Date('2024-01-01T00:00:00Z'),
          end: new Date('2024-01-31T23:59:59Z'),
        },
      };

      const result = await service.analyzeDuplicates(['primary'], filters);

      // Should have called events.list with the correct date range
      expect(mockGoogleCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: filters.dateRange.start.toISOString(),
          timeMax: filters.dateRange.end.toISOString(),
        })
      );
    });

    it('should apply title pattern filters', async () => {
      // This would be tested through the filtering logic in the service
      // The actual API call happens before filtering, but filtering affects the results
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Team Meeting',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'event-2',
          summary: 'Team Meeting',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
        {
          id: 'event-3',
          summary: 'Client Call',
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
          created: '2024-01-02T08:00:00Z',
        },
        {
          id: 'event-4',
          summary: 'Client Call',
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
          created: '2024-01-02T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const filters = {
        titlePatterns: ['Team Meeting'],
      };

      const result = await service.analyzeDuplicates(['primary'], filters);

      // Should only find duplicates in "Team Meeting" events
      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].primaryEvent.title).toBe('Team Meeting');
    });
  });

  describe('cleanupDuplicates', () => {
    beforeEach(() => {
      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: [] },
      });
      mockGoogleCalendar.events.delete.mockResolvedValue({});
      mockGoogleCalendar.events.get.mockResolvedValue({
        data: { id: 'backup-event', summary: 'Backed up event' },
      });
    });

    it('should perform dry-run without deleting events', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'dry-run',
      });

      expect(result.duplicatesFound).toBe(1);
      expect(result.duplicatesDeleted).toBe(0);
      expect(result.deletedEventIds).toEqual(['duplicate-1']);
      expect(result.preservedEventIds).toEqual(['original-1']);
      expect(mockGoogleCalendar.events.delete).not.toHaveBeenCalled();
    });

    it('should perform batch cleanup with actual deletions', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
      });

      expect(result.duplicatesFound).toBe(1);
      expect(result.duplicatesDeleted).toBe(1);
      expect(mockGoogleCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'duplicate-1',
      });
    });

    it('should respect maxDeletions limit', async () => {
      const mockEvents = [];
      
      // Create 10 duplicate pairs (20 events total, 10 duplicates to delete)
      for (let i = 0; i < 10; i++) {
        mockEvents.push(
          {
            id: `original-${i}`,
            summary: `Event ${i}`,
            start: { dateTime: '2024-01-01T10:00:00Z' },
            end: { dateTime: '2024-01-01T11:00:00Z' },
            created: '2024-01-01T08:00:00Z',
          },
          {
            id: `duplicate-${i}`,
            summary: `Event ${i}`,
            start: { dateTime: '2024-01-01T10:00:00Z' },
            end: { dateTime: '2024-01-01T11:00:00Z' },
            created: '2024-01-01T09:00:00Z',
          }
        );
      }

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
        maxDeletions: 5,
      });

      expect(result.duplicatesFound).toBe(10);
      expect(result.duplicatesDeleted).toBeLessThanOrEqual(5);
      expect(result.warnings).toContain(expect.stringContaining('limited to 5 deletions'));
    });

    it('should create backup when requested', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
        createBackup: true,
      });

      expect(result.backupId).toBeDefined();
      expect(result.backupId).toMatch(/^backup_/);
      expect(mockGoogleCalendar.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'duplicate-1',
      });
    });

    it('should skip events matching skip patterns', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Important Meeting',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Important Meeting',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
        {
          id: 'original-2',
          summary: 'Regular Meeting',
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
          created: '2024-01-02T08:00:00Z',
        },
        {
          id: 'duplicate-2',
          summary: 'Regular Meeting',
          start: { dateTime: '2024-01-02T10:00:00Z' },
          end: { dateTime: '2024-01-02T11:00:00Z' },
          created: '2024-01-02T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
        skipPatterns: ['Important'],
      });

      // Should skip the "Important Meeting" group but process "Regular Meeting"
      expect(result.duplicatesDeleted).toBe(1);
      expect(result.warnings).toContain(expect.stringContaining('skip pattern match'));
      
      // Should only delete "duplicate-2", not "duplicate-1"
      expect(mockGoogleCalendar.events.delete).toHaveBeenCalledTimes(1);
      expect(mockGoogleCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'duplicate-2',
      });
    });

    it('should preserve newest events when preserveNewest is true', async () => {
      const mockEvents = [
        {
          id: 'older-event',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'newer-event',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T10:00:00Z', // Created later
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
        preserveNewest: true,
      });

      // Should preserve newer-event and delete older-event
      expect(result.preservedEventIds).toContain('newer-event');
      expect(result.deletedEventIds).toContain('older-event');
      expect(mockGoogleCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'older-event',
      });
    });

    it('should handle deletion errors gracefully', async () => {
      const mockEvents = [
        {
          id: 'original-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T08:00:00Z',
        },
        {
          id: 'duplicate-1',
          summary: 'Test Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
          created: '2024-01-01T09:00:00Z',
        },
      ];

      mockGoogleCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      mockGoogleCalendar.events.delete.mockRejectedValue(new Error('Event not found'));

      const result = await service.cleanupDuplicates(['primary'], {
        mode: 'batch',
      });

      expect(result.duplicatesDeleted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to delete event duplicate-1');
    });
  });
});