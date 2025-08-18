#!/usr/bin/env tsx

/**
 * Script to create an admin user for the calendar sync app
 * Usage: npx tsx scripts/create-admin-user.ts [email] [password]
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from both .env.local and .env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

async function createAdminUser(email: string, password: string) {
  console.log('🔐 Creating admin user...');

  // Validate inputs
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (!email.includes('@')) {
    throw new Error('Invalid email format');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Setup database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const db = drizzle(pool);

  try {
    // Check if user already exists
    console.log(`📧 Checking if user ${email} already exists...`);
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (existingUser.length > 0) {
      console.log(`👤 User ${email} already exists. Updating to admin...`);
      
      // Hash the new password
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Update existing user to be admin with new password
      await db
        .update(users)
        .set({
          isAdmin: true,
          isDisabled: false,
          passwordHash: passwordHash,
        })
        .where(eq(users.id, existingUser[0].id));

      console.log(`✅ Successfully updated ${email} to admin user`);
      return {
        id: existingUser[0].id,
        email: existingUser[0].email,
        isAdmin: true,
        updated: true
      };
    } else {
      console.log(`👤 Creating new admin user ${email}...`);
      
      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Create new admin user
      const newUser = await db
        .insert(users)
        .values({
          email: email.toLowerCase().trim(),
          name: 'Admin User',
          isAdmin: true,
          isDisabled: false,
          passwordHash: passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          isAdmin: users.isAdmin,
        });

      console.log(`✅ Successfully created admin user ${email}`);
      return {
        ...newUser[0],
        created: true
      };
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Get email and password from command line or prompt
    const args = process.argv.slice(2);
    let email = args[0];
    let password = args[1];

    // If not provided as arguments, use default values for development
    if (!email) {
      email = 'admin@calendar-sync.com';
      console.log(`📧 Using default admin email: ${email}`);
    }

    if (!password) {
      password = 'admin123456';
      console.log(`🔑 Using default admin password: ${password}`);
      console.log(`⚠️  WARNING: Change this password after first login!`);
    }

    console.log(`\n🚀 Creating admin user with:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${'*'.repeat(password.length)}`);
    console.log('');

    const result = await createAdminUser(email, password);

    console.log('\n🎉 Admin user setup complete!');
    console.log('\n📋 Login Details:');
    console.log(`   URL: http://localhost:3000/admin`);
    console.log(`   Email: ${result.email}`);
    console.log(`   Password: ${password}`);
    
    if (result.updated) {
      console.log(`\n💡 Note: Updated existing user to admin role`);
    }
    
    console.log(`\n⚠️  Security Notes:`);
    console.log(`   - Change the default password after first login`);
    console.log(`   - Only admin users can access /admin panel`);
    console.log(`   - Admin users can manage other users and system settings`);
    
  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { createAdminUser };