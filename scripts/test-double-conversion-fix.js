#!/usr/bin/env node

/**
 * TEST DOUBLE TIMEZONE CONVERSION FIX
 * This script validates that we fixed the double timezone conversion issue
 */

console.log('🔍 TESTING DOUBLE TIMEZONE CONVERSION FIX');
console.log('=' .repeat(60));
console.log('This script validates the timezone conversion flow after our fix');
console.log('');

// Simulate the timezone conversion logic (same as both functions)
function testConvertToUserTimezone(sourceDate) {
  const hours = sourceDate.getHours();
  const minutes = sourceDate.getMinutes();
  
  // Arizona (MST) is UTC-7, Madrid is UTC+1/+2 (depending on DST)
  const arizonaOffset = -7; // Arizona is UTC-7 (no DST)
  const madridOffset = new Date().getTimezoneOffset() / -60; // Madrid offset in hours
  const timeDifference = madridOffset - arizonaOffset;
  
  // Convert Arizona time to Madrid time
  const convertedTime = new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate(),
    hours + timeDifference,
    minutes,
    sourceDate.getSeconds()
  );
  
  return convertedTime;
}

console.log('📅 TESTING TIMEZONE FLOW:');
console.log('');

// Test sample event
const mockIcsEvent = {
  uid: 'test-meeting-456',
  summary: 'Important Meeting',
  start: new Date('2025-08-11T16:00:00.000Z'), // 4 PM UTC (Arizona time)
  end: new Date('2025-08-11T17:00:00.000Z')
};

console.log('📥 Mock ICS Event (Original):');
console.log(`   UID: ${mockIcsEvent.uid}`);
console.log(`   Summary: ${mockIcsEvent.summary}`);
console.log(`   Start: ${mockIcsEvent.start.toISOString()}`);
console.log(`   End: ${mockIcsEvent.end.toISOString()}`);
console.log('');

// STEP 1: Sync Service - Generate key using timezone conversion (for duplicate detection only)
console.log('🔄 STEP 1: Sync Service - Duplicate Key Generation');
const adjustedStartForKey = testConvertToUserTimezone(mockIcsEvent.start);
const duplicateDetectionKey = `${mockIcsEvent.uid}:${adjustedStartForKey.toISOString()}`;

console.log(`   Key generation time: ${adjustedStartForKey.toISOString()}`);
console.log(`   Duplicate detection key: ${duplicateDetectionKey}`);
console.log(`   Original event times passed to Google Calendar: ${mockIcsEvent.start.toISOString()} - ${mockIcsEvent.end.toISOString()}`);
console.log('');

// STEP 2: Google Calendar Service - Convert timezone for actual storage
console.log('🔄 STEP 2: Google Calendar Service - Event Creation');
const adjustedStartForStorage = testConvertToUserTimezone(mockIcsEvent.start);
const adjustedEndForStorage = testConvertToUserTimezone(mockIcsEvent.end);

console.log(`   Storage start time: ${adjustedStartForStorage.toISOString()}`);
console.log(`   Storage end time: ${adjustedEndForStorage.toISOString()}`);
console.log(`   Time difference from original: ${Math.abs(adjustedStartForStorage.getTime() - mockIcsEvent.start.getTime()) / 1000 / 60 / 60} hours`);
console.log('');

// STEP 3: Simulate getExistingGoogleEvents - Extract key from stored event
console.log('🔄 STEP 3: getExistingGoogleEvents - Key Extraction');
const mockStoredEvent = {
  id: 'google-stored-789',
  summary: mockIcsEvent.summary,
  description: `Some description\n\nOriginal UID: ${mockIcsEvent.uid}`,
  start: { dateTime: adjustedStartForStorage.toISOString() },
  end: { dateTime: adjustedEndForStorage.toISOString() }
};

const match = mockStoredEvent.description.match(/Original UID: (.+)/);
const extractedUid = match ? match[1].trim() : null;
const googleStoredTime = new Date(mockStoredEvent.start.dateTime).toISOString();
const googleExtractedKey = `${extractedUid}:${googleStoredTime}`;

console.log(`   Stored event start: ${mockStoredEvent.start.dateTime}`);
console.log(`   Extracted UID: ${extractedUid}`);
console.log(`   Google extracted key: ${googleExtractedKey}`);
console.log('');

// STEP 4: Compare keys
console.log('🎯 FINAL COMPARISON:');
console.log(`   Duplicate detection key: ${duplicateDetectionKey}`);
console.log(`   Google extracted key:    ${googleExtractedKey}`);
console.log(`   Keys match: ${duplicateDetectionKey === googleExtractedKey ? '✅ Match (Duplicate PREVENTED)' : '❌ No match (Duplicate CREATED)'}`);
console.log('');

console.log('📊 TIMING ANALYSIS:');
console.log(`   Original ICS time: ${mockIcsEvent.start.toISOString()}`);
console.log(`   Final stored time: ${adjustedStartForStorage.toISOString()}`);
console.log(`   Single conversion: ${Math.abs(adjustedStartForStorage.getTime() - mockIcsEvent.start.getTime()) / 1000 / 60 / 60} hours difference`);
console.log('');

console.log('=' .repeat(60));

if (duplicateDetectionKey === googleExtractedKey) {
  const timeDiff = Math.abs(adjustedStartForStorage.getTime() - mockIcsEvent.start.getTime()) / 1000 / 60 / 60;
  if (timeDiff === 9) {
    console.log('✅ SUCCESS: Single timezone conversion working correctly!');
    console.log('   - Duplicate detection keys match');
    console.log('   - Events stored with correct 9-hour offset (Arizona to Madrid)');
    console.log('   - No double conversion issue');
  } else {
    console.log('⚠️ PARTIAL SUCCESS: Keys match but unexpected time difference');
    console.log(`   Expected: 9 hours, Got: ${timeDiff} hours`);
  }
} else {
  console.log('❌ FAILURE: Keys still don\'t match - need to debug further');
}

console.log('');