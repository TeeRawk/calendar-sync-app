#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
try { dotenvConfig({ path: '.env.local' }); } catch {}
try { dotenvConfig(); } catch {}

import pg from 'pg';

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No POSTGRES_URL or DATABASE_URL found in env');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function ensureAdminColumns() {
  await client.connect();
  try {
    await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isAdmin" boolean DEFAULT false NOT NULL');
    await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDisabled" boolean DEFAULT false NOT NULL');
    await client.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text');
    console.log('Ensured admin columns exist on users table');
  } finally {
    await client.end();
  }
}

ensureAdminColumns().catch((e) => {
  console.error('Failed to ensure admin columns:', e);
  process.exit(1);
});
