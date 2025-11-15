#!/usr/bin/env tsx
/**
 * Database Migration Runner for Discord Bot
 * 
 * Manages database schema migrations with support for:
 * - Applying migrations (up)
 * - Rolling back migrations (down)
 * - Checking migration status
 * - Migration locking to prevent concurrent runs
 * - Backup creation before migrations
 * 
 * Usage:
 *   npm run migrate:up          - Apply all pending migrations
 *   npm run migrate:down        - Rollback the last migration
 *   npm run migrate:status      - Show migration status
 *   npm run migrate:down <id>   - Rollback specific migration
 */

import { Pool as PgPool } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL must be set');
  process.exit(1);
}

// Auto-detect database type
const isNeonDatabase = 
  DATABASE_URL.includes('neon.tech') || 
  DATABASE_URL.includes('neon.dev') ||
  process.env.DATABASE_POOLER_URL !== undefined;

let pool: any;

if (isNeonDatabase) {
  console.log('[Database] Using Neon serverless driver');
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: DATABASE_URL });
} else {
  console.log('[Database] Using standard PostgreSQL driver');
  pool = new PgPool({ connectionString: DATABASE_URL });
}

// Migration configuration
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'drizzle_migrations';
const MIGRATION_LOCK_TABLE = 'migration_lock';

interface Migration {
  id: string;
  filename: string;
  sql: string;
  appliedAt?: Date;
}

interface MigrationRecord {
  id: string;
  filename: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Initialize migration tracking tables
 */
async function initMigrationTables(): Promise<void> {
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        rollback_sql TEXT
      );
    `);

    // Create migration lock table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
        lock_id INTEGER PRIMARY KEY DEFAULT 1,
        locked_at TIMESTAMP DEFAULT NOW(),
        locked_by VARCHAR(255),
        CONSTRAINT single_lock CHECK (lock_id = 1)
      );
    `);

    console.log('✅ Migration tracking tables initialized');
  } finally {
    client.release();
  }
}

/**
 * Acquire migration lock to prevent concurrent migrations
 */
async function acquireLock(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const hostname = process.env.HOSTNAME || 'unknown';
    const result = await client.query(`
      INSERT INTO ${MIGRATION_LOCK_TABLE} (lock_id, locked_by)
      VALUES (1, $1)
      ON CONFLICT (lock_id) DO NOTHING
      RETURNING lock_id;
    `, [hostname]);

    if (result.rowCount === 0) {
      const lockInfo = await client.query(`
        SELECT locked_at, locked_by FROM ${MIGRATION_LOCK_TABLE} WHERE lock_id = 1
      `);
      
      if (lockInfo.rows.length > 0) {
        const lockedAt = new Date(lockInfo.rows[0].locked_at);
        const now = new Date();
        const diffMinutes = (now.getTime() - lockedAt.getTime()) / (1000 * 60);
        
        if (diffMinutes > 10) {
          console.warn(`⚠️  Stale lock detected (${diffMinutes.toFixed(1)} min old), releasing...`);
          await releaseLock();
          return acquireLock();
        }
        
        console.error(`❌ Migration lock held by ${lockInfo.rows[0].locked_by} since ${lockedAt.toISOString()}`);
        console.error('   Another migration may be in progress. Wait or manually release the lock.');
      }
      return false;
    }

    console.log('🔒 Migration lock acquired');
    return true;
  } catch (error) {
    console.error('❌ Error acquiring lock:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Release migration lock
 */
async function releaseLock(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM ${MIGRATION_LOCK_TABLE} WHERE lock_id = 1`);
    console.log('🔓 Migration lock released');
  } catch (error) {
    console.error('❌ Error releasing lock:', error);
  } finally {
    client.release();
  }
}

/**
 * Calculate checksum for migration file
 */
function calculateChecksum(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Read all migration files from migrations directory
 */
function getAllMigrations(): Migration[] {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('meta'))
    .sort();

  return files.map(filename => {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf-8');
    const id = filename.replace('.sql', '');
    return { id, filename, sql };
  });
}

/**
 * Get applied migrations from database
 */
async function getAppliedMigrations(): Promise<MigrationRecord[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<MigrationRecord>(`
      SELECT id, filename, applied_at, checksum
      FROM ${MIGRATIONS_TABLE}
      ORDER BY applied_at ASC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Create database backup (pg_dump)
 */
async function createBackup(): Promise<string | null> {
  // Skip backup for Neon cloud databases (not accessible via pg_dump)
  if (isNeonDatabase) {
    console.log('ℹ️  Skipping backup (Neon cloud database - use Replit database UI for backups)');
    return null;
  }

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFile = path.join(backupDir, `discordbot_${timestamp}.sql`);

  try {
    console.log('📦 Creating database backup...');
    
    const url = new URL(DATABASE_URL!);
    const dbName = url.pathname.slice(1);
    
    const cmd = `PGPASSWORD="${url.password}" pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${dbName} -f ${backupFile}`;
    
    await execAsync(cmd);
    console.log(`✅ Backup created: ${backupFile}`);
    return backupFile;
  } catch (error: any) {
    console.warn(`⚠️  Backup failed (continuing anyway): ${error.message}`);
    return null;
  }
}

/**
 * Apply a single migration
 */
async function applyMigration(migration: Migration): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log(`\n📝 Applying migration: ${migration.filename}`);
    
    // Execute migration SQL
    await client.query(migration.sql);

    // Record migration as applied
    const checksum = calculateChecksum(migration.sql);
    await client.query(`
      INSERT INTO ${MIGRATIONS_TABLE} (id, filename, applied_at, checksum)
      VALUES ($1, $2, NOW(), $3)
    `, [migration.id, migration.filename, checksum]);

    await client.query('COMMIT');
    console.log(`✅ Migration applied: ${migration.filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed to apply migration ${migration.filename}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rollback a migration
 */
async function rollbackMigration(migrationId: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<MigrationRecord>(`
      SELECT id, filename, rollback_sql FROM ${MIGRATIONS_TABLE}
      WHERE id = $1
    `, [migrationId]);

    if (result.rows.length === 0) {
      throw new Error(`Migration ${migrationId} not found in applied migrations`);
    }

    const migration = result.rows[0];
    console.log(`\n🔄 Rolling back migration: ${migration.filename}`);

    await client.query('BEGIN');
    
    await client.query(`
      DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1
    `, [migrationId]);

    await client.query('COMMIT');
    
    console.log(`⚠️  Migration record removed: ${migration.filename}`);
    console.log(`⚠️  WARNING: This does not automatically reverse schema changes!`);
    console.log(`⚠️  You must manually reverse the changes or restore from backup.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Show migration status
 */
async function showStatus(): Promise<void> {
  await initMigrationTables();
  
  const allMigrations = getAllMigrations();
  const appliedMigrations = await getAppliedMigrations();
  const appliedIds = new Set(appliedMigrations.map(m => m.id));

  console.log('\n📊 Migration Status\n');
  console.log('═'.repeat(80));
  
  if (allMigrations.length === 0) {
    console.log('No migrations found');
    return;
  }

  for (const migration of allMigrations) {
    const applied = appliedIds.has(migration.id);
    const status = applied ? '✅ Applied' : '⏳ Pending';
    const appliedAt = applied 
      ? appliedMigrations.find(m => m.id === migration.id)?.applied_at.toISOString()
      : '';
    
    console.log(`${status} | ${migration.id}`);
    if (appliedAt) {
      console.log(`         └─ Applied at: ${appliedAt}`);
    }
  }

  console.log('═'.repeat(80));
  console.log(`\nTotal: ${allMigrations.length} migrations`);
  console.log(`Applied: ${appliedMigrations.length}`);
  console.log(`Pending: ${allMigrations.length - appliedMigrations.length}`);
}

/**
 * Apply all pending migrations
 */
async function migrateUp(): Promise<void> {
  await initMigrationTables();

  if (!await acquireLock()) {
    process.exit(1);
  }

  try {
    const allMigrations = getAllMigrations();
    const appliedMigrations = await getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    const pending = allMigrations.filter(m => !appliedIds.has(m.id));

    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`\n📋 Found ${pending.length} pending migration(s):`);
    pending.forEach(m => console.log(`   - ${m.filename}`));

    await createBackup();

    console.log('\n🚀 Starting migration...\n');

    for (const migration of pending) {
      await applyMigration(migration);
    }

    console.log('\n✅ All migrations applied successfully!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await releaseLock();
  }
}

/**
 * Rollback last migration
 */
async function migrateDown(specificId?: string): Promise<void> {
  await initMigrationTables();

  if (!await acquireLock()) {
    process.exit(1);
  }

  try {
    const appliedMigrations = await getAppliedMigrations();

    if (appliedMigrations.length === 0) {
      console.log('✅ No migrations to rollback');
      return;
    }

    let migrationToRollback: MigrationRecord;

    if (specificId) {
      const found = appliedMigrations.find(m => m.id === specificId);
      if (!found) {
        throw new Error(`Migration ${specificId} not found in applied migrations`);
      }
      migrationToRollback = found;
    } else {
      migrationToRollback = appliedMigrations[appliedMigrations.length - 1];
    }

    await createBackup();

    console.log('\n🔄 Rolling back migration...\n');
    await rollbackMigration(migrationToRollback.id);

    console.log('\n✅ Rollback completed!\n');
  } catch (error) {
    console.error('\n❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    await releaseLock();
  }
}

/**
 * Main entry point
 */
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log('🤖 Discord Bot Migration Manager\n');

  try {
    switch (command) {
      case 'up':
        await migrateUp();
        break;
      case 'down':
        await migrateDown(arg);
        break;
      case 'status':
        await showStatus();
        break;
      default:
        console.log('Usage:');
        console.log('  migrate.ts up              - Apply all pending migrations');
        console.log('  migrate.ts down            - Rollback last migration');
        console.log('  migrate.ts down <id>       - Rollback specific migration');
        console.log('  migrate.ts status          - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
