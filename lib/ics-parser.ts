import ICAL from 'ical';
import { RRule } from 'rrule';

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  recurrenceRule?: string;
  status?: string;
  sourceTimezone?: string; // Add source timezone info
}

export async function parseICSFromUrl(icsUrl: string): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(icsUrl, {
      headers: {
        'User-Agent': 'Calendar-Sync-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`);
    }

    const icsData = await response.text();
    return parseICSData(icsData);
  } catch (error) {
    throw new Error(`Error fetching ICS data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function expandRecurringEvent(event: CalendarEvent, startDate: Date, endDate: Date): CalendarEvent[] {
  if (!event.recurrenceRule) {
    return [event];
  }

  try {
    // Parse the RRULE
    const rrule = RRule.fromString(event.recurrenceRule);
    
    // Get all occurrences within the date range
    const occurrences = rrule.between(startDate, endDate, true);
    
    const expandedEvents: CalendarEvent[] = [];
    
    occurrences.forEach((occurrence, index) => {
      // Calculate duration from original event
      const originalDuration = event.end.getTime() - event.start.getTime();
      const occurrenceStart = new Date(occurrence);
      const occurrenceEnd = new Date(occurrence.getTime() + originalDuration);
      
      const expandedEvent: CalendarEvent = {
        ...event,
        uid: `${event.uid}-${occurrence.getTime()}`, // Make each occurrence unique
        start: occurrenceStart,
        end: occurrenceEnd,
        recurrenceRule: undefined, // Remove RRULE from expanded instances
      };
      
      expandedEvents.push(expandedEvent);
    });
    
    return expandedEvents;
  } catch (error) {
    console.error(`❌ Error expanding recurring event "${event.summary}":`, error);
    return [event]; // Return original event if expansion fails
  }
}

export function parseICSData(icsData: string): CalendarEvent[] {
  try {
    
    const parsed = ICAL.parseICS(icsData);
    const events: CalendarEvent[] = [];
    
    // First, find the overall calendar timezone (VTIMEZONE component)
    let calendarTimezone: string | null = null;
    
    // Find calendar timezone
    for (const key in parsed) {
      const component = parsed[key];
      
      if (component.type === 'VTIMEZONE' && component.tzid) {
        calendarTimezone = typeof component.tzid === 'string' ? component.tzid : String(component.tzid);
      }
      
      if ((component as any).type === 'VCALENDAR' && (component as any)['x-wr-timezone']) {
        calendarTimezone = typeof (component as any)['x-wr-timezone'] === 'string' ? (component as any)['x-wr-timezone'] : String((component as any)['x-wr-timezone']);
      }
    }
    

    for (const key in parsed) {
      const component = parsed[key];
      
      if (component.type === 'VEVENT') {
        // Process event
        
        // Use the calendar timezone instead of individual event timezone
        let sourceTimezone = calendarTimezone;
        
        if (!sourceTimezone) {
          // Fallback to individual event timezone if no calendar timezone
          if (component.start && typeof component.start === 'object' && (component.start as any).tz) {
            sourceTimezone = (component.start as any).tz;
          }
        }
        
        // DON'T use JavaScript's Date parsing - it's wrong!
        // Instead, extract the raw date/time components and reconstruct properly
        let startDate: Date;
        let endDate: Date;
        
        if (component.start && typeof component.start === 'object' && typeof (component.start as any).getFullYear === 'function') {
          // Extract wall-clock time components from ICS
          const rawStart = component.start;
          const year = rawStart.getFullYear();
          const month = rawStart.getMonth(); // 0-based
          const day = rawStart.getDate();
          const hours = rawStart.getHours();
          const minutes = rawStart.getMinutes();
          const seconds = rawStart.getSeconds() || 0;
          
          startDate = new Date(year, month, day, hours, minutes, seconds);
        } else {
          startDate = component.start ? new Date(component.start) : new Date();
        }
        
        // Same for end date
        if (component.end && typeof component.end === 'object' && typeof (component.end as any).getFullYear === 'function') {
          const rawEnd = component.end;
          const year = rawEnd.getFullYear();
          const month = rawEnd.getMonth();
          const day = rawEnd.getDate(); 
          const hours = rawEnd.getHours();
          const minutes = rawEnd.getMinutes();
          const seconds = rawEnd.getSeconds() || 0;
          
          endDate = new Date(year, month, day, hours, minutes, seconds);
        } else {
          endDate = component.end ? new Date(component.end) : new Date();
        }
        
        const event: CalendarEvent = {
          uid: component.uid || key,
          summary: component.summary || 'No Title',
          description: component.description || '',
          start: startDate,
          end: endDate,
          location: typeof component.location === 'string' ? component.location : (component.location || ''),
          status: typeof component.status === 'string' ? component.status : 'CONFIRMED',
          sourceTimezone: sourceTimezone || undefined,
        };

        if (component.rrule) {
          event.recurrenceRule = component.rrule.toString();
        }

        events.push(event);
      }
    }

    return events;
  } catch (error) {
    throw new Error(`Error parsing ICS data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function parseICSFromUrlWithExpansion(icsUrl: string, startDate: Date, endDate: Date, targetTimeZone?: string): Promise<CalendarEvent[]> {
  return parseICSFromUrl(icsUrl).then(events => {
    
    const allExpandedEvents: CalendarEvent[] = [];
    
    events.forEach(event => {
      const expandedEvents = expandRecurringEvent(event, startDate, endDate);
      allExpandedEvents.push(...expandedEvents);
    });
    
    return allExpandedEvents;
  });
}

export function filterEventsForMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const filteredEvents = events.filter(event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    
    return (eventStart >= startOfMonth && eventStart <= endOfMonth) ||
           (eventEnd >= startOfMonth && eventEnd <= endOfMonth) ||
           (eventStart <= startOfMonth && eventEnd >= endOfMonth);
  });
  return filteredEvents;
}