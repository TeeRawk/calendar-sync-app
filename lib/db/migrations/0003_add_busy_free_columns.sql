-- Migration: Add busy/free calendar sync support
-- Date: 2025-01-18
-- Description: Add syncType and privacyLevel columns to calendar_syncs table and create busy_free_syncs table

-- First, check and add columns to calendar_syncs if they don't exist
DO $$ 
BEGIN
    -- Add syncType column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='calendar_syncs' AND column_name='syncType') THEN
        ALTER TABLE calendar_syncs ADD COLUMN "syncType" TEXT DEFAULT 'full' NOT NULL;
    END IF;
    
    -- Add privacyLevel column  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='calendar_syncs' AND column_name='privacyLevel') THEN
        ALTER TABLE calendar_syncs ADD COLUMN "privacyLevel" TEXT DEFAULT 'busy_only';
    END IF;
END $$;

-- Create busy_free_syncs table if it doesn't exist
CREATE TABLE IF NOT EXISTS busy_free_syncs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  calendar_sync_id TEXT NOT NULL REFERENCES calendar_syncs(id) ON DELETE CASCADE,
  source_uid TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  busy_free_status TEXT NOT NULL,
  transparency TEXT NOT NULL,
  start_date_time TIMESTAMP NOT NULL,
  end_date_time TIMESTAMP NOT NULL,
  original_summary TEXT,
  synced_summary TEXT NOT NULL,
  source_timezone TEXT,
  last_synced_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_busy_free_syncs_calendar_sync_id ON busy_free_syncs(calendar_sync_id);
CREATE INDEX IF NOT EXISTS idx_busy_free_syncs_source_uid ON busy_free_syncs(source_uid);
CREATE INDEX IF NOT EXISTS idx_busy_free_syncs_google_event_id ON busy_free_syncs(google_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_syncs_sync_type ON calendar_syncs("syncType");

-- Update existing records to have the default values
UPDATE calendar_syncs SET "syncType" = 'full' WHERE "syncType" IS NULL OR "syncType" = '';
UPDATE calendar_syncs SET "privacyLevel" = 'busy_only' WHERE "privacyLevel" IS NULL OR "privacyLevel" = '';