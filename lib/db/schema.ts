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