import { DuplicateResolver, createDuplicateResolver, mergeEventData, DEFAULT_DUPLICATE_OPTIONS } from '../../../lib/duplicate-resolution';
import { CalendarEvent } from '../../../lib/ics-parser';
import { calendar_v3 } from 'googleapis';

// Mock dependencies
jest.mock('../../../lib/google-calendar');

const mockGetGoogleCalendarClient = jest.fn();
const mockCalendarEventsList = jest.fn();

// Mock the google calendar client
beforeEach(() => {
  jest.clearAllMocks();
  
  // Mock getGoogleCalendarClient to return a mock calendar
  require('../../../lib/google-calendar').getGoogleCalendarClient = mockGetGoogleCalendarClient.mockResolvedValue({
    events: {
      list: mockCalendarEventsList
    }
  });
});

describe('DuplicateResolver', () => {
  const sampleIncomingEvent: CalendarEvent = {
    uid: 'test-uid-123',
    summary: 'Team Meeting',
    description: 'Weekly team sync',
    start: new Date('2023-07-15T14:00:00Z'),
    end: new Date('2023-07-15T15:00:00Z'),
    location: 'Conference Room A',
    status: 'confirmed',
  };

  const sampleExistingEvent: calendar_v3.Schema$Event = {
    id: 'google-event-456',
    summary: 'Team Meeting',
    description: 'Weekly team sync\n\nOriginal UID: test-uid-123',
    start: { dateTime: '2023-07-15T14:00:00Z' },
    end: { dateTime: '2023-07-15T15:00:00Z' },
    location: 'Conference Room A',
    status: 'confirmed',
  };

  describe('constructor', () => {
    it('should use default options when none provided', () => {
      const resolver = new DuplicateResolver();
      expect(resolver).toBeInstanceOf(DuplicateResolver);
    });

    it('should merge custom options with defaults', () => {
      const customOptions = { timeTolerance: 15, fuzzyMatching: false };
      const resolver = new DuplicateResolver(customOptions);
      expect(resolver).toBeInstanceOf(DuplicateResolver);
    });
  });

  describe('findDuplicateMeeting', () => {
    it('should return create action when no existing events found', async () => {
      mockCalendarEventsList.mockResolvedValue({
        data: { items: [] }
      });

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe('create');
      expect(result.confidence).toBe(1.0);
    });

    it('should detect exact UID match as high confidence duplicate', async () => {
      mockCalendarEventsList.mockResolvedValue({
        data: { items: [sampleExistingEvent] }
      });

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe('update');
      expect(result.existingEventId).toBe('google-event-456');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reason).toContain('UID match');
    });

    it('should detect recurring event UID matches', async () => {
      const recurringIncomingEvent = {
        ...sampleIncomingEvent,
        uid: 'test-uid-123-1689422400000' // UID with timestamp
      };

      mockCalendarEventsList.mockResolvedValue({
        data: { items: [sampleExistingEvent] }
      });

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        recurringIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe('update');
      expect(result.reason).toContain('Base UID match');
    });

    it('should handle time tolerance in matching', async () => {
      const existingWithSlightTimeDiff = {
        ...sampleExistingEvent,
        start: { dateTime: '2023-07-15T14:03:00Z' }, // 3 minutes later
        end: { dateTime: '2023-07-15T15:03:00Z' },
        description: 'Different description\n\nOriginal UID: different-uid'
      };

      mockCalendarEventsList.mockResolvedValue({
        data: { items: [existingWithSlightTimeDiff] }
      });

      const resolver = new DuplicateResolver({ timeTolerance: 5 });
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      // Should match on time and title
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('Time match');
    });

    it('should use fuzzy matching for similar titles', async () => {
      const existingWithSimilarTitle = {
        ...sampleExistingEvent,
        summary: 'Team Meeting - Weekly',
        description: 'Different description\n\nOriginal UID: different-uid'
      };

      mockCalendarEventsList.mockResolvedValue({
        data: { items: [existingWithSimilarTitle] }
      });

      const resolver = new DuplicateResolver({ fuzzyMatching: true, confidenceThreshold: 0.6 });
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.reason).toContain('Fuzzy title match');
    });

    it('should handle location matching', async () => {
      const existingWithSameLocation = {
        ...sampleExistingEvent,
        summary: 'Different Meeting',
        start: { dateTime: '2023-07-15T14:00:00Z' },
        end: { dateTime: '2023-07-15T15:00:00Z' },
        location: 'Conference Room A',
        description: 'Different description\n\nOriginal UID: different-uid'
      };

      mockCalendarEventsList.mockResolvedValue({
        data: { items: [existingWithSameLocation] }
      });

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.reason).toContain('Location match');
    });

    it('should respect confidence threshold', async () => {
      const lowConfidenceMatch = {
        ...sampleExistingEvent,
        summary: 'Completely Different Meeting',
        start: { dateTime: '2023-07-15T16:00:00Z' }, // Different time
        end: { dateTime: '2023-07-15T17:00:00Z' },
        location: 'Different Room',
        description: 'Different description\n\nOriginal UID: different-uid'
      };

      mockCalendarEventsList.mockResolvedValue({
        data: { items: [lowConfidenceMatch] }
      });

      const resolver = new DuplicateResolver({ confidenceThreshold: 0.9 });
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe('create');
    });

    it('should handle API errors gracefully', async () => {
      mockCalendarEventsList.mockRejectedValue(new Error('API Error'));

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe('create');
      expect(result.reason).toContain('Error in duplicate detection');
    });

    it('should find best match among multiple candidates', async () => {
      const multipleExistingEvents = [
        {
          id: 'event-1',
          summary: 'Similar Meeting',
          start: { dateTime: '2023-07-15T14:00:00Z' },
          end: { dateTime: '2023-07-15T15:00:00Z' },
          description: 'Low confidence match\n\nOriginal UID: different-uid-1'
        },
        {
          id: 'event-2',
          summary: 'Team Meeting',
          start: { dateTime: '2023-07-15T14:00:00Z' },
          end: { dateTime: '2023-07-15T15:00:00Z' },
          description: 'High confidence match\n\nOriginal UID: test-uid-123'
        }
      ];

      mockCalendarEventsList.mockResolvedValue({
        data: { items: multipleExistingEvents }
      });

      const resolver = new DuplicateResolver();
      const result = await resolver.findDuplicateMeeting(
        sampleIncomingEvent,
        'test-calendar-id',
        new Date('2023-07-01'),
        new Date('2023-07-31')
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.existingEventId).toBe('event-2'); // Should pick the better match
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('utility functions', () => {
    it('createDuplicateResolver should create resolver with custom options', () => {
      const resolver = createDuplicateResolver({ timeTolerance: 20 });
      expect(resolver).toBeInstanceOf(DuplicateResolver);
    });

    it('mergeEventData should preserve existing Google Calendar metadata', () => {
      const existingGoogleEvent: calendar_v3.Schema$Event = {
        id: 'google-123',
        etag: '"etag-value"',
        created: '2023-07-01T10:00:00Z',
        creator: { email: 'creator@example.com' },
        organizer: { email: 'organizer@example.com' },
        attendees: [{ email: 'attendee@example.com' }],
        summary: 'Old Title',
        start: { dateTime: '2023-07-15T14:00:00Z', timeZone: 'America/New_York' },
        end: { dateTime: '2023-07-15T15:00:00Z', timeZone: 'America/New_York' },
      };

      const mergedEvent = mergeEventData(sampleIncomingEvent, existingGoogleEvent, 'Europe/Madrid');

      // Should update content from incoming event
      expect(mergedEvent.summary).toBe(sampleIncomingEvent.summary);
      expect(mergedEvent.location).toBe(sampleIncomingEvent.location);
      expect(mergedEvent.description).toContain(sampleIncomingEvent.description);
      expect(mergedEvent.description).toContain('Original UID: test-uid-123');

      // Should preserve existing Google Calendar metadata
      expect(mergedEvent.id).toBe('google-123');
      expect(mergedEvent.etag).toBe('"etag-value"');
      expect(mergedEvent.creator).toEqual({ email: 'creator@example.com' });
      expect(mergedEvent.organizer).toEqual({ email: 'organizer@example.com' });
      expect(mergedEvent.attendees).toEqual([{ email: 'attendee@example.com' }]);

      // Should preserve timezone info
      expect(mergedEvent.start?.timeZone).toBe('America/New_York');
      expect(mergedEvent.end?.timeZone).toBe('America/New_York');
    });
  });

  describe('string similarity calculation', () => {
    const resolver = new DuplicateResolver();

    it('should calculate similarity correctly for identical strings', () => {
      // Access private method through reflection for testing
      const similarity = (resolver as any).calculateStringSimilarity('Team Meeting', 'Team Meeting');
      expect(similarity).toBe(1.0);
    });

    it('should calculate similarity correctly for completely different strings', () => {
      const similarity = (resolver as any).calculateStringSimilarity('Team Meeting', 'Lunch Break');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should calculate similarity correctly for similar strings', () => {
      const similarity = (resolver as any).calculateStringSimilarity('Team Meeting', 'Team Meeting - Weekly');
      expect(similarity).toBeGreaterThan(0.7);
      expect(similarity).toBeLessThan(1.0);
    });
  });

  describe('string normalization', () => {
    const resolver = new DuplicateResolver();

    it('should normalize strings correctly', () => {
      const normalized = (resolver as any).normalizeString('  Team   Meeting  \n\t');
      expect(normalized).toBe('team meeting');
    });

    it('should handle empty strings', () => {
      const normalized = (resolver as any).normalizeString('');
      expect(normalized).toBe('');
    });
  });
});

describe('Integration with default options', () => {
  it('should use sensible defaults', () => {
    expect(DEFAULT_DUPLICATE_OPTIONS.timeTolerance).toBe(5);
    expect(DEFAULT_DUPLICATE_OPTIONS.fuzzyMatching).toBe(true);
    expect(DEFAULT_DUPLICATE_OPTIONS.confidenceThreshold).toBe(0.8);
    expect(DEFAULT_DUPLICATE_OPTIONS.maxComparisons).toBe(1000);
  });
});

describe('Edge cases', () => {
  beforeEach(() => {
    mockCalendarEventsList.mockResolvedValue({
      data: { items: [] }
    });
  });

  it('should handle events with missing required fields', async () => {
    const incompleteEvent = {
      uid: 'test-uid',
      summary: 'Test Event',
      start: new Date('2023-07-15T14:00:00Z'),
      end: new Date('2023-07-15T15:00:00Z'),
      // Missing optional fields
    } as CalendarEvent;

    const resolver = new DuplicateResolver();
    const result = await resolver.findDuplicateMeeting(
      incompleteEvent,
      'test-calendar-id',
      new Date('2023-07-01'),
      new Date('2023-07-31')
    );

    expect(result.action).toBe('create');
  });

  it('should handle existing events with missing fields', async () => {
    const incompleteExistingEvent = {
      id: 'google-event-123',
      summary: 'Test Event',
      // Missing start/end times
    };

    mockCalendarEventsList.mockResolvedValue({
      data: { items: [incompleteExistingEvent] }
    });

    const resolver = new DuplicateResolver();
    const result = await resolver.findDuplicateMeeting(
      sampleIncomingEvent,
      'test-calendar-id',
      new Date('2023-07-01'),
      new Date('2023-07-31')
    );

    expect(result.action).toBe('create'); // Should not match incomplete events
  });

  it('should handle very large numbers of existing events', async () => {
    const manyEvents = Array.from({ length: 2000 }, (_, i) => ({
      id: `event-${i}`,
      summary: `Event ${i}`,
      start: { dateTime: '2023-07-15T14:00:00Z' },
      end: { dateTime: '2023-07-15T15:00:00Z' },
      description: `Event ${i} description\n\nOriginal UID: event-uid-${i}`
    }));

    mockCalendarEventsList.mockResolvedValue({
      data: { items: manyEvents.slice(0, 1000) } // API returns first 1000
    });

    const resolver = new DuplicateResolver({ maxComparisons: 1000 });
    const startTime = Date.now();
    
    const result = await resolver.findDuplicateMeeting(
      sampleIncomingEvent,
      'test-calendar-id',
      new Date('2023-07-01'),
      new Date('2023-07-31')
    );

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    expect(result).toBeDefined();
  });
});