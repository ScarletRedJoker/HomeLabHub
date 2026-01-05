import { beforeAll, afterAll } from 'vitest';

const TEST_DATABASE_URL = process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error('Test database URL not configured. Set DATABASE_URL');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('[Test Setup] Database Configuration');
console.log('═══════════════════════════════════════════════════════════════');
console.log('[Test Setup] Using database URL:', TEST_DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
console.log('[Test Setup] Environment:', process.env.NODE_ENV || 'test');
console.log('═══════════════════════════════════════════════════════════════');

let testDb: any;
let testPool: any;

beforeAll(async () => {
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('@shared/schema');
  
  testPool = new pg.default.Pool({ connectionString: TEST_DATABASE_URL });
  testDb = drizzle(testPool, { schema });
  
  (global as any).__TEST_DB__ = testDb;
  (global as any).__TEST_POOL__ = testPool;
  
  console.log('[Test Setup] Database pool initialized successfully');
});

afterAll(async () => {
  if (testPool) {
    await testPool.end();
    console.log('[Test Setup] Database pool closed');
  }
});

export function getTestDb() {
  return (global as any).__TEST_DB__;
}

export function getTestPool() {
  return (global as any).__TEST_POOL__;
}
