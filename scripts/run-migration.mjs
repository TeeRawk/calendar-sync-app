#!/usr/bin/env node

import { readFileSync } from 'fs';
import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runMigration() {
  try {
    console.log('🔄 Running database migration for busy/free calendar support...');
    
    // Read the migration SQL
    const migrationSQL = readFileSync('./lib/db/migrations/0003_add_busy_free_columns.sql', 'utf8');
    
    // Execute the entire migration as one transaction
    console.log('📝 Executing migration...');
    console.log(`   ${migrationSQL.substring(0, 100).replace(/\s+/g, ' ')}...`);
    
    await sql.query(migrationSQL);
    console.log('   ✅ Success');
    
    console.log('🎉 Migration completed successfully!');
    
    // Verify the changes
    console.log('\n🔍 Verifying migration...');
    
    // Check if columns exist
    const result = await sql`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'calendar_syncs' 
      AND column_name IN ('syncType', 'privacyLevel')
      ORDER BY column_name;
    `;
    
    console.log('📊 New columns in calendar_syncs:');
    result.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });
    
    // Check if busy_free_syncs table exists
    const tableCheck = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'busy_free_syncs';
    `;
    
    if (tableCheck.rows.length > 0) {
      console.log('✅ busy_free_syncs table created successfully');
    } else {
      console.log('❌ busy_free_syncs table was not created');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();