import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as platformSchema from "./platform-schema";
import * as aiSandboxSchema from "./ai-sandbox-schema";

const schema = { ...platformSchema, ...aiSandboxSchema };

type Schema = typeof schema;

let _pool: Pool | null = null;
let _db: NodePgDatabase<Schema> | null = null;

function isBuildTime(): boolean {
  return !process.env.DATABASE_URL || 
         process.env.NEXT_PHASE === 'phase-production-build' ||
         process.argv.some(arg => arg.includes('next') && arg.includes('build'));
}

function getPool(): Pool {
  if (!_pool) {
    if (isBuildTime()) {
      throw new Error('[DB] Database not available during build time');
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return _pool;
}

function getDb(): NodePgDatabase<Schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<Schema>, {
  get(_target, prop) {
    const realDb = getDb();
    const value = (realDb as any)[prop];
    if (typeof value === 'function') {
      return value.bind(realDb);
    }
    return value;
  }
});

export function isDbConnected(): boolean {
  return !!process.env.DATABASE_URL && !isBuildTime();
}

export async function testConnection(): Promise<boolean> {
  if (isBuildTime()) return false;
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
