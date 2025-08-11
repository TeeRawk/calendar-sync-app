#!/usr/bin/env tsx

/**
 * Standalone duplicate detection test script
 * Usage: npx tsx scripts/test-duplicate-detection.ts
 */

import { parseICSFromUrlWithExpansion } from '../lib/ics-parser';

const TEST_ICS_URL = 'https://outlook.office365.com/owa/calendar/32c6cdcff2e148ff994b774c99246fcb@plexusworldwide.com/c26b083d8921436db95faaf7c87d3d683375575426682635831/calendar.ics';

async function testDuplicateDetection() {
  console.log('🚀 Testing Duplicate Detection Logic');
  console.log('=' .repeat(50));
  
  try {
    // Set up date range for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    console.log('📅 Date Range:');
    console.log(`   Start: ${monthStart.toISOString()}`);
    console.log(`   End:   ${monthEnd.toISOString()}`);
    console.log('');

    // Step 1: Parse ICS events
    console.log('📥 Step 1: Parsing ICS Events');
    console.log(`   URL: ${TEST_ICS_URL}`);
    
    const events = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
    
    console.log(`   ✅ Found ${events.length} events`);
    console.log('');

    if (events.length === 0) {
      console.log('⚠️  No events found in the specified date range');
      return;
    }

    // Step 2: Analyze event structure
    console.log('🔍 Step 2: Event Analysis');
    const uniqueUids = new Set(events.map(e => e.uid));
    const timezones = new Set(events.map(e => e.sourceTimezone));
    
    console.log(`   Total events: ${events.length}`);
    console.log(`   Unique UIDs: ${uniqueUids.size}`);
    console.log(`   Timezones: ${Array.from(timezones).join(', ')}`);
    console.log('');

    // Step 3: Show sample events and their keys
    console.log('📝 Step 3: Sample Events and Key Generation');
    const sampleEvents = events.slice(0, 5);
    
    sampleEvents.forEach((event, index) => {
      const uniqueKey = `${event.uid}:${event.start.toISOString()}`;
      console.log(`   ${index + 1}. "${event.summary}"`);
      console.log(`      UID: ${event.uid}`);
      console.log(`      Start: ${event.start.toISOString()}`);
      console.log(`      Timezone: ${event.sourceTimezone}`);
      console.log(`      Key: ${uniqueKey}`);
      console.log(`      Key Length: ${uniqueKey.length}`);
      console.log('');
    });

    // Step 4: Simulate existing events and test duplicate detection
    console.log('🎯 Step 4: Duplicate Detection Simulation');
    
    // Create mock existing events from first half of events
    const existingEvents: { [key: string]: string } = {};
    const halfwayPoint = Math.floor(events.length / 2);
    const mockExistingEvents = events.slice(0, halfwayPoint);
    
    console.log(`   Creating ${mockExistingEvents.length} mock existing events...`);
    
    mockExistingEvents.forEach((event, index) => {
      const key = `${event.uid}:${event.start.toISOString()}`;
      existingEvents[key] = `mock-google-event-${index + 1}`;
    });
    
    console.log(`   Mock existing events created: ${Object.keys(existingEvents).length}`);
    console.log('');

    // Test duplicate detection for all events
    console.log('   Testing duplicate detection:');
    let duplicatesFound = 0;
    let newEvents = 0;
    let potentialIssues = 0;
    
    events.forEach((event, index) => {
      const uniqueKey = `${event.uid}:${event.start.toISOString()}`;
      const isDuplicate = !!existingEvents[uniqueKey];
      
      if (index < 10) { // Show detailed results for first 10 events
        console.log(`   ${index + 1}. "${event.summary}"`);
        console.log(`      Key: ${uniqueKey}`);
        console.log(`      Status: ${isDuplicate ? '🔄 DUPLICATE (would update)' : '➕ NEW (would create)'}`);
        if (isDuplicate) {
          console.log(`      Google ID: ${existingEvents[uniqueKey]}`);
        }
        console.log('');
      }
      
      if (isDuplicate) {
        duplicatesFound++;
      } else {
        newEvents++;
        
        // Check for potential timing issues (same UID, different time)
        const sameUidKeys = Object.keys(existingEvents).filter(key => 
          key.startsWith(event.uid + ':')
        );
        if (sameUidKeys.length > 0) {
          potentialIssues++;
          if (index < 5) { // Show details for first few potential issues
            console.log(`      ⚠️  TIMING ISSUE: Same UID with different times:`);
            sameUidKeys.forEach(key => {
              const [uid, timeStr] = key.split(':');
              const timeDiff = new Date(timeStr).getTime() - event.start.getTime();
              console.log(`         Existing: ${key} (${timeDiff}ms difference)`);
            });
            console.log('');
          }
        }
      }
    });

    // Step 5: Results Summary
    console.log('📊 Step 5: Results Summary');
    console.log(`   Total events processed: ${events.length}`);
    console.log(`   Duplicates found: ${duplicatesFound}`);
    console.log(`   New events: ${newEvents}`);
    console.log(`   Potential timing issues: ${potentialIssues}`);
    console.log('');

    // Step 6: Key format analysis
    console.log('🔑 Step 6: Key Format Analysis');
    const allKeys = events.map(e => `${e.uid}:${e.start.toISOString()}`);
    const keyLengths = allKeys.map(k => k.length);
    const avgKeyLength = keyLengths.reduce((a, b) => a + b, 0) / keyLengths.length;
    
    console.log(`   Average key length: ${avgKeyLength.toFixed(2)}`);
    console.log(`   Min key length: ${Math.min(...keyLengths)}`);
    console.log(`   Max key length: ${Math.max(...keyLengths)}`);
    
    // Check for potential key collisions
    const keySet = new Set(allKeys);
    if (keySet.size !== allKeys.length) {
      console.log(`   ⚠️  KEY COLLISION DETECTED! ${allKeys.length - keySet.size} duplicate keys found`);
      
      // Find duplicates
      const keyCount: { [key: string]: number } = {};
      allKeys.forEach(key => {
        keyCount[key] = (keyCount[key] || 0) + 1;
      });
      
      const duplicateKeys = Object.entries(keyCount).filter(([_, count]) => count > 1);
      console.log('   Duplicate keys:');
      duplicateKeys.forEach(([key, count]) => {
        console.log(`     "${key}" appears ${count} times`);
      });
    } else {
      console.log(`   ✅ All keys are unique (${keySet.size} unique keys)`);
    }
    console.log('');

    // Step 7: Regex pattern testing
    console.log('🎯 Step 7: Original UID Pattern Testing');
    const testDescriptions = [
      `Sample description\n\nOriginal UID: ${events[0]?.uid}`,
      `Original UID: ${events[1]?.uid}\nMore content here`,
      `Multiple lines\nOriginal UID: ${events[2]?.uid}   \nTrailing content`
    ];

    testDescriptions.forEach((desc, index) => {
      if (!events[index]) return;
      
      console.log(`   Test ${index + 1}:`);
      console.log(`     Description: "${desc.replace(/\n/g, '\\n')}"`);
      
      const match = desc.match(/Original UID: (.+)/);
      if (match) {
        const extractedUid = match[1].trim();
        const expectedUid = events[index].uid;
        const matches = extractedUid === expectedUid;
        
        console.log(`     Extracted: "${extractedUid}"`);
        console.log(`     Expected:  "${expectedUid}"`);
        console.log(`     Match: ${matches ? '✅' : '❌'}`);
      } else {
        console.log(`     ❌ No match found`);
      }
      console.log('');
    });

    console.log('✅ Duplicate detection test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testDuplicateDetection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});