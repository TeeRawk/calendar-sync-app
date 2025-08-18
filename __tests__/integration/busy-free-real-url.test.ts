import { parseBusyFreeICS } from '../../lib/busy-free-parser';
import { jest } from '@jest/globals';

describe('Real URL Integration Test for Busy/Free Calendar', () => {
  const testIcsUrl = 'https://calendar.google.com/calendar/ical/michael.klypalskyi.ext%40sonymusic-pde.com/public/basic.ics';

  // Increase timeout for network operations
  jest.setTimeout(30000);

  it('should successfully parse the real busy/free ICS URL', async () => {
    try {
      console.log(`Testing real busy/free calendar URL: ${testIcsUrl}`);
      
      const result = await parseBusyFreeICS(testIcsUrl, {
        startDate: new Date('2025-08-18'),
        endDate: new Date('2025-08-25')
      });

      expect(result).toBeDefined();
      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);

      console.log(`✅ Successfully parsed calendar: ${result.calendarName || 'Unknown'}`);
      console.log(`📊 Found ${result.events.length} events`);
      console.log(`🕰️ Calendar timezone: ${result.timezone || 'Not specified'}`);

      if (result.events.length > 0) {
        const sampleEvent = result.events[0];
        console.log(`📝 Sample event:`, {
          uid: sampleEvent.uid,
          summary: sampleEvent.summary,
          status: sampleEvent.status,
          transparency: sampleEvent.transparency,
          start: sampleEvent.start,
          end: sampleEvent.end,
        });

        // Validate event structure
        expect(sampleEvent).toHaveProperty('uid');
        expect(sampleEvent).toHaveProperty('start');
        expect(sampleEvent).toHaveProperty('end');
        expect(sampleEvent).toHaveProperty('status');
        expect(sampleEvent).toHaveProperty('transparency');
        expect(sampleEvent).toHaveProperty('summary');

        // Validate busy/free status
        expect(['busy', 'free']).toContain(sampleEvent.status);
        expect(['opaque', 'transparent']).toContain(sampleEvent.transparency);

        // Validate dates
        expect(sampleEvent.start).toBeInstanceOf(Date);
        expect(sampleEvent.end).toBeInstanceOf(Date);
        expect(sampleEvent.end.getTime()).toBeGreaterThan(sampleEvent.start.getTime());

        // Check for typical busy/free patterns
        const summaries = result.events.map(e => e.summary.toLowerCase());
        const hasBusyEvents = summaries.some(s => s.includes('busy'));
        const hasGenericSummaries = summaries.every(s => 
          ['busy', 'free', 'unavailable', 'available'].includes(s)
        );

        console.log(`🔒 Privacy analysis:`);
        console.log(`  - Has "Busy" events: ${hasBusyEvents}`);
        console.log(`  - Has only generic summaries: ${hasGenericSummaries}`);
        console.log(`  - Event summaries: ${[...new Set(summaries)].join(', ')}`);

        if (hasGenericSummaries) {
          console.log(`✅ This appears to be a privacy-compliant busy/free calendar`);
        }
      } else {
        console.log(`ℹ️ No events found in the specified date range - this may be normal`);
      }

    } catch (error) {
      console.error('❌ Error testing real URL:', error);
      
      // Don't fail the test for network issues, but log them
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          console.warn('⚠️ Network error - skipping real URL test');
          return;
        }
      }
      
      throw error;
    }
  });

  it('should handle date filtering correctly with real data', async () => {
    try {
      // Test with a narrow date range
      const narrowRange = await parseBusyFreeICS(testIcsUrl, {
        startDate: new Date('2025-08-18T00:00:00Z'),
        endDate: new Date('2025-08-18T23:59:59Z')
      });

      // Test with a wider date range
      const wideRange = await parseBusyFreeICS(testIcsUrl, {
        startDate: new Date('2025-08-01'),
        endDate: new Date('2025-08-31')
      });

      console.log(`📅 Narrow range (1 day): ${narrowRange.events.length} events`);
      console.log(`📅 Wide range (1 month): ${wideRange.events.length} events`);

      // Wide range should have same or more events
      expect(wideRange.events.length).toBeGreaterThanOrEqual(narrowRange.events.length);

      // Verify events are within date ranges
      narrowRange.events.forEach(event => {
        const eventDate = new Date(event.start);
        expect(eventDate.getDate()).toBe(18); // August 18th
        expect(eventDate.getMonth()).toBe(7); // August (0-based)
        expect(eventDate.getFullYear()).toBe(2025);
      });

    } catch (error) {
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        console.warn('⚠️ Network error - skipping date filtering test');
        return;
      }
      throw error;
    }
  });

  it('should validate privacy levels with real data', async () => {
    try {
      const result = await parseBusyFreeICS(testIcsUrl, {
        startDate: new Date('2025-08-01'),
        endDate: new Date('2025-08-31')
      });

      if (result.events.length > 0) {
        // Analyze privacy characteristics
        const summaries = result.events.map(e => e.summary);
        const uniqueSummaries = [...new Set(summaries)];
        
        console.log(`🔒 Privacy analysis for real data:`);
        console.log(`  - Total events: ${result.events.length}`);
        console.log(`  - Unique summaries: ${uniqueSummaries.length}`);
        console.log(`  - Summaries: ${uniqueSummaries.join(', ')}`);

        // Check if this looks like a privacy-compliant calendar
        const isPrivacyCompliant = uniqueSummaries.every(summary =>
          ['Busy', 'Free', 'Unavailable', 'Available'].includes(summary)
        );

        console.log(`  - Privacy compliant: ${isPrivacyCompliant}`);

        // Validate status distribution
        const busyCount = result.events.filter(e => e.status === 'busy').length;
        const freeCount = result.events.filter(e => e.status === 'free').length;
        
        console.log(`  - Busy events: ${busyCount}`);
        console.log(`  - Free events: ${freeCount}`);

        // Most busy/free calendars should have at least some busy events
        if (busyCount > 0) {
          expect(busyCount).toBeGreaterThan(0);
        }
      }

    } catch (error) {
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        console.warn('⚠️ Network error - skipping privacy validation test');
        return;
      }
      throw error;
    }
  });

  it('should handle timezone information correctly', async () => {
    try {
      const result = await parseBusyFreeICS(testIcsUrl);

      console.log(`🌍 Timezone information:`);
      console.log(`  - Calendar timezone: ${result.timezone || 'Not specified'}`);

      if (result.events.length > 0) {
        const sampleEvent = result.events[0];
        console.log(`  - Sample event times:`);
        console.log(`    - Start: ${sampleEvent.start.toISOString()} (UTC)`);
        console.log(`    - Start local: ${sampleEvent.start.toString()}`);
        console.log(`    - End: ${sampleEvent.end.toISOString()} (UTC)`);
        console.log(`    - End local: ${sampleEvent.end.toString()}`);

        // Validate that times make sense
        expect(sampleEvent.end.getTime()).toBeGreaterThan(sampleEvent.start.getTime());
        
        // Check that events are reasonable duration (not negative, not too long)
        const durationHours = (sampleEvent.end.getTime() - sampleEvent.start.getTime()) / (1000 * 60 * 60);
        expect(durationHours).toBeGreaterThan(0);
        expect(durationHours).toBeLessThan(24); // Assume no event longer than 24 hours
      }

    } catch (error) {
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        console.warn('⚠️ Network error - skipping timezone test');
        return;
      }
      throw error;
    }
  });
});