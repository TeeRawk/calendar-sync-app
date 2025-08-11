import { defineConfig } from 'drizzle-kit';
// Load env vars for CLI usage
import { config as dotenvConfig } from 'dotenv';
try {
  dotenvConfig({ path: '.env.local' });
} catch {}
try {
  dotenvConfig();
} catch {}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  driver: 'pg',
  dbCredentials: {
    host: process.env.POSTGRES_HOST!,
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DATABASE!,
    ssl: true,
  },
});