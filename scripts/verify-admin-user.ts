#!/usr/bin/env tsx

/**
 * Script to verify admin user exists in production database
 * Usage: npx tsx scripts/verify-admin-user.ts [email]
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

async function verifyAdminUser(email: string) {
  console.log(`🔍 Verifying admin user: ${email}`);

  // Setup database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const db = drizzle(pool);

  try {
    // Check if user exists and get their details
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        isDisabled: users.isDisabled,
        hasPassword: users.passwordHash
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (user.length === 0) {
      console.log(`❌ User ${email} not found in database`);
      return false;
    }

    const userDetails = user[0];
    console.log(`\n✅ User found in database:`);
    console.log(`   ID: ${userDetails.id}`);
    console.log(`   Email: ${userDetails.email}`);
    console.log(`   Name: ${userDetails.name || 'Not set'}`);
    console.log(`   Is Admin: ${userDetails.isAdmin ? '✅ Yes' : '❌ No'}`);
    console.log(`   Is Disabled: ${userDetails.isDisabled ? '❌ Yes' : '✅ No'}`);
    console.log(`   Has Password: ${userDetails.hasPassword ? '✅ Yes' : '❌ No'}`);

    if (!userDetails.isAdmin) {
      console.log(`\n⚠️  WARNING: User ${email} exists but is not an admin`);
      return false;
    }

    if (userDetails.isDisabled) {
      console.log(`\n⚠️  WARNING: User ${email} is disabled`);
      return false;
    }

    if (!userDetails.hasPassword) {
      console.log(`\n⚠️  WARNING: User ${email} has no password set`);
      return false;
    }

    console.log(`\n🎉 Admin user ${email} is properly configured!`);
    return true;

  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const args = process.argv.slice(2);
    const email = args[0] || 'admin@calendar-sync.com';

    console.log(`🔧 Connecting to database...`);
    console.log(`📧 Checking user: ${email}`);
    
    const isValid = await verifyAdminUser(email);
    
    if (isValid) {
      console.log(`\n✅ Verification successful! Admin user is ready for production.`);
    } else {
      console.log(`\n❌ Verification failed! Please run the create-admin-user script.`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error('❌ Error verifying admin user:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { verifyAdminUser };