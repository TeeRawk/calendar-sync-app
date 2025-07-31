-- Drop existing tables if they exist
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS calendar_syncs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create tables with correct names for NextAuth Drizzle adapter
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  email TEXT NOT NULL,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Application specific tables
CREATE TABLE calendar_syncs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "icsUrl" TEXT NOT NULL,
  "googleCalendarId" TEXT NOT NULL,
  "isActive" BOOLEAN DEFAULT TRUE NOT NULL,
  "lastSync" TIMESTAMPTZ,
  "syncErrors" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE sync_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "calendarSyncId" TEXT NOT NULL REFERENCES calendar_syncs(id) ON DELETE CASCADE,
  "eventsProcessed" TEXT DEFAULT '0' NOT NULL,
  "eventsCreated" TEXT DEFAULT '0' NOT NULL,
  "eventsUpdated" TEXT DEFAULT '0' NOT NULL,
  errors JSONB,
  duration TEXT,
  status TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX accounts_user_id_idx ON accounts("userId");
CREATE INDEX sessions_user_id_idx ON sessions("userId");
CREATE INDEX calendar_syncs_user_id_idx ON calendar_syncs("userId");
CREATE INDEX sync_logs_calendar_sync_id_idx ON sync_logs("calendarSyncId");