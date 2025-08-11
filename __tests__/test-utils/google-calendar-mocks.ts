import { CalendarEvent } from '@/lib/ics-parser';

/**
 * Mock implementations and test data for Google Calendar API responses
 */

export interface MockGoogleEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  creator?: {
    email: string;
    displayName?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
}

export interface MockCalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  primary?: boolean;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
}

/**
 * Create a realistic Google Calendar event mock
 */
export function createMockGoogleEvent(
  id: string,
  sourceEvent: CalendarEvent,
  options: {
    includeOriginalUID?: boolean;
    status?: 'confirmed' | 'tentative' | 'cancelled';
    timeZone?: string;
  } = {}
): MockGoogleEvent {
  const description = options.includeOriginalUID 
    ? `${sourceEvent.description || ''}\n\nOriginal UID: ${sourceEvent.uid}`.trim()
    : sourceEvent.description;

  return {
    id,
    summary: sourceEvent.summary,
    description,
    location: sourceEvent.location,
    start: {
      dateTime: sourceEvent.start.toISOString(),
      timeZone: options.timeZone,
    },
    end: {
      dateTime: sourceEvent.end.toISOString(),
      timeZone: options.timeZone,
    },
    status: options.status || 'confirmed',
    htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`,
    creator: {
      email: 'test@example.com',
      displayName: 'Test User',
    },
  };
}

/**
 * Create mock calendar information
 */
export function createMockCalendarInfo(
  id: string = 'test@gmail.com',
  options: {
    summary?: string;
    timeZone?: string;
    accessRole?: string;
    primary?: boolean;
  } = {}
): MockCalendarInfo {
  return {
    id,
    summary: options.summary || 'Test Calendar',
    timeZone: options.timeZone || 'America/Los_Angeles',
    accessRole: (options.accessRole as any) || 'owner',
    primary: options.primary,
  };
}

/**
 * Mock Google Calendar API client responses
 */
export class MockGoogleCalendarClient {
  private mockEvents: { [calendarId: string]: MockGoogleEvent[] } = {};
  private mockCalendars: { [calendarId: string]: MockCalendarInfo } = {};
  private callHistory: Array<{ method: string; args: any[] }> = [];

  constructor() {
    // Set up default calendar
    this.mockCalendars['test@gmail.com'] = createMockCalendarInfo();
  }

  /**
   * Mock calendar events list operation
   */
  mockEventsList(calendarId: string, events: MockGoogleEvent[] = []) {
    this.mockEvents[calendarId] = events;
  }

  /**
   * Mock calendar get operation
   */
  mockCalendarGet(calendarId: string, calendar: MockCalendarInfo) {
    this.mockCalendars[calendarId] = calendar;
  }

  /**
   * Mock events.list API call
   */
  async eventsList(params: {
    calendarId: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: string;
  }) {
    this.callHistory.push({ method: 'events.list', args: [params] });
    
    const events = this.mockEvents[params.calendarId] || [];
    
    // Filter by time range if provided
    let filteredEvents = events;
    if (params.timeMin || params.timeMax) {
      filteredEvents = events.filter(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        
        if (params.timeMin && eventEnd < new Date(params.timeMin)) return false;
        if (params.timeMax && eventStart > new Date(params.timeMax)) return false;
        return true;
      });
    }
    
    // Apply maxResults if provided
    if (params.maxResults) {
      filteredEvents = filteredEvents.slice(0, params.maxResults);
    }
    
    // Sort by start time if requested
    if (params.orderBy === 'startTime') {
      filteredEvents.sort((a, b) => 
        new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
      );
    }

    return {
      data: {
        items: filteredEvents,
        nextPageToken: undefined,
      }
    };
  }

  /**
   * Mock events.insert API call
   */
  async eventsInsert(params: {
    calendarId: string;
    requestBody: Partial<MockGoogleEvent>;
  }) {
    this.callHistory.push({ method: 'events.insert', args: [params] });
    
    const newEventId = `created-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newEvent: MockGoogleEvent = {
      id: newEventId,
      summary: params.requestBody.summary || 'Untitled Event',
      description: params.requestBody.description,
      location: params.requestBody.location,
      start: params.requestBody.start || { dateTime: new Date().toISOString() },
      end: params.requestBody.end || { dateTime: new Date().toISOString() },
      status: params.requestBody.status || 'confirmed',
      htmlLink: `https://calendar.google.com/calendar/event?eid=${newEventId}`,
      creator: {
        email: 'test@example.com',
        displayName: 'Test User',
      },
    };

    // Add to mock storage
    if (!this.mockEvents[params.calendarId]) {
      this.mockEvents[params.calendarId] = [];
    }
    this.mockEvents[params.calendarId].push(newEvent);

    return {
      data: newEvent
    };
  }

  /**
   * Mock events.update API call
   */
  async eventsUpdate(params: {
    calendarId: string;
    eventId: string;
    requestBody: Partial<MockGoogleEvent>;
  }) {
    this.callHistory.push({ method: 'events.update', args: [params] });
    
    const events = this.mockEvents[params.calendarId] || [];
    const eventIndex = events.findIndex(e => e.id === params.eventId);
    
    if (eventIndex === -1) {
      throw new Error(`Event ${params.eventId} not found in calendar ${params.calendarId}`);
    }

    // Update the event
    const updatedEvent = {
      ...events[eventIndex],
      ...params.requestBody,
      id: params.eventId, // Ensure ID doesn't change
    };

    events[eventIndex] = updatedEvent;

    return {
      data: updatedEvent
    };
  }

  /**
   * Mock calendars.get API call
   */
  async calendarsGet(params: { calendarId: string }) {
    this.callHistory.push({ method: 'calendars.get', args: [params] });
    
    const calendar = this.mockCalendars[params.calendarId];
    if (!calendar) {
      throw new Error(`Calendar ${params.calendarId} not found`);
    }

    return {
      data: calendar
    };
  }

  /**
   * Mock calendarList.list API call
   */
  async calendarListList() {
    this.callHistory.push({ method: 'calendarList.list', args: [] });

    return {
      data: {
        items: Object.values(this.mockCalendars).map(cal => ({
          ...cal,
          accessRole: cal.accessRole,
        }))
      }
    };
  }

  /**
   * Get call history for verification
   */
  getCallHistory() {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  clearCallHistory() {
    this.callHistory = [];
  }

  /**
   * Reset all mock data
   */
  reset() {
    this.mockEvents = {};
    this.mockCalendars = { 'test@gmail.com': createMockCalendarInfo() };
    this.callHistory = [];
  }
}

/**
 * Create mock existing events mapping for duplicate detection tests
 */
export function createMockExistingEvents(events: Array<{
  uid: string;
  startTime: Date;
  googleEventId: string;
}>): { [key: string]: string } {
  const mapping: { [key: string]: string } = {};
  
  events.forEach(({ uid, startTime, googleEventId }) => {
    const key = `${uid}:${startTime.toISOString()}`;
    mapping[key] = googleEventId;
  });
  
  return mapping;
}

/**
 * Create mock Google events with Original UID in description
 */
export function createMockEventsWithUIDs(events: Array<{
  googleEventId: string;
  originalUID: string;
  startTime: Date;
  summary: string;
}>): MockGoogleEvent[] {
  return events.map(({ googleEventId, originalUID, startTime, summary }) => ({
    id: googleEventId,
    summary,
    description: `Meeting details here.\n\nOriginal UID: ${originalUID}`,
    start: {
      dateTime: startTime.toISOString(),
    },
    end: {
      dateTime: new Date(startTime.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour later
    },
    status: 'confirmed' as const,
    htmlLink: `https://calendar.google.com/calendar/event?eid=${googleEventId}`,
    creator: {
      email: 'test@example.com',
      displayName: 'Test User',
    },
  }));
}

/**
 * Error simulation utilities
 */
export class MockGoogleCalendarErrors {
  static authenticationError() {
    const error = new Error('Authentication expired');
    (error as any).code = 401;
    (error as any).status = 401;
    return error;
  }

  static rateLimitError() {
    const error = new Error('Rate limit exceeded');
    (error as any).code = 429;
    (error as any).status = 429;
    return error;
  }

  static permissionError() {
    const error = new Error('Insufficient permissions');
    (error as any).code = 403;
    (error as any).status = 403;
    return error;
  }

  static notFoundError() {
    const error = new Error('Resource not found');
    (error as any).code = 404;
    (error as any).status = 404;
    return error;
  }

  static networkError() {
    const error = new Error('Network timeout');
    (error as any).code = 'ECONNRESET';
    return error;
  }
}

/**
 * Performance testing utilities
 */
export function createLargeMockEventSet(count: number, calendarId: string = 'test@gmail.com'): MockGoogleEvent[] {
  const events: MockGoogleEvent[] = [];
  const startDate = new Date('2024-08-01T00:00:00Z');
  
  for (let i = 0; i < count; i++) {
    const eventStart = new Date(startDate.getTime() + i * 30 * 60 * 1000); // Every 30 minutes
    const eventEnd = new Date(eventStart.getTime() + 25 * 60 * 1000); // 25 minutes long
    
    events.push({
      id: `perf-test-event-${i.toString().padStart(6, '0')}`,
      summary: `Performance Test Event ${i + 1}`,
      description: `Automatically generated event for performance testing.\n\nOriginal UID: perf-test-${i}@example.com`,
      start: {
        dateTime: eventStart.toISOString(),
      },
      end: {
        dateTime: eventEnd.toISOString(),
      },
      status: 'confirmed',
      htmlLink: `https://calendar.google.com/calendar/event?eid=perf-test-event-${i}`,
      creator: {
        email: 'perftest@example.com',
        displayName: 'Performance Test User',
      },
    });
  }
  
  return events;
}