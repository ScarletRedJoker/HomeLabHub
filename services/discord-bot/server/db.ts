import { Pool as PgPool } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';

// Database configuration
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Auto-detect database type and use appropriate driver
 * 
 * Neon Cloud (Replit): Uses @neondatabase/serverless with WebSocket
 * - DATABASE_URL contains 'neon.tech', 'neon.dev', or 'DATABASE_POOLER_URL' env exists
 * - Requires WebSocket connection for serverless environment
 * 
 * Local/Docker PostgreSQL: Uses standard pg driver
 * - Standard PostgreSQL connection string
 * - Works with local PostgreSQL containers and traditional servers
 */
const isNeonDatabase = 
  databaseUrl.includes('neon.tech') || 
  databaseUrl.includes('neon.dev') ||
  process.env.DATABASE_POOLER_URL !== undefined;

let pool: any;
let db: any;

if (isNeonDatabase) {
  // Use Neon serverless driver for cloud deployments
  console.log('[Database] Detected Neon cloud database, using serverless driver with WebSocket');
  
  // Configure Neon to use WebSocket for serverless environment
  neonConfig.webSocketConstructor = ws;
  
  // Create connection pool with Neon serverless driver
  const neonPool = new NeonPool({ connectionString: databaseUrl });
  pool = neonPool;
  db = neonDrizzle({ client: neonPool, schema });
  
} else {
  // Use standard pg driver for local/Docker deployments
  console.log('[Database] Detected local/Docker PostgreSQL, using standard pg driver');
  
  // Create connection pool with standard pg driver
  const pgPool = new PgPool({ 
    connectionString: databaseUrl,
    // Connection pool settings for production stability
    max: 20, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Timeout if connection takes > 10s
  });
  
  // Handle pool errors to prevent crashes
  pgPool.on('error', (err: Error) => {
    console.error('[Database] Unexpected pool error:', err);
  });
  
  pool = pgPool;
  db = pgDrizzle({ client: pgPool, schema });
}

export { pool, db };