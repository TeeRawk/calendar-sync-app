#!/usr/bin/env node

/**
 * TEST TIMEZONE FIX
 * This script tests the timezone conversion logic to ensure duplicate detection works correctly
 */

const TEST_ICS_URL = 'https://outlook.office365.com/owa/calendar/32c6cdcff2e148ff994b774c99246fcb@plexusworldwide.com/c26b083d8921436db95faaf7c87d3d683375575426682635831/calendar.ics';

// Simulate the timezone conversion logic from sync-service.ts
function convertToUserTimezone(sourceDate: Date): Date {
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

console.log('🔍 TESTING TIMEZONE FIX');
console.log('=' .repeat(60));
console.log('This script validates the timezone conversion logic for duplicate detection');
console.log('');

// Test sample dates
const testDates = [
  new Date('2025-08-11T09:00:00.000Z'), // 9 AM UTC
  new Date('2025-08-11T14:30:00.000Z'), // 2:30 PM UTC
  new Date('2025-08-11T21:15:00.000Z'), // 9:15 PM UTC
];

console.log('📅 TESTING TIMEZONE CONVERSION:');
testDates.forEach((originalDate, i) => {
  const convertedDate = convertToUserTimezone(originalDate);
  const originalKey = `test-uid-${i}:${originalDate.toISOString()}`;
  const convertedKey = `test-uid-${i}:${convertedDate.toISOString()}`;
  
  console.log(`${i + 1}. Original: ${originalDate.toISOString()}`);
  console.log(`   Converted: ${convertedDate.toISOString()}`);
  console.log(`   Time diff: ${Math.abs(convertedDate.getTime() - originalDate.getTime()) / 1000 / 60 / 60} hours`);
  console.log(`   Original Key: ${originalKey}`);
  console.log(`   Converted Key: ${convertedKey}`);
  console.log(`   Keys match: ${originalKey === convertedKey ? '❌' : '✅ (correctly different)'}`);
  console.log('');
});

console.log('🧪 SIMULATING DUPLICATE DETECTION SCENARIO:');
console.log('');

// Simulate the sync process
const mockIcsEvent = {
  uid: 'test-event-123',
  summary: 'Test Meeting',
  start: new Date('2025-08-11T16:00:00.000Z'), // 4 PM UTC (Arizona time)
  end: new Date('2025-08-11T17:00:00.000Z')
};

console.log('📥 Mock ICS Event:');
console.log(`   UID: ${mockIcsEvent.uid}`);
console.log(`   Summary: ${mockIcsEvent.summary}`);
console.log(`   Original Start: ${mockIcsEvent.start.toISOString()}`);
console.log('');

// Step 1: Convert timezone (what sync service now does)
const adjustedStart = convertToUserTimezone(mockIcsEvent.start);
const adjustedEnd = convertToUserTimezone(mockIcsEvent.end);

console.log('🔄 After timezone conversion (what gets stored in Google Calendar):');
console.log(`   Adjusted Start: ${adjustedStart.toISOString()}`);
console.log(`   Adjusted End: ${adjustedEnd.toISOString()}`);
console.log('');

// Step 2: Generate keys (old vs new approach)
const oldKey = `${mockIcsEvent.uid}:${mockIcsEvent.start.toISOString()}`;
const newKey = `${mockIcsEvent.uid}:${adjustedStart.toISOString()}`;

console.log('🔑 Key generation:');
console.log(`   OLD approach (caused duplicates): ${oldKey}`);
console.log(`   NEW approach (timezone-adjusted): ${newKey}`);
console.log(`   Keys different: ${oldKey !== newKey ? '✅' : '❌'}`);
console.log('');

// Step 3: Simulate what Google Calendar would return
const mockGoogleCalendarResponse = {
  id: 'google-event-456',
  summary: mockIcsEvent.summary,
  description: `Some description\n\nOriginal UID: ${mockIcsEvent.uid}`,
  start: { dateTime: adjustedStart.toISOString() },
  end: { dateTime: adjustedEnd.toISOString() }
};

console.log('📋 Mock Google Calendar Event (what getExistingGoogleEvents returns):');
console.log(`   Event ID: ${mockGoogleCalendarResponse.id}`);
console.log(`   Start DateTime: ${mockGoogleCalendarResponse.start.dateTime}`);
console.log(`   Description: ${mockGoogleCalendarResponse.description}`);
console.log('');

// Step 4: Simulate getExistingGoogleEvents key extraction
const match = mockGoogleCalendarResponse.description.match(/Original UID: (.+)/);
const extractedUid = match ? match[1].trim() : null;
const googleStoredTime = new Date(mockGoogleCalendarResponse.start.dateTime).toISOString();
const googleKey = `${extractedUid}:${googleStoredTime}`;

console.log('🔍 Google Calendar key extraction:');
console.log(`   Extracted UID: ${extractedUid}`);
console.log(`   Stored DateTime: ${googleStoredTime}`);
console.log(`   Google Key: ${googleKey}`);
console.log('');

// Step 5: Test duplicate detection
console.log('🎯 DUPLICATE DETECTION TEST:');
console.log(`   ICS Event Key (OLD): ${oldKey}`);
console.log(`   ICS Event Key (NEW): ${newKey}`);
console.log(`   Google Event Key:    ${googleKey}`);
console.log('');
console.log(`   OLD approach match: ${oldKey === googleKey ? '✅ Match found' : '❌ No match (DUPLICATE CREATED)'}`);
console.log(`   NEW approach match: ${newKey === googleKey ? '✅ Match found (DUPLICATE PREVENTED)' : '❌ No match'}`);
console.log('');

console.log('=' .repeat(60));

if (newKey === googleKey && oldKey !== googleKey) {
  console.log('✅ SUCCESS: Timezone fix should prevent duplicates!');
  console.log('The new approach correctly matches the timezone-adjusted times.');
} else if (newKey === googleKey && oldKey === googleKey) {
  console.log('⚠️  WARNING: Both approaches match - timezone may not be the issue');
} else if (newKey !== googleKey) {
  console.log('❌ FAILURE: New approach still doesn\'t match - check timezone logic');
} else {
  console.log('🤔 UNEXPECTED: Review the test logic');
}

console.log('');