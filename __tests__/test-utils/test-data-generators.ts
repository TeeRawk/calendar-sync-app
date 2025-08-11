import { CalendarEvent } from '@/lib/ics-parser';

/**
 * Test data generators for creating realistic meeting scenarios
 */

export interface TestEventOptions {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Date;
  duration?: number; // in minutes
  status?: string;
  sourceTimezone?: string;
  recurrenceRule?: string;
}

export interface TestScenarioOptions {
  count?: number;
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  includeRecurring?: boolean;
  includeAllDay?: boolean;
  includeCancelled?: boolean;
}

/**
 * Generate a single realistic calendar event
 */
export function generateTestEvent(options: TestEventOptions = {}): CalendarEvent {
  const id = options.uid || generateUID();
  const startTime = options.start || generateRandomDateTime();
  const duration = options.duration || generateRandomDuration();
  
  return {
    uid: id,
    summary: options.summary || generateMeetingTitle(),
    description: options.description || generateMeetingDescription(),
    location: options.location || generateMeetingLocation(),
    start: startTime,
    end: new Date(startTime.getTime() + duration * 60 * 1000),
    status: options.status || 'confirmed',
    sourceTimezone: options.sourceTimezone || 'America/Los_Angeles',
    recurrenceRule: options.recurrenceRule,
  };
}

/**
 * Generate multiple realistic events for testing scenarios
 */
export function generateTestEvents(options: TestScenarioOptions = {}): CalendarEvent[] {
  const count = options.count || 10;
  const events: CalendarEvent[] = [];
  
  for (let i = 0; i < count; i++) {
    const event = generateTestEvent({
      start: generateRandomDateTimeInRange(options.startDate, options.endDate),
      sourceTimezone: options.timezone,
    });
    
    // Add variety based on options
    if (options.includeCancelled && Math.random() < 0.1) {
      event.status = 'cancelled';
    }
    
    if (options.includeRecurring && Math.random() < 0.2) {
      event.recurrenceRule = generateRecurrenceRule();
    }
    
    events.push(event);
  }
  
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Generate recurring event instances (already expanded)
 */
export function generateRecurringEventInstances(
  baseEvent: CalendarEvent,
  occurrences: number = 4
): CalendarEvent[] {
  const instances: CalendarEvent[] = [];
  const duration = baseEvent.end.getTime() - baseEvent.start.getTime();
  
  for (let i = 0; i < occurrences; i++) {
    const instanceStart = new Date(baseEvent.start.getTime() + i * 7 * 24 * 60 * 60 * 1000); // Weekly
    const instanceEnd = new Date(instanceStart.getTime() + duration);
    
    instances.push({
      ...baseEvent,
      uid: `${baseEvent.uid}-${instanceStart.getTime()}`, // Make each unique
      start: instanceStart,
      end: instanceEnd,
      recurrenceRule: undefined, // Remove RRULE from instances
    });
  }
  
  return instances;
}

/**
 * Generate work-day realistic meeting scenarios
 */
export function generateWorkDayMeetings(date: Date = new Date()): CalendarEvent[] {
  const workDayStart = new Date(date);
  workDayStart.setHours(9, 0, 0, 0); // 9 AM
  
  const meetings: CalendarEvent[] = [
    // Morning standup
    generateTestEvent({
      summary: 'Daily Standup',
      start: new Date(workDayStart.getTime()),
      duration: 15,
      location: 'Conference Room A',
      description: 'Daily team synchronization meeting',
    }),
    
    // Mid-morning focused work
    generateTestEvent({
      summary: 'Development Block',
      start: new Date(workDayStart.getTime() + 30 * 60 * 1000),
      duration: 120,
      location: 'Desk',
      description: 'Focused development time',
    }),
    
    // Pre-lunch meeting
    generateTestEvent({
      summary: 'Sprint Planning',
      start: new Date(workDayStart.getTime() + 3 * 60 * 60 * 1000),
      duration: 90,
      location: 'Conference Room B',
      description: 'Planning for next sprint iteration',
    }),
    
    // Afternoon client call
    generateTestEvent({
      summary: 'Client Check-in',
      start: new Date(workDayStart.getTime() + 6 * 60 * 60 * 1000),
      duration: 60,
      location: 'Video Call',
      description: 'Weekly client progress review',
    }),
    
    // End of day wrap-up
    generateTestEvent({
      summary: 'Team Retrospective',
      start: new Date(workDayStart.getTime() + 8 * 60 * 60 * 1000),
      duration: 45,
      location: 'Conference Room A',
      description: 'Review of completed work and process improvements',
    }),
  ];
  
  return meetings;
}

/**
 * Generate conference/workshop scenarios
 */
export function generateConferenceSchedule(startDate: Date = new Date()): CalendarEvent[] {
  const conferenceStart = new Date(startDate);
  conferenceStart.setHours(8, 0, 0, 0);
  
  return [
    generateTestEvent({
      summary: 'Conference Registration',
      start: conferenceStart,
      duration: 60,
      location: 'Main Lobby',
      description: 'Check-in and welcome breakfast',
    }),
    
    generateTestEvent({
      summary: 'Keynote: Future of Technology',
      start: new Date(conferenceStart.getTime() + 60 * 60 * 1000),
      duration: 75,
      location: 'Main Auditorium',
      description: 'Opening keynote by industry leader',
    }),
    
    generateTestEvent({
      summary: 'Workshop: Advanced Development Techniques',
      start: new Date(conferenceStart.getTime() + 3 * 60 * 60 * 1000),
      duration: 180,
      location: 'Workshop Room 1',
      description: 'Hands-on coding workshop',
    }),
    
    generateTestEvent({
      summary: 'Panel Discussion: Industry Trends',
      start: new Date(conferenceStart.getTime() + 6.5 * 60 * 60 * 1000),
      duration: 90,
      location: 'Main Auditorium',
      description: 'Expert panel on current market trends',
    }),
    
    generateTestEvent({
      summary: 'Networking Reception',
      start: new Date(conferenceStart.getTime() + 9 * 60 * 60 * 1000),
      duration: 120,
      location: 'Terrace',
      description: 'Evening networking and refreshments',
    }),
  ];
}

/**
 * Generate duplicate-prone scenarios for testing
 */
export function generateDuplicateScenarios(): {
  source: CalendarEvent[];
  existing: { [key: string]: string };
} {
  const baseEvent = generateTestEvent({
    uid: 'duplicate-test-meeting',
    summary: 'Important Team Meeting',
    start: new Date('2024-08-15T10:00:00Z'),
  });
  
  // Generate variations that might cause issues
  const sourceEvents = [
    baseEvent, // Exact duplicate
    { ...baseEvent, summary: 'Updated: Important Team Meeting' }, // Updated content
    { ...baseEvent, location: 'New Location' }, // Updated location
    generateTestEvent({
      uid: 'new-meeting-123',
      summary: 'Brand New Meeting',
      start: new Date('2024-08-15T14:00:00Z'),
    }),
  ];
  
  // Some events already exist in Google Calendar
  const existingEvents = {
    'duplicate-test-meeting:2024-08-15T10:00:00.000Z': 'google-event-existing-1',
  };
  
  return { source: sourceEvents, existing: existingEvents };
}

/**
 * Generate timezone-challenging scenarios
 */
export function generateTimezoneScenarios(): CalendarEvent[] {
  const baseDate = new Date('2024-08-15T10:00:00Z');
  
  return [
    generateTestEvent({
      uid: 'utc-meeting',
      summary: 'UTC Meeting',
      start: baseDate,
      sourceTimezone: 'UTC',
    }),
    
    generateTestEvent({
      uid: 'pst-meeting',
      summary: 'PST Meeting',
      start: new Date('2024-08-15T03:00:00-07:00'), // Same as above in PST
      sourceTimezone: 'America/Los_Angeles',
    }),
    
    generateTestEvent({
      uid: 'est-meeting',
      summary: 'EST Meeting',
      start: new Date('2024-08-15T06:00:00-04:00'), // Same as above in EST
      sourceTimezone: 'America/New_York',
    }),
    
    generateTestEvent({
      uid: 'cet-meeting',
      summary: 'CET Meeting',
      start: new Date('2024-08-15T12:00:00+02:00'), // Same as above in CET
      sourceTimezone: 'Europe/Berlin',
    }),
    
    generateTestEvent({
      uid: 'jst-meeting',
      summary: 'JST Meeting',
      start: new Date('2024-08-15T19:00:00+09:00'), // Same as above in JST
      sourceTimezone: 'Asia/Tokyo',
    }),
  ];
}

/**
 * Generate performance test dataset
 */
export function generatePerformanceTestData(eventCount: number = 1000): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const startDate = new Date('2024-08-01T00:00:00Z');
  
  for (let i = 0; i < eventCount; i++) {
    const eventDate = new Date(startDate.getTime() + i * 30 * 60 * 1000); // Every 30 minutes
    
    events.push(generateTestEvent({
      uid: `perf-test-event-${i.toString().padStart(6, '0')}`,
      summary: `Performance Test Meeting ${i + 1}`,
      start: eventDate,
      duration: 25, // 25 minutes to allow some gaps
    }));
  }
  
  return events;
}

// Helper functions

function generateUID(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `event-${timestamp}-${random}@test.com`;
}

function generateRandomDateTime(): Date {
  const now = new Date();
  const futureTime = now.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000; // Next 30 days
  return new Date(futureTime);
}

function generateRandomDateTimeInRange(start?: Date, end?: Date): Date {
  const startTime = start?.getTime() || Date.now();
  const endTime = end?.getTime() || (Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  const randomTime = startTime + Math.random() * (endTime - startTime);
  return new Date(randomTime);
}

function generateRandomDuration(): number {
  const durations = [15, 30, 45, 60, 90, 120]; // Common meeting lengths in minutes
  return durations[Math.floor(Math.random() * durations.length)];
}

function generateMeetingTitle(): string {
  const prefixes = ['Team', 'Weekly', 'Sprint', 'Project', 'Client', 'Status', 'Planning'];
  const types = ['Meeting', 'Standup', 'Review', 'Sync', 'Call', 'Discussion', 'Session'];
  const subjects = ['Development', 'Marketing', 'Strategy', 'Operations', 'Design', 'Research'];
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const type = types[Math.floor(Math.random() * types.length)];
  const subject = Math.random() > 0.5 ? subjects[Math.floor(Math.random() * subjects.length)] : '';
  
  return `${prefix} ${type}${subject ? ' - ' + subject : ''}`;
}

function generateMeetingDescription(): string {
  const descriptions = [
    'Regular team synchronization and progress updates',
    'Discuss current project status and next steps',
    'Review completed work and plan upcoming tasks',
    'Client presentation and feedback session',
    'Cross-functional collaboration meeting',
    'Technical discussion and problem-solving',
    'Strategic planning and goal setting',
    'Training and knowledge sharing session',
  ];
  
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}

function generateMeetingLocation(): string {
  const locations = [
    'Conference Room A',
    'Conference Room B',
    'Small Meeting Room',
    'Video Call',
    'Zoom Meeting',
    'Teams Meeting',
    'Main Office',
    'Client Site',
    'Building 2, Room 301',
    'Remote',
  ];
  
  return locations[Math.floor(Math.random() * locations.length)];
}

function generateRecurrenceRule(): string {
  const rules = [
    'FREQ=WEEKLY;BYDAY=MO,WE,FR', // MWF
    'FREQ=WEEKLY;BYDAY=TU,TH', // Tue/Thu
    'FREQ=WEEKLY;BYDAY=MO', // Every Monday
    'FREQ=DAILY;INTERVAL=1', // Daily
    'FREQ=MONTHLY;BYMONTHDAY=1', // First of month
  ];
  
  return rules[Math.floor(Math.random() * rules.length)];
}