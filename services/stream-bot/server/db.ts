// Database connection using node-postgres for local PostgreSQL
// Switched from @neondatabase/serverless to support local postgres (not Neon cloud)
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { requireEnv } from "./env";

// Prefer STREAMBOT_DATABASE_URL, fallback to DATABASE_URL
const DATABASE_URL = process.env.STREAMBOT_DATABASE_URL || requireEnv(
  'DATABASE_URL',
  'DATABASE_URL or STREAMBOT_DATABASE_URL must be set. Did you forget to provision a database?'
);

console.log('[StreamBot DB] Using database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema });
