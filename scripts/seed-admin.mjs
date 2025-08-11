#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { sql } from '@vercel/postgres';
// Load env for local/CI runs
import { config as dotenvConfig } from 'dotenv';
// Try .env.local first (Next.js convention), then default to .env
try {
  dotenvConfig({ path: '.env.local' });
} catch {}
try {
  dotenvConfig();
} catch {}

async function upsertAdmin(email, password) {
  const normalized = String(email).toLowerCase().trim();
  const hash = await bcrypt.hash(String(password), 10);

  // Find existing user by email
  const { rows } = await sql`SELECT id FROM users WHERE email = ${normalized} LIMIT 1`;
  if (rows.length > 0) {
    const id = rows[0].id;
    await sql`UPDATE users SET "isAdmin" = true, "isDisabled" = false, "passwordHash" = ${hash} WHERE id = ${id}`;
    return { id, created: false };
  } else {
    // Create new admin user
    const result = await sql`
      INSERT INTO users (id, name, email, "emailVerified", image, "isAdmin", "isDisabled", "passwordHash")
      VALUES (gen_random_uuid()::text, NULL, ${normalized}, NULL, NULL, true, false, ${hash})
      RETURNING id
    `;
    return { id: result.rows[0].id, created: true };
  }
}

async function main() {
  const [emailArg, passArg] = process.argv.slice(2);
  if (!emailArg || !passArg) {
    console.error('Usage: node scripts/seed-admin.mjs <email> <password>');
    process.exit(1);
  }
  const res = await upsertAdmin(emailArg, passArg);
  console.log(res.created ? `Created admin user ${emailArg} (id=${res.id})` : `Updated admin user ${emailArg} (id=${res.id})`);
}

main().catch((e) => {
  console.error('Failed to seed admin:', e);
  process.exit(1);
});
