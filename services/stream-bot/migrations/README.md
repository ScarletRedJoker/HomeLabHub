# Stream Bot Database Migrations

This directory contains database schema migrations for the Stream Bot service using Drizzle ORM.

## Migration Files

### 0000_broad_speedball.sql
**Status**: ✅ Applied (Initial Schema)  
**Purpose**: Initial database schema with all core tables  
**Applied**: Auto-applied on first deployment

**Tables Created**:
- `users` - User accounts and authentication
- `platform_connections` - OAuth connections (Twitch, YouTube, Kick)
- `bot_configs` - Bot configuration per user
- `giveaways` - Giveaway management
- `user_balances` - User currency/points system
- Plus 20+ other core tables

**Rollback**: Not recommended - this is the foundation schema

---

### 0003_add_platform_user_unique_constraint.sql
**Status**: ✅ Production-Ready  
**Purpose**: Security fix - Prevent account hijacking by ensuring one platform account can only be linked to ONE StreamBot user  
**Date**: 2025-11-15

**Changes**:
- Adds unique index: `platform_connections_platform_platform_user_id_unique`
- Constraint: `(platform, platform_user_id)` must be unique
- Prevents attackers from linking someone else's platform account to their StreamBot account

**Security Impact**: HIGH - Prevents unauthorized account linking

**Rollback Procedure**:
```sql
-- Remove the unique constraint
DROP INDEX IF EXISTS platform_connections_platform_platform_user_id_unique;

-- Verify removal
SELECT indexname FROM pg_indexes 
WHERE tablename = 'platform_connections' 
AND indexname = 'platform_connections_platform_platform_user_id_unique';
-- Should return 0 rows
```

**Rollback Risk**: LOW - Only removes constraint, no data loss

---

### 0004_add_giveaway_concurrency_improvements.sql
**Status**: ✅ Production-Ready  
**Purpose**: Fix race conditions in giveaway entries and prevent negative balance exploits  
**Date**: 2025-11-15

**Changes**:
1. **Atomic Entry Counting**:
   - Adds `entry_count` column to `giveaways` table
   - Prevents race conditions when checking max entries
   - Backfills existing giveaway entry counts

2. **Rate Limiting Table**:
   - Creates `giveaway_entry_attempts` table
   - Tracks all entry attempts for audit and rate limiting
   - Includes user, platform, giveaway, and timestamp

3. **Database-Level Constraints**:
   - `user_balances.balance >= 0` (prevent negative balances)
   - `user_balances.total_earned >= 0`
   - `user_balances.total_spent >= 0`

4. **Performance Indexes**:
   - `idx_giveaway_entry_attempts_user_time` - Fast user lookup
   - `idx_giveaway_entry_attempts_time` - Fast time-based queries

**Impact**: 
- Prevents currency exploits
- Fixes giveaway race conditions
- Improves query performance

**Rollback Procedure**:
```sql
-- 1. Drop new table
DROP TABLE IF EXISTS giveaway_entry_attempts CASCADE;

-- 2. Remove constraints from user_balances
ALTER TABLE user_balances DROP CONSTRAINT IF EXISTS user_balances_balance_check;
ALTER TABLE user_balances DROP CONSTRAINT IF EXISTS user_balances_total_earned_check;
ALTER TABLE user_balances DROP CONSTRAINT IF EXISTS user_balances_total_spent_check;

-- 3. Remove entry_count column
ALTER TABLE giveaways DROP COLUMN IF EXISTS entry_count;

-- 4. Drop indexes (automatically dropped with table/column)
-- No action needed

-- 5. Verify rollback
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'giveaway_entry_attempts';
-- Should return 0 rows

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'giveaways' AND column_name = 'entry_count';
-- Should return 0 rows
```

**Rollback Risk**: MEDIUM
- ⚠️ Loses `giveaway_entry_attempts` audit data
- ⚠️ Loses atomic entry counts (must recalculate)
- ⚠️ Re-exposes race condition vulnerabilities
- ✅ No user data lost from core tables

---

## Running Migrations

### Check Migration Status
```bash
npm run migrate:status
```
Shows which migrations are applied and which are pending.

### Apply Pending Migrations
```bash
npm run migrate:up
```
- Creates automatic backup before applying
- Applies all pending migrations in order
- Uses migration lock to prevent concurrent runs

### Rollback Last Migration
```bash
npm run migrate:down
```
- Creates backup before rollback
- Removes last migration record
- ⚠️ WARNING: Does not automatically reverse schema changes
- You must manually run the rollback SQL or restore from backup

### Rollback Specific Migration
```bash
npm run migrate:down 0004_add_giveaway_concurrency_improvements
```

---

## Creating New Migrations

### Using Drizzle Kit (Recommended)
1. Modify schema in `shared/schema.ts`
2. Generate migration:
   ```bash
   npm run db:generate
   ```
3. Review generated SQL in `migrations/` directory
4. Add rollback SQL to migration file comments
5. Test migration on development database
6. Document in this README

### Manual SQL Migration
1. Create new `.sql` file with format: `XXXX_description.sql`
2. Use sequential numbering (e.g., `0005_add_new_feature.sql`)
3. Write forward migration SQL
4. Document rollback procedure in this README
5. Test thoroughly before production

---

## Migration Best Practices

### Before Applying Migrations
- ✅ Test on development database first
- ✅ Review SQL changes carefully
- ✅ Ensure backup exists (automatic with migration script)
- ✅ Check for data conflicts
- ✅ Plan rollback procedure

### During Migration
- ✅ Run during low-traffic periods
- ✅ Monitor application logs
- ✅ Have rollback plan ready
- ✅ Never run migrations concurrently (lock prevents this)

### After Migration
- ✅ Verify schema changes applied correctly
- ✅ Test application functionality
- ✅ Monitor for errors
- ✅ Keep backup for 30 days

---

## Migration Lock

The migration system uses a database lock to prevent concurrent migrations:
- Lock timeout: 10 minutes (auto-releases stale locks)
- Lock table: `migration_lock`
- Manual unlock (if needed):
  ```sql
  DELETE FROM migration_lock WHERE lock_id = 1;
  ```

---

## Backup Location

Backups are automatically created in: `services/stream-bot/backups/`
- Format: `streambot_YYYY-MM-DDTHH-MM-SS.sql`
- Retention: Manual (not auto-deleted)
- Restore command:
  ```bash
  psql $DATABASE_URL < backups/streambot_2025-11-15T10-30-00.sql
  ```

---

## Troubleshooting

### Migration Lock Stuck
```bash
# Check lock status
psql $DATABASE_URL -c "SELECT * FROM migration_lock;"

# Force release (use with caution)
psql $DATABASE_URL -c "DELETE FROM migration_lock WHERE lock_id = 1;"
```

### Migration Failed Midway
1. Check `drizzle_migrations` table for applied migrations
2. Manually fix any partial changes
3. Either complete the migration or rollback
4. Restore from backup if needed

### Rollback Not Working
1. Restore from backup:
   ```bash
   psql $DATABASE_URL < backups/streambot_TIMESTAMP.sql
   ```
2. Manually execute rollback SQL from this README

---

## Production Deployment Checklist

- [ ] All migrations tested on staging
- [ ] Backup verified and accessible
- [ ] Rollback plan documented
- [ ] Team notified of maintenance window
- [ ] Monitoring enabled
- [ ] Run `migrate:status` to verify current state
- [ ] Run `migrate:up` to apply migrations
- [ ] Verify application health after migration
- [ ] Monitor for 30 minutes post-migration

---

## Support

For migration issues:
1. Check migration status: `npm run migrate:status`
2. Review migration logs
3. Check database connection
4. Restore from backup if needed
5. Contact database administrator
