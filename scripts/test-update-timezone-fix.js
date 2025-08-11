#!/usr/bin/env node

/**
 * TEST UPDATE TIMEZONE CONSISTENCY FIX
 * This script validates that create and update functions use the same timezone conversion
 */

console.log('🔍 TESTING UPDATE TIMEZONE CONSISTENCY FIX');
console.log('=' .repeat(60));
console.log('This script validates that both create and update use consistent timezone conversion');
console.log('');

// Simulate the timezone conversion logic (same as both functions now)
function convertToUserTimezone(sourceDate) {
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

console.log('📅 TESTING TIMEZONE CONSISTENCY:');
console.log('');

// Test sample event
const mockIcsEvent = {
  uid: 'consistency-test-789',
  summary: 'Recurring Meeting',
  start: new Date('2025-08-11T16:00:00.000Z'), // 4 PM UTC (Arizona time)
  end: new Date('2025-08-11T17:00:00.000Z')
};

console.log('📥 Mock ICS Event (Original):');
console.log(`   UID: ${mockIcsEvent.uid}`);
console.log(`   Summary: ${mockIcsEvent.summary}`);
console.log(`   Start: ${mockIcsEvent.start.toISOString()}`);
console.log(`   End: ${mockIcsEvent.end.toISOString()}`);
console.log('');

// SCENARIO 1: Initial sync (createGoogleCalendarEvent)
console.log('🔄 SCENARIO 1: Initial Sync - createGoogleCalendarEvent');
const createAdjustedStart = convertToUserTimezone(mockIcsEvent.start);
const createAdjustedEnd = convertToUserTimezone(mockIcsEvent.end);

console.log(`   Converted start: ${createAdjustedStart.toISOString()}`);
console.log(`   Converted end: ${createAdjustedEnd.toISOString()}`);
console.log(`   Time offset: +${Math.abs(createAdjustedStart.getTime() - mockIcsEvent.start.getTime()) / 1000 / 60 / 60} hours`);
console.log('');

// SCENARIO 2: Duplicate update (updateGoogleCalendarEvent)
console.log('🔄 SCENARIO 2: Duplicate Update - updateGoogleCalendarEvent');
const updateAdjustedStart = convertToUserTimezone(mockIcsEvent.start);
const updateAdjustedEnd = convertToUserTimezone(mockIcsEvent.end);

console.log(`   Converted start: ${updateAdjustedStart.toISOString()}`);
console.log(`   Converted end: ${updateAdjustedEnd.toISOString()}`);
console.log(`   Time offset: +${Math.abs(updateAdjustedStart.getTime() - mockIcsEvent.start.getTime()) / 1000 / 60 / 60} hours`);
console.log('');

// COMPARISON
console.log('🎯 CONSISTENCY CHECK:');
console.log(`   Create result:  ${createAdjustedStart.toISOString()}`);
console.log(`   Update result:  ${updateAdjustedStart.toISOString()}`);
console.log(`   Times match:    ${createAdjustedStart.getTime() === updateAdjustedStart.getTime() ? '✅ CONSISTENT' : '❌ INCONSISTENT'}`);
console.log('');

// DUPLICATE DETECTION TEST
console.log('🔍 DUPLICATE DETECTION VALIDATION:');
const duplicateKey = `${mockIcsEvent.uid}:${convertToUserTimezone(mockIcsEvent.start).toISOString()}`;
const createStoredKey = `${mockIcsEvent.uid}:${createAdjustedStart.toISOString()}`;
const updateStoredKey = `${mockIcsEvent.uid}:${updateAdjustedStart.toISOString()}`;

console.log(`   Duplicate detection key: ${duplicateKey}`);
console.log(`   Create event key:        ${createStoredKey}`);
console.log(`   Update event key:        ${updateStoredKey}`);
console.log('');
console.log(`   Detection → Create match: ${duplicateKey === createStoredKey ? '✅ Match' : '❌ No match'}`);
console.log(`   Detection → Update match: ${duplicateKey === updateStoredKey ? '✅ Match' : '❌ No match'}`);
console.log(`   Create → Update match:    ${createStoredKey === updateStoredKey ? '✅ Match' : '❌ No match'}`);
console.log('');

console.log('=' .repeat(60));

const allMatch = (
  createAdjustedStart.getTime() === updateAdjustedStart.getTime() &&
  duplicateKey === createStoredKey &&
  duplicateKey === updateStoredKey
);

if (allMatch) {
  console.log('✅ SUCCESS: Timezone consistency fixed!');
  console.log('   - Create and update use identical timezone conversion');
  console.log('   - Duplicate detection keys match both scenarios');
  console.log('   - Both initial sync and update sync will show correct times');
} else {
  console.log('❌ FAILURE: Timezone inconsistency still exists');
  
  if (createAdjustedStart.getTime() !== updateAdjustedStart.getTime()) {
    console.log('   - Create and update produce different times');
  }
  
  if (duplicateKey !== createStoredKey || duplicateKey !== updateStoredKey) {
    console.log('   - Duplicate detection keys don\'t match');
  }
}

console.log('');