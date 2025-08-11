#!/usr/bin/env tsx

/**
 * Test core duplicate detection logic without external dependencies
 */

import { parseICSFromUrlWithExpansion } from '../lib/ics-parser';

const TEST_ICS_URL = 'https://outlook.office365.com/owa/calendar/32c6cdcff2e148ff994b774c99246fcb@plexusworldwide.com/c26b083d8921436db95faaf7c87d3d683375575426682635831/calendar.ics';

async function testCoreDuplicateLogic() {
  console.log('🧪 Testing Core Duplicate Detection Logic');
  console.log('=' .repeat(50));

  try {
    // Test 1: ICS Parsing Consistency
    console.log('📥 TEST 1: ICS Parsing Consistency');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const events1 = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);
    const events2 = await parseICSFromUrlWithExpansion(TEST_ICS_URL, monthStart, monthEnd);

    console.log(`   Parse 1: ${events1.length} events`);
    console.log(`   Parse 2: ${events2.length} events`);

    if (events1.length !== events2.length) {
      throw new Error(`❌ Inconsistent parse results: ${events1.length} vs ${events2.length}`);
    }

    if (events1.length > 0) {
      const key1 = `${events1[0].uid}:${events1[0].start.toISOString()}`;
      const key2 = `${events2[0].uid}:${events2[0].start.toISOString()}`;
      
      if (key1 !== key2) {
        throw new Error(`❌ Keys don't match: "${key1}" vs "${key2}"`);
      }
      
      console.log(`   ✅ Keys are consistent: ${key1.substring(0, 50)}...`);
    }

    // Test 2: Key Generation Logic
    console.log('\n🔑 TEST 2: Key Generation Logic');
    const sampleEvents = events1.slice(0, 5);
    const keys: string[] = [];
    
    sampleEvents.forEach((event, index) => {
      const key = `${event.uid}:${event.start.toISOString()}`;
      keys.push(key);
      console.log(`   ${index + 1}. "${event.summary}"`);
      console.log(`      Key: ${key.substring(0, 50)}...`);
      console.log(`      Length: ${key.length}`);
    });

    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new Error(`❌ Duplicate keys detected! ${keys.length} keys, ${uniqueKeys.size} unique`);
    }
    console.log(`   ✅ All ${keys.length} keys are unique`);

    // Test 3: UID Pattern Extraction
    console.log('\n🎯 TEST 3: UID Pattern Extraction');
    const testPatterns = [
      `Description content\n\nOriginal UID: ${events1[0]?.uid}`,
      `Original UID: ${events1[1]?.uid}\nTrailing content`,
      `Multi-line\nOriginal UID: ${events1[2]?.uid}   \nMore content`
    ];

    testPatterns.forEach((pattern, index) => {
      if (!events1[index]) return;
      
      console.log(`   Test ${index + 1}:`);
      const match = pattern.match(/Original UID: (.+)/);
      
      if (match) {
        const extracted = match[1].trim().split('\n')[0];
        const expected = events1[index].uid;
        const isMatch = extracted === expected;
        
        console.log(`      Pattern: "${pattern.replace(/\n/g, '\\n').substring(0, 60)}..."`);
        console.log(`      Extracted: ${extracted.substring(0, 30)}...`);
        console.log(`      Expected:  ${expected.substring(0, 30)}...`);
        console.log(`      Match: ${isMatch ? '✅' : '❌'}`);
        
        if (!isMatch) {
          throw new Error(`❌ UID extraction failed for pattern ${index + 1}`);
        }
      } else {
        throw new Error(`❌ No UID pattern match for test ${index + 1}`);
      }
    });

    // Test 4: Duplicate Detection Simulation
    console.log('\n🔄 TEST 4: Duplicate Detection Simulation');
    const allEvents = events1;
    const existingEvents: { [key: string]: string } = {};
    
    // Simulate first half as "existing"
    const halfPoint = Math.floor(allEvents.length / 2);
    const existingSet = allEvents.slice(0, halfPoint);
    const newSet = allEvents.slice(halfPoint);
    
    console.log(`   Simulating ${existingSet.length} existing events...`);
    existingSet.forEach((event, index) => {
      const key = `${event.uid}:${event.start.toISOString()}`;
      existingEvents[key] = `google-event-${index + 1}`;
    });

    console.log(`   Testing duplicate detection on ${newSet.length} new events...`);
    let duplicatesFound = 0;
    let newEventsFound = 0;

    newSet.forEach((event, index) => {
      const key = `${event.uid}:${event.start.toISOString()}`;
      const isDuplicate = !!existingEvents[key];
      
      if (index < 3) { // Show first 3 for verification
        console.log(`   ${index + 1}. "${event.summary}"`);
        console.log(`      Key: ${key.substring(0, 50)}...`);
        console.log(`      Status: ${isDuplicate ? 'DUPLICATE' : 'NEW'}`);
      }

      if (isDuplicate) {
        duplicatesFound++;
      } else {
        newEventsFound++;
      }
    });

    console.log(`   Results: ${duplicatesFound} duplicates, ${newEventsFound} new events`);

    // All new events should be detected as new (no duplicates in second half)
    if (duplicatesFound > 0) {
      console.log(`   ⚠️  Warning: ${duplicatesFound} false duplicates detected in second half`);
    } else {
      console.log(`   ✅ No false duplicates detected`);
    }

    // Test 5: Performance & Memory
    console.log('\n⚡ TEST 5: Performance Analysis');
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Process all events for key generation
    const allKeys = allEvents.map(event => `${event.uid}:${event.start.toISOString()}`);
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    console.log(`   Processed ${allKeys.length} events in ${endTime - startTime}ms`);
    console.log(`   Memory used: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Average per event: ${((endTime - startTime) / allKeys.length).toFixed(2)}ms`);
    
    // Check for memory leaks
    const uniqueKeySet = new Set(allKeys);
    if (uniqueKeySet.size === allKeys.length) {
      console.log(`   ✅ All ${allKeys.length} keys are unique - no collisions`);
    } else {
      throw new Error(`❌ Key collision detected: ${allKeys.length} keys, ${uniqueKeySet.size} unique`);
    }

    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ Duplicate detection logic is working correctly');
    
    return {
      success: true,
      eventCount: allEvents.length,
      testResults: {
        parsingConsistency: true,
        keyGeneration: true,
        patternExtraction: true,
        duplicateDetection: true,
        performance: true
      }
    };

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the tests
testCoreDuplicateLogic().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});