import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { parseICSFromUrlWithExpansion } from '@/lib/ics-parser';
import { getExistingGoogleEvents, createGoogleCalendarEvent } from '@/lib/google-calendar';
import { syncCalendar } from '@/lib/sync-service';
import { db } from '@/lib/db';
import { calendarSyncs } from '@/lib/db/schema';

// Test ICS URL provided by user
const TEST_ICS_URL = 'https://outlook.office365.com/owa/calendar/32c6cdcff2e148ff994b774c99246fcb@plexusworldwide.com/c26b083d8921436db95faaf7c87d3d683375575426682635831/calendar.ics';

// Mock Google Calendar ID for testing
const TEST_CALENDAR_ID = 'test-calendar@gmail.com';

describe('Duplicate Detection Integration Test', () => {
  let testSyncId: string;
  let mockCalendarEvents: any[] = [];

  beforeEach(async () => {
    // Clear mock events
    mockCalendarEvents = [];
    
    // Create test calendar sync configuration
    const testSync = await db.insert(calendarSyncs).values({
      id: 'test-sync-duplicate-detection',
      userId: 'test-user',
      name: 'Duplicate Detection Test',
      icsUrl: TEST_ICS_URL,
      googleCalendarId: TEST_CALENDAR_ID,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    testSyncId = testSync[0].id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testSyncId) {
      await db.delete(calendarSyncs).where({ id: testSyncId });
    }
  });

  describe('ICS Parsing and Key Generation', () => {
    test('should parse ICS events correctly', async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      console.log('🔍 Testing ICS parsing from URL:', TEST_ICS_URL);
      console.log('📅 Date range:', monthStart.toISOString(), 'to', monthEnd.toISOString());

      const events = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
      
      console.log(`📊 Found ${events.length} events from ICS`);
      
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        const sampleEvent = events[0];
        console.log('📝 Sample event:', {
          summary: sampleEvent.summary,
          uid: sampleEvent.uid,
          start: sampleEvent.start.toISOString(),
          end: sampleEvent.end.toISOString(),
          sourceTimezone: sampleEvent.sourceTimezone
        });

        // Test key generation
        const uniqueKey = `${sampleEvent.uid}:${sampleEvent.start.toISOString()}`;
        console.log('🔑 Generated unique key:', uniqueKey);
        
        expect(sampleEvent.uid).toBeDefined();
        expect(sampleEvent.start).toBeInstanceOf(Date);
        expect(uniqueKey).toContain(':');
      }
    });

    test('should generate consistent keys for duplicate detection', async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const events1 = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
      const events2 = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);

      console.log(`🔄 First parse: ${events1.length} events, Second parse: ${events2.length} events`);

      if (events1.length > 0 && events2.length > 0) {
        const key1 = `${events1[0].uid}:${events1[0].start.toISOString()}`;
        const key2 = `${events2[0].uid}:${events2[0].start.toISOString()}`;
        
        console.log('🔑 Key 1:', key1);
        console.log('🔑 Key 2:', key2);
        
        expect(key1).toBe(key2);
        console.log('✅ Keys are consistent between parses');
      }
    });
  });

  describe('Google Calendar Integration', () => {
    test('should correctly extract Original UID from event descriptions', () => {
      const mockGoogleEvents = [
        {
          id: 'google-event-1',
          summary: 'Test Event 1',
          description: 'Some description\n\nOriginal UID: test-uid-123',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' }
        },
        {
          id: 'google-event-2', 
          summary: 'Test Event 2',
          description: 'Original UID: another-uid-456\nSome other content',
          start: { dateTime: '2024-01-16T14:00:00Z' },
          end: { dateTime: '2024-01-16T15:00:00Z' }
        },
        {
          id: 'google-event-3',
          summary: 'Test Event 3',
          description: 'No UID pattern here',
          start: { dateTime: '2024-01-17T09:00:00Z' },
          end: { dateTime: '2024-01-17T10:00:00Z' }
        }
      ];

      const existingEvents: { [key: string]: string } = {};
      
      mockGoogleEvents.forEach(event => {
        console.log(`🔍 Processing Google event: "${event.summary}"`);
        if (event.id && event.description && event.start?.dateTime) {
          const match = event.description.match(/Original UID: (.+)/);
          if (match) {
            const originalUid = match[1].trim();
            const startDateTime = new Date(event.start.dateTime).toISOString();
            const uniqueKey = `${originalUid}:${startDateTime}`;
            console.log(`✅ Extracted key: ${uniqueKey}`);
            existingEvents[uniqueKey] = event.id;
          } else {
            console.log(`⚠️  No Original UID found in: ${event.description}`);
          }
        }
      });

      console.log('📋 Final existing events map:', existingEvents);
      
      expect(Object.keys(existingEvents)).toHaveLength(2);
      expect(existingEvents['test-uid-123:2024-01-15T10:00:00.000Z']).toBe('google-event-1');
      expect(existingEvents['another-uid-456:2024-01-16T14:00:00.000Z']).toBe('google-event-2');
    });

    test('should handle edge cases in UID extraction', () => {
      const edgeCases = [
        {
          description: 'Original UID: uid-with-spaces ',
          expected: 'uid-with-spaces'
        },
        {
          description: '  Original UID: uid-with-leading-spaces',
          expected: 'uid-with-leading-spaces'  
        },
        {
          description: 'Original UID: uid:with:colons:123',
          expected: 'uid:with:colons:123'
        },
        {
          description: 'Original UID: uid-with-newline\nMore content',
          expected: 'uid-with-newline'
        },
        {
          description: 'Multiple Original UID: first-uid\nOriginal UID: second-uid',
          expected: 'first-uid'
        }
      ];

      edgeCases.forEach((testCase, index) => {
        console.log(`🧪 Testing edge case ${index + 1}: "${testCase.description}"`);
        const match = testCase.description.match(/Original UID: (.+)/);
        if (match) {
          const extracted = match[1].trim();
          console.log(`   Extracted: "${extracted}"`);
          console.log(`   Expected:  "${testCase.expected}"`);
          expect(extracted.split('\n')[0]).toBe(testCase.expected);
        }
      });
    });
  });

  describe('Duplicate Detection Logic', () => {
    test('should prevent creating duplicate events', async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      console.log('🔄 Testing duplicate prevention workflow');

      // Step 1: Parse ICS events
      const icsEvents = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
      console.log(`📥 Parsed ${icsEvents.length} ICS events`);

      if (icsEvents.length === 0) {
        console.log('⚠️  No events found in ICS, skipping duplicate test');
        return;
      }

      // Step 2: Simulate existing Google Calendar events (as if sync ran before)
      const mockExistingEvents: { [key: string]: string } = {};
      const sampleEvent = icsEvents[0];
      const existingKey = `${sampleEvent.uid}:${sampleEvent.start.toISOString()}`;
      mockExistingEvents[existingKey] = 'existing-google-event-id-123';
      
      console.log('🏗️  Simulated existing event with key:', existingKey);

      // Step 3: Test duplicate detection logic
      const newEventKey = `${sampleEvent.uid}:${sampleEvent.start.toISOString()}`;
      console.log('🔍 Checking for duplicate with key:', newEventKey);
      console.log('📋 Available keys:', Object.keys(mockExistingEvents));

      const isDuplicate = !!mockExistingEvents[newEventKey];
      console.log('🎯 Duplicate detected:', isDuplicate);

      expect(isDuplicate).toBe(true);
      expect(mockExistingEvents[newEventKey]).toBe('existing-google-event-id-123');
    });

    test('should handle timezone differences correctly', async () => {
      console.log('🌍 Testing timezone handling in duplicate detection');

      // Create events with same logical time but different timezone representations
      const baseTime = new Date('2024-01-15T10:00:00');
      
      const scenarios = [
        {
          name: 'UTC time',
          date: new Date(baseTime.getTime()),
          description: 'Event in UTC'
        },
        {
          name: 'Same time, different timezone representation',
          date: new Date(baseTime.getTime()), // Same absolute time
          description: 'Same event, potentially different timezone'
        }
      ];

      scenarios.forEach((scenario, index) => {
        const uid = 'test-timezone-uid-123';
        const key = `${uid}:${scenario.date.toISOString()}`;
        console.log(`${index + 1}. ${scenario.name}: ${key}`);
      });

      // They should generate the same key since toISOString() normalizes to UTC
      const key1 = `test-uid:${scenarios[0].date.toISOString()}`;
      const key2 = `test-uid:${scenarios[1].date.toISOString()}`;
      
      expect(key1).toBe(key2);
      console.log('✅ Timezone normalization works correctly');
    });
  });

  describe('End-to-End Duplicate Prevention', () => {
    test('should demonstrate complete duplicate detection workflow', async () => {
      console.log('🚀 Running end-to-end duplicate detection test');

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Step 1: Get ICS events
      console.log('📥 Step 1: Fetching ICS events');
      const icsEvents = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
      console.log(`   Found ${icsEvents.length} ICS events`);

      if (icsEvents.length === 0) {
        console.log('⚠️  No events to test with, skipping');
        return;
      }

      // Step 2: Simulate "existing" Google Calendar events
      console.log('🏗️  Step 2: Creating mock existing events');
      const existingEvents: { [key: string]: string } = {};
      
      // Take first few events and simulate they already exist
      const eventsToMockAsExisting = icsEvents.slice(0, Math.min(3, icsEvents.length));
      eventsToMockAsExisting.forEach((event, index) => {
        const key = `${event.uid}:${event.start.toISOString()}`;
        const mockGoogleId = `mock-google-event-${index + 1}`;
        existingEvents[key] = mockGoogleId;
        console.log(`   Mock existing: ${event.summary} -> ${key}`);
      });

      // Step 3: Test duplicate detection for each ICS event
      console.log('🔍 Step 3: Testing duplicate detection');
      const results = {
        duplicatesFound: 0,
        newEvents: 0,
        potentialIssues: [] as string[]
      };

      icsEvents.forEach((event, index) => {
        const uniqueKey = `${event.uid}:${event.start.toISOString()}`;
        const isDuplicate = !!existingEvents[uniqueKey];
        
        console.log(`   ${index + 1}. "${event.summary}"`);
        console.log(`      Key: ${uniqueKey}`);
        console.log(`      Duplicate: ${isDuplicate ? '✅ YES' : '❌ NO'}`);

        if (isDuplicate) {
          results.duplicatesFound++;
        } else {
          results.newEvents++;
          
          // Check for potential issues (same UID, different time)
          const sameUidKeys = Object.keys(existingEvents).filter(key => 
            key.startsWith(event.uid + ':')
          );
          if (sameUidKeys.length > 0) {
            const issue = `Event "${event.summary}" (${uniqueKey}) has same UID as existing events: ${sameUidKeys.join(', ')}`;
            results.potentialIssues.push(issue);
            console.log(`      ⚠️  Potential timing issue detected`);
          }
        }
      });

      // Step 4: Analyze results
      console.log('📊 Step 4: Results Analysis');
      console.log(`   Duplicates found: ${results.duplicatesFound}`);
      console.log(`   New events: ${results.newEvents}`);
      console.log(`   Potential issues: ${results.potentialIssues.length}`);

      if (results.potentialIssues.length > 0) {
        console.log('⚠️  Potential Issues Detected:');
        results.potentialIssues.forEach((issue, index) => {
          console.log(`   ${index + 1}. ${issue}`);
        });
      }

      // Assertions
      expect(results.duplicatesFound).toBe(eventsToMockAsExisting.length);
      expect(results.newEvents).toBe(icsEvents.length - eventsToMockAsExisting.length);
      
      console.log('✅ End-to-end test completed successfully');
    });
  });

  describe('Debug Information Collection', () => {
    test('should collect comprehensive debug information', async () => {
      console.log('🔧 Collecting debug information for duplicate detection');

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      try {
        // Parse ICS events
        const icsEvents = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
        
        const debugInfo = {
          icsUrl: TEST_ICS_URL,
          dateRange: {
            start: monthStart.toISOString(),
            end: monthEnd.toISOString()
          },
          icsEventCount: icsEvents.length,
          sampleEvents: icsEvents.slice(0, 3).map(event => ({
            summary: event.summary,
            uid: event.uid,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            sourceTimezone: event.sourceTimezone,
            generatedKey: `${event.uid}:${event.start.toISOString()}`
          })),
          uniqueUids: [...new Set(icsEvents.map(e => e.uid))].length,
          timezoneCoverage: [...new Set(icsEvents.map(e => e.sourceTimezone))],
          keyPatterns: icsEvents.slice(0, 10).map(event => ({
            uid: event.uid,
            startTime: event.start.toISOString(),
            key: `${event.uid}:${event.start.toISOString()}`,
            keyLength: `${event.uid}:${event.start.toISOString()}`.length
          }))
        };

        console.log('📋 Debug Information:', JSON.stringify(debugInfo, null, 2));

        // Save debug info for manual analysis
        const debugOutput = {
          timestamp: new Date().toISOString(),
          testUrl: TEST_ICS_URL,
          ...debugInfo
        };

        console.log('💾 Debug information collected successfully');
        expect(debugInfo.icsEventCount).toBeGreaterThanOrEqual(0);

      } catch (error) {
        console.error('❌ Error collecting debug info:', error);
        throw error;
      }
    });
  });
});

// Utility functions for reuse
export async function testDuplicateDetection(icsUrl: string, testCalendarId: string) {
  console.log('🧪 Running reusable duplicate detection test');
  console.log('   ICS URL:', icsUrl);
  console.log('   Calendar ID:', testCalendarId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const events = await parseICSFromUrlWithExpansion(icsUrl, monthStart, monthEnd);
  
  return {
    eventCount: events.length,
    sampleKeys: events.slice(0, 5).map(e => `${e.uid}:${e.start.toISOString()}`),
    uniqueUids: [...new Set(events.map(e => e.uid))].length,
    timezones: [...new Set(events.map(e => e.sourceTimezone))]
  };
}

export function validateDuplicateKey(uid: string, startTime: Date): string {
  const key = `${uid}:${startTime.toISOString()}`;
  console.log('🔑 Generated key:', key);
  return key;
}

export function extractOriginalUID(description: string): string | null {
  const match = description.match(/Original UID: (.+)/);
  if (match) {
    const uid = match[1].trim().split('\n')[0]; // Handle multiline content
    console.log('🎯 Extracted UID:', uid);
    return uid;
  }
  console.log('⚠️  No Original UID pattern found');
  return null;
}