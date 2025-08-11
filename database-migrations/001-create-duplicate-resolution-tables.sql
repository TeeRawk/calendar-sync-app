-- Enhanced Duplicate Resolution System Database Schema
-- Migration: 001-create-duplicate-resolution-tables.sql

-- Create event_mappings table for tracking ICS to Google Calendar event relationships
CREATE TABLE IF NOT EXISTS event_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  calendar_sync_id TEXT NOT NULL,
  source_uid TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_title_normalized TEXT NOT NULL,
  start_date_time TIMESTAMP NOT NULL,
  end_date_time TIMESTAMP NOT NULL,
  location TEXT,
  event_hash TEXT NOT NULL,
  fuzzy_hash TEXT NOT NULL,
  last_synced_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT fk_event_mappings_calendar_sync 
    FOREIGN KEY (calendar_sync_id) 
    REFERENCES calendar_syncs(id) 
    ON DELETE CASCADE
);

-- Create duplicate_resolutions table for tracking resolution decisions
CREATE TABLE IF NOT EXISTS duplicate_resolutions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  calendar_sync_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  duplicate_event_id TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'manual')),
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  resolution TEXT NOT NULL,
  resolved_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT fk_duplicate_resolutions_calendar_sync 
    FOREIGN KEY (calendar_sync_id) 
    REFERENCES calendar_syncs(id) 
    ON DELETE CASCADE
);

-- Performance Optimization Indexes
-- ===============================

-- Primary lookup indexes for event_mappings
CREATE INDEX IF NOT EXISTS idx_event_mappings_calendar_sync_id 
  ON event_mappings(calendar_sync_id);

CREATE INDEX IF NOT EXISTS idx_event_mappings_source_uid_start_time 
  ON event_mappings(calendar_sync_id, source_uid, start_date_time);

CREATE INDEX IF NOT EXISTS idx_event_mappings_event_hash 
  ON event_mappings(calendar_sync_id, event_hash);

CREATE INDEX IF NOT EXISTS idx_event_mappings_fuzzy_hash 
  ON event_mappings(calendar_sync_id, fuzzy_hash);

-- Time-based search optimization
CREATE INDEX IF NOT EXISTS idx_event_mappings_start_time_range 
  ON event_mappings(calendar_sync_id, start_date_time) 
  INCLUDE (event_title, event_title_normalized, end_date_time, location);

-- Fuzzy matching optimization
CREATE INDEX IF NOT EXISTS idx_event_mappings_title_normalized 
  ON event_mappings(calendar_sync_id, event_title_normalized);

-- Performance optimization for cleanup operations
CREATE INDEX IF NOT EXISTS idx_event_mappings_last_synced 
  ON event_mappings(calendar_sync_id, last_synced_at);

-- Google Calendar event ID lookup
CREATE INDEX IF NOT EXISTS idx_event_mappings_google_event_id 
  ON event_mappings(google_event_id);

-- Indexes for duplicate_resolutions
CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_calendar_sync_id 
  ON duplicate_resolutions(calendar_sync_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_match_type 
  ON duplicate_resolutions(calendar_sync_id, match_type);

CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_resolved_at 
  ON duplicate_resolutions(resolved_at DESC);

-- Composite index for statistics queries
CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_stats 
  ON duplicate_resolutions(calendar_sync_id, match_type, resolved_at);

-- Full-text search support for event titles (PostgreSQL specific)
-- This enables advanced text search capabilities for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_event_mappings_title_fulltext 
  ON event_mappings USING gin(to_tsvector('english', event_title_normalized));

-- Partial index for active/recent events (performance optimization)
CREATE INDEX IF NOT EXISTS idx_event_mappings_recent_active 
  ON event_mappings(calendar_sync_id, start_date_time, end_date_time) 
  WHERE last_synced_at > (NOW() - INTERVAL '30 days');

-- Comments documenting the indexing strategy
COMMENT ON INDEX idx_event_mappings_source_uid_start_time IS 
  'Primary duplicate detection index - covers exact UID+datetime matching';

COMMENT ON INDEX idx_event_mappings_start_time_range IS 
  'Time window fuzzy matching with included columns to avoid table lookups';

COMMENT ON INDEX idx_event_mappings_title_normalized IS 
  'Text similarity matching for normalized event titles';

COMMENT ON INDEX idx_event_mappings_title_fulltext IS 
  'Full-text search support for advanced fuzzy title matching';

COMMENT ON INDEX idx_event_mappings_recent_active IS 
  'Partial index for recent events to improve sync performance';

-- Analyze tables for better query planning
ANALYZE event_mappings;
ANALYZE duplicate_resolutions;