import { Pool as PgPool } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';

/**
 * Read-Only Database Connection for Developer Dashboard
 * 
 * This connection enforces read-only mode at the database level,
 * preventing ANY write operations regardless of SQL syntax.
 * 
 * Security: Even if a developer tries to execute DROP, DELETE, UPDATE, etc.,
 * the database will reject it because the connection is in read-only mode.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Auto-detect database type (same as main db.ts)
const isNeonDatabase = 
  databaseUrl.includes('neon.tech') || 
  databaseUrl.includes('neon.dev') ||
  process.env.DATABASE_POOLER_URL !== undefined;

let readOnlyPool: any;
let readOnlyDb: any;

if (isNeonDatabase) {
  // Neon serverless with read-only mode
  console.log('[Database] Creating read-only Neon connection for developer queries');
  
  neonConfig.webSocketConstructor = ws;
  
  // Add read-only option to connection string
  const readOnlyUrl = databaseUrl.includes('?') 
    ? `${databaseUrl}&options=-c%20default_transaction_read_only=on`
    : `${databaseUrl}?options=-c%20default_transaction_read_only=on`;
  
  const neonPool = new NeonPool({ connectionString: readOnlyUrl });
  readOnlyPool = neonPool;
  readOnlyDb = neonDrizzle({ client: neonPool, schema });
  
} else {
  // Standard PostgreSQL with read-only mode
  console.log('[Database] Creating read-only PostgreSQL connection for developer queries');
  
  // Add read-only option to connection string
  const readOnlyUrl = databaseUrl.includes('?')
    ? `${databaseUrl}&options=-c%20default_transaction_read_only=on`
    : `${databaseUrl}?options=-c%20default_transaction_read_only=on`;
  
  const pgPool = new PgPool({ 
    connectionString: readOnlyUrl,
    max: 5, // Smaller pool since this is only for developer queries
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  pgPool.on('error', (err: Error) => {
    console.error('[Database] Unexpected read-only pool error:', err);
  });
  
  readOnlyPool = pgPool;
  readOnlyDb = pgDrizzle({ client: pgPool, schema });
}

export { readOnlyPool, readOnlyDb };
