import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import bcryptjs from "bcryptjs";

const SALT_ROUNDS = 10;

interface MigrationResult {
  success: boolean;
  message: string;
  adminCreated: boolean;
}

export async function autoMigrateDatabase(): Promise<MigrationResult> {
  console.log("[AutoMigrate] Starting automatic database migration...");
  
  try {
    await ensureUsersTableSchema();
    const adminCreated = await ensureAdminUser();
    
    console.log("[AutoMigrate] Database migration completed successfully");
    return { success: true, message: "Database ready", adminCreated };
  } catch (error: any) {
    console.error("[AutoMigrate] Migration failed:", error.message);
    return { success: false, message: error.message, adminCreated: false };
  }
}

async function ensureUsersTableSchema(): Promise<void> {
  console.log("[AutoMigrate] Ensuring users table has correct schema...");
  
  const columnChecks = [
    { name: "username", type: "varchar(100)", default: null },
    { name: "password_hash", type: "varchar(255)", default: null },
    { name: "role", type: "varchar(20)", default: "'viewer'" },
    { name: "is_active", type: "boolean", default: "true" },
    { name: "last_login", type: "timestamp", default: null },
    { name: "created_by", type: "uuid", default: null },
    { name: "metadata", type: "jsonb", default: null },
    { name: "created_at", type: "timestamp", default: "NOW()" },
    { name: "updated_at", type: "timestamp", default: "NOW()" },
  ];

  for (const col of columnChecks) {
    try {
      const checkResult = await db.execute(sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = ${col.name}
      `);
      
      if (checkResult.rows.length === 0) {
        console.log(`[AutoMigrate] Adding missing column: ${col.name}`);
        const defaultClause = col.default ? `DEFAULT ${col.default}` : "";
        await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} ${defaultClause}`));
      }
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        console.warn(`[AutoMigrate] Warning adding ${col.name}:`, err.message);
      }
    }
  }

  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique 
      ON users(username) WHERE username IS NOT NULL
    `);
  } catch (err: any) {
    if (!err.message?.includes("already exists")) {
      console.warn("[AutoMigrate] Warning creating username index:", err.message);
    }
  }

  try {
    await db.execute(sql`
      UPDATE users 
      SET username = COALESCE(
        NULLIF(split_part(email, '@', 1), ''),
        'user_' || LEFT(id::text, 8)
      )
      WHERE username IS NULL OR username = ''
    `);
  } catch (err: any) {
    console.warn("[AutoMigrate] Warning fixing null usernames:", err.message);
  }

  console.log("[AutoMigrate] Users table schema verified");
}

async function ensureAdminUser(): Promise<boolean> {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  
  console.log("[AutoMigrate] Checking for admin user...");
  
  try {
    const existingAdmin = await db.execute(sql`
      SELECT id, username FROM users WHERE username = ${adminUsername} LIMIT 1
    `);
    
    if (existingAdmin.rows.length > 0) {
      console.log(`[AutoMigrate] Admin user '${adminUsername}' exists`);
      return false;
    }
    
    const passwordHash = await bcryptjs.hash(adminPassword, SALT_ROUNDS);
    
    await db.execute(sql`
      INSERT INTO users (id, username, email, password_hash, role, is_active, created_at)
      VALUES (
        gen_random_uuid(),
        ${adminUsername},
        ${adminUsername + '@nebula.local'},
        ${passwordHash},
        'admin',
        true,
        NOW()
      )
    `);
    
    console.log(`[AutoMigrate] Created admin user '${adminUsername}'`);
    return true;
  } catch (err: any) {
    if (err.message?.includes("duplicate") || err.code === "23505") {
      console.log(`[AutoMigrate] Admin user already exists`);
      return false;
    }
    throw err;
  }
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error("[AutoMigrate] Database connection test failed:", error);
    return false;
  }
}
