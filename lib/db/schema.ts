import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // Added for admin and credential auth support
  isAdmin: boolean('isAdmin').default(false).notNull(),
  isDisabled: boolean('isDisabled').default(false).notNull(),
  passwordHash: text('passwordHash'),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  sessionToken: text('sessionToken').notNull().unique(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable('verification_token', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (vt) => ({
  compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
}));

export const calendarSyncs = pgTable('calendar_syncs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icsUrl: text('icsUrl').notNull(),
  googleCalendarId: text('googleCalendarId').notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  lastSync: timestamp('lastSync', { mode: 'date' }),
  syncErrors: jsonb('syncErrors'),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
});

export const syncLogs = pgTable('sync_logs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  calendarSyncId: text('calendarSyncId').notNull().references(() => calendarSyncs.id, { onDelete: 'cascade' }),
  eventsProcessed: text('eventsProcessed').notNull().default('0'),
  eventsCreated: text('eventsCreated').notNull().default('0'),
  eventsUpdated: text('eventsUpdated').notNull().default('0'),
  errors: jsonb('errors'),
  duration: text('duration'),
  status: text('status').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
});

// Event tracking table for duplicate resolution
export const eventMappings = pgTable('event_mappings', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  calendarSyncId: text('calendarSyncId').notNull().references(() => calendarSyncs.id, { onDelete: 'cascade' }),
  sourceUid: text('sourceUid').notNull(), // Original ICS UID
  googleEventId: text('googleEventId').notNull(), // Google Calendar event ID
  eventTitle: text('eventTitle').notNull(),
  eventTitleNormalized: text('eventTitleNormalized').notNull(), // Normalized for fuzzy matching
  startDateTime: timestamp('startDateTime', { mode: 'date' }).notNull(),
  endDateTime: timestamp('endDateTime', { mode: 'date' }).notNull(),
  location: text('location'),
  eventHash: text('eventHash').notNull(), // SHA-256 hash for quick comparison
  fuzzyHash: text('fuzzyHash').notNull(), // Simplified hash for fuzzy matching
  lastSyncedAt: timestamp('lastSyncedAt', { mode: 'date' }).defaultNow().notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
});

// Duplicate resolution logs
export const duplicateResolutions = pgTable('duplicate_resolutions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  calendarSyncId: text('calendarSyncId').notNull().references(() => calendarSyncs.id, { onDelete: 'cascade' }),
  sourceEventId: text('sourceEventId').notNull(), // Reference to eventMappings
  duplicateEventId: text('duplicateEventId').notNull(), // Reference to potential duplicate
  matchType: text('matchType').notNull(), // 'exact', 'fuzzy', 'manual'
  confidence: integer('confidence').notNull(), // 0-100
  resolution: text('resolution').notNull(), // 'merged', 'kept_original', 'kept_duplicate', 'manual_review'
  resolvedAt: timestamp('resolvedAt', { mode: 'date' }).defaultNow().notNull(),
});

// Cleanup operation tracking
export const cleanupOperations = pgTable('cleanup_operations', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  operationId: text('operationId').notNull().unique(), // External operation ID
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(), // 'dry-run', 'interactive', 'batch'
  status: text('status').notNull(), // 'running', 'completed', 'failed', 'cancelled'
  calendarIds: jsonb('calendarIds').notNull(), // Array of calendar IDs processed
  filters: jsonb('filters'), // Applied filters
  options: jsonb('options'), // Cleanup options used
  results: jsonb('results'), // Final results
  groupsAnalyzed: integer('groupsAnalyzed').default(0),
  duplicatesFound: integer('duplicatesFound').default(0),
  duplicatesDeleted: integer('duplicatesDeleted').default(0),
  errorsCount: integer('errorsCount').default(0),
  warningsCount: integer('warningsCount').default(0),
  backupId: text('backupId'),
  startedAt: timestamp('startedAt', { mode: 'date' }).defaultNow().notNull(),
  completedAt: timestamp('completedAt', { mode: 'date' }),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
});

// Cleanup backups for rollback capability
export const cleanupBackups = pgTable('cleanup_backups', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  backupId: text('backupId').notNull().unique(),
  operationId: text('operationId').notNull().references(() => cleanupOperations.operationId, { onDelete: 'cascade' }),
  eventData: jsonb('eventData').notNull(), // Array of backed up events with full data
  metadata: jsonb('metadata'), // Additional backup metadata
  compressedSize: integer('compressedSize'),
  originalSize: integer('originalSize'),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  expiresAt: timestamp('expiresAt', { mode: 'date' }), // Optional expiration for cleanup
});

// Deleted events log for rollback tracking
export const deletedEvents = pgTable('deleted_events', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  operationId: text('operationId').notNull().references(() => cleanupOperations.operationId, { onDelete: 'cascade' }),
  googleEventId: text('googleEventId').notNull(),
  calendarId: text('calendarId').notNull(),
  eventTitle: text('eventTitle').notNull(),
  eventData: jsonb('eventData').notNull(), // Full event data for restoration
  deletionReason: text('deletionReason'), // Why it was deleted
  groupId: text('groupId'), // Which duplicate group it belonged to
  canRestore: boolean('canRestore').default(true),
  restoredAt: timestamp('restoredAt', { mode: 'date' }),
  deletedAt: timestamp('deletedAt', { mode: 'date' }).defaultNow().notNull(),
});