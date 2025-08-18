import ICAL from 'ical';
import { RRule } from 'rrule';

export interface BusyFreeEvent {
  uid: string;
  start: Date;
  end: Date;
  status: 'busy' | 'free';
  transparency: 'opaque' | 'transparent';
  summary: string;
  location?: string;
  attendee?: string;
  description?: string;
}

export interface BusyFreeCalendar {
  calendarName?: string;
  timezone?: string;
  events: BusyFreeEvent[];
}

export interface ParseOptions {
  startDate?: Date;
  endDate?: Date;
  includeFreeBusy?: boolean;
}

export async function parseBusyFreeICS(
  icsUrl: string,
  options: ParseOptions = {}
): Promise<BusyFreeCalendar> {
  try {
    const response = await fetch(icsUrl, {
      headers: {
        'User-Agent': 'Calendar-Sync-App-BusyFree/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch busy/free calendar: HTTP ${response.status} ${response.statusText}`);
    }

    const icsData = await response.text();
    return parseBusyFreeData(icsData, options);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to fetch busy/free calendar')) {
      throw error;
    }
    throw new Error(`Failed to fetch busy/free calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function parseBusyFreeData(
  icsData: string,
  options: ParseOptions = {}
): BusyFreeCalendar {
  try {
    const parsed = ICAL.parseICS(icsData);
    const events: BusyFreeEvent[] = [];
    
    let calendarName: string | undefined;
    let timezone: string | undefined;

    // Extract calendar-level information
    for (const key in parsed) {
      const component = parsed[key];
      
      if ((component as any).type === 'VCALENDAR') {
        const vcalendar = component as any;
        if (vcalendar['x-wr-calname']) {
          calendarName = String(vcalendar['x-wr-calname']);
        }
        if (vcalendar['x-wr-timezone']) {
          timezone = String(vcalendar['x-wr-timezone']);
        }
      }
      
      if (component.type === 'VTIMEZONE' && component.tzid) {
        timezone = String(component.tzid);
      }
    }

    // Parse events
    for (const key in parsed) {
      const component = parsed[key];
      
      if (component.type === 'VEVENT') {
        const busyFreeEvent = parseBusyFreeEvent(component);
        
        if (busyFreeEvent) {
          // Handle recurring events
          if (component.rrule && (options.startDate || options.endDate)) {
            const expandedEvents = expandRecurringBusyFreeEvent(
              busyFreeEvent,
              component.rrule,
              options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
              options.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            );
            events.push(...expandedEvents);
          } else {
            events.push(busyFreeEvent);
          }
        }
      }
    }

    // Filter events by date range if specified
    let filteredEvents = events;
    if (options.startDate || options.endDate) {
      filteredEvents = events.filter(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        const afterStartDate = !options.startDate || eventEnd >= options.startDate;
        const beforeEndDate = !options.endDate || eventStart <= options.endDate;
        
        return afterStartDate && beforeEndDate;
      });
    }

    return {
      calendarName,
      timezone,
      events: filteredEvents,
    };
  } catch (error) {
    throw new Error(`Error parsing busy/free ICS data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function parseBusyFreeEvent(component: any): BusyFreeEvent | null {
  try {
    if (!component.start || !component.end) {
      return null;
    }

    // Parse start and end dates
    const start = parseICSDate(component.start);
    const end = parseICSDate(component.end);

    if (!start || !end) {
      return null;
    }

    // Determine busy/free status from transparency or summary
    let status: 'busy' | 'free' = 'busy';
    let transparency: 'opaque' | 'transparent' = 'opaque';

    if (component.transp) {
      const transp = String(component.transp).toLowerCase();
      transparency = transp === 'transparent' ? 'transparent' : 'opaque';
      status = transparency === 'transparent' ? 'free' : 'busy';
    }

    // Override status if explicitly set in component
    if (component.status) {
      const statusValue = String(component.status).toLowerCase();
      if (statusValue === 'free' || statusValue.includes('free')) {
        status = 'free';
        transparency = 'transparent';
      }
    }

    // Get summary - default to status if not provided
    const summary = component.summary ? String(component.summary) : (status === 'busy' ? 'Busy' : 'Free');

    const event: BusyFreeEvent = {
      uid: component.uid || `generated-${Date.now()}-${Math.random()}`,
      start,
      end,
      status,
      transparency,
      summary,
    };

    // Optional fields
    if (component.location) {
      event.location = String(component.location);
    }
    if (component.attendee) {
      event.attendee = String(component.attendee).replace(/^mailto:/, '');
    }
    if (component.description) {
      event.description = String(component.description);
    }

    return event;
  } catch (error) {
    console.error('Error parsing busy/free event:', error);
    return null;
  }
}

function parseICSDate(dateValue: any): Date | null {
  try {
    if (!dateValue) return null;

    if (typeof dateValue === 'object' && typeof dateValue.getFullYear === 'function') {
      // Already a Date object - extract components to avoid timezone issues
      const year = dateValue.getFullYear();
      const month = dateValue.getMonth();
      const day = dateValue.getDate();
      const hours = dateValue.getHours();
      const minutes = dateValue.getMinutes();
      const seconds = dateValue.getSeconds() || 0;
      
      return new Date(year, month, day, hours, minutes, seconds);
    }

    // Parse as string
    const dateStr = String(dateValue);
    return new Date(dateStr);
  } catch (error) {
    console.error('Error parsing ICS date:', error);
    return null;
  }
}

function expandRecurringBusyFreeEvent(
  event: BusyFreeEvent,
  rrule: any,
  startDate: Date,
  endDate: Date
): BusyFreeEvent[] {
  try {
    const rule = RRule.fromString(rrule.toString());
    const occurrences = rule.between(startDate, endDate, true);
    
    const expandedEvents: BusyFreeEvent[] = [];
    const originalDuration = event.end.getTime() - event.start.getTime();
    
    occurrences.forEach((occurrence) => {
      const occurrenceStart = new Date(occurrence);
      const occurrenceEnd = new Date(occurrence.getTime() + originalDuration);
      
      const expandedEvent: BusyFreeEvent = {
        ...event,
        uid: `${event.uid}-${occurrence.getTime()}`,
        start: occurrenceStart,
        end: occurrenceEnd,
      };
      
      expandedEvents.push(expandedEvent);
    });
    
    return expandedEvents;
  } catch (error) {
    console.error(`Error expanding recurring busy/free event "${event.summary}":`, error);
    return [event];
  }
}

export function filterBusyFreeEventsForMonth(
  events: BusyFreeEvent[],
  year: number,
  month: number
): BusyFreeEvent[] {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  return events.filter(event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    
    return (eventStart >= startOfMonth && eventStart <= endOfMonth) ||
           (eventEnd >= startOfMonth && eventEnd <= endOfMonth) ||
           (eventStart <= startOfMonth && eventEnd >= endOfMonth);
  });
}

export function createPrivacyCompliantEvent(
  event: BusyFreeEvent,
  privacyLevel: 'busy_only' | 'show_free_busy' | 'full_details' = 'busy_only'
): Partial<BusyFreeEvent> {
  const base = {
    uid: event.uid,
    start: event.start,
    end: event.end,
  };

  switch (privacyLevel) {
    case 'busy_only':
      return {
        ...base,
        summary: event.status === 'busy' ? 'Busy' : 'Free',
        status: event.status,
        transparency: event.transparency,
      };
    
    case 'show_free_busy':
      return {
        ...base,
        summary: event.summary,
        status: event.status,
        transparency: event.transparency,
      };
    
    case 'full_details':
      return event;
    
    default:
      return base;
  }
}