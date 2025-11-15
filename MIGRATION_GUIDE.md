# Database Migration Guide

This guide covers database migration management for all services in the Homelab infrastructure.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Service-Specific Guides](#service-specific-guides)
4. [Unified Migration System](#unified-migration-system)
5. [Creating New Migrations](#creating-new-migrations)
6. [Rolling Back Migrations](#rolling-back-migrations)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Production Deployment](#production-deployment)

---

## Overview

### Services and Migration Tools

The Homelab infrastructure uses different migration tools for different services:

| Service | Tool | Language | Migration Directory |
|---------|------|----------|-------------------|
| **Dashboard** | Alembic | Python | `services/dashboard/alembic/versions/` |
| **Stream Bot** | Drizzle | TypeScript | `services/stream-bot/migrations/` |
| **Discord Bot** | Drizzle | TypeScript | `services/discord-bot/migrations/` |

### Migration Architecture

```
┌─────────────────────────────────────────────┐
│         Unified Migration System            │
│     (deployment/migrate-all.sh)             │
└────────────┬────────────────────────────────┘
             │
      ┌──────┴──────┬──────────────────┐
      │             │                  │
      ▼             ▼                  ▼
┌──────────┐  ┌──────────┐      ┌──────────┐
│Dashboard │  │Stream    │      │Discord   │
│(Alembic) │  │Bot       │      │Bot       │
│          │  │(Drizzle) │      │(Drizzle) │
└──────────┘  └──────────┘      └──────────┘
```

---

## Quick Start

### Check Migration Status (All Services)

```bash
# Using unified script
./deployment/migrate-all.sh status

# Or using homelab manager
./homelab-manager.sh
# Choose: 20 → 1
```

### Apply All Pending Migrations

```bash
# Using unified script (with prompts and backups)
./deployment/migrate-all.sh

# Or using homelab manager
./homelab-manager.sh
# Choose: 20 → 2
```

### Check Migration Status (Single Service)

```bash
# Dashboard
cd services/dashboard
alembic current
alembic heads

# Stream Bot
cd services/stream-bot
npm run migrate:status

# Discord Bot
cd services/discord-bot
npm run migrate:status
```

### Apply Migrations (Single Service)

```bash
# Dashboard
cd services/dashboard
alembic upgrade head

# Stream Bot
cd services/stream-bot
npm run migrate:up

# Discord Bot
cd services/discord-bot
npm run migrate:up
```

---

## Service-Specific Guides

### Dashboard (Alembic)

#### Check Current Migration
```bash
cd services/dashboard
alembic current
```

#### See Available Migrations
```bash
alembic history --verbose
```

#### Apply All Pending
```bash
alembic upgrade head
```

#### Apply to Specific Revision
```bash
alembic upgrade 006
```

#### Rollback One Migration
```bash
alembic downgrade -1
```

#### Rollback to Specific Revision
```bash
alembic downgrade 004
```

#### Create New Migration
```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "add user preferences table"

# Create empty migration
alembic revision -m "custom data migration"
```

#### Migration Files
- Location: `services/dashboard/alembic/versions/`
- Format: `XXX_description.py`
- Each file has `upgrade()` and `downgrade()` functions

---

### Stream Bot (Drizzle)

#### Check Migration Status
```bash
cd services/stream-bot
npm run migrate:status
```

#### Apply All Pending Migrations
```bash
npm run migrate:up
```
- Creates automatic backup
- Applies migrations in order
- Uses lock to prevent concurrent runs

#### Rollback Last Migration
```bash
npm run migrate:down
```

#### Rollback Specific Migration
```bash
npm run migrate:down 0003_add_platform_user_unique_constraint
```

#### Generate New Migration from Schema
```bash
npm run db:generate
```
- Reads schema from `shared/schema.ts`
- Generates SQL in `migrations/` directory
- Review and test before applying

#### Migration Files
- Location: `services/stream-bot/migrations/`
- Format: `XXXX_description.sql`
- See `services/stream-bot/migrations/README.md` for details

#### Key Migrations

**0003: Platform User Unique Constraint**
- Purpose: Security fix - prevents account hijacking
- Impact: HIGH - Critical security enhancement
- [Full documentation](services/stream-bot/migrations/README.md#0003_add_platform_user_unique_constraint)

**0004: Giveaway Concurrency Improvements**
- Purpose: Fix race conditions and prevent currency exploits
- Impact: MEDIUM - Improves system reliability
- [Full documentation](services/stream-bot/migrations/README.md#0004_add_giveaway_concurrency_improvements)

---

### Discord Bot (Drizzle)

#### Check Migration Status
```bash
cd services/discord-bot
npm run migrate:status
```

#### Apply All Pending Migrations
```bash
npm run migrate:up
```
- Auto-detects Neon vs Local PostgreSQL
- Creates backup (if applicable)
- Applies migrations with transaction safety

#### Rollback Last Migration
```bash
npm run migrate:down
```

#### Generate New Migration
```bash
npm run db:generate
```

#### Migration Files
- Location: `services/discord-bot/migrations/`
- Format: `XXXX_description.sql`
- See `services/discord-bot/migrations/README.md` for details

#### Database Detection

The Discord Bot automatically detects database type:

**Neon Cloud (Replit)**
- Uses `@neondatabase/serverless` driver
- WebSocket-based connection
- No pg_dump backups (use Replit UI)

**Local/Docker PostgreSQL**
- Uses standard `pg` driver
- TCP connection
- Supports pg_dump backups

---

## Unified Migration System

### Using the Unified Script

The `deployment/migrate-all.sh` script manages migrations across all services.

#### Features

- ✅ Checks all services for pending migrations
- ✅ Shows clear status for each service
- ✅ Prompts before applying changes
- ✅ Creates backups before migrations
- ✅ Applies migrations in dependency order
- ✅ Logs all operations to audit trail
- ✅ Supports rollback for each service

#### Commands

```bash
# Check status (no changes)
./deployment/migrate-all.sh status

# Apply all pending migrations (with prompts)
./deployment/migrate-all.sh

# Rollback last migration for a service
./deployment/migrate-all.sh rollback dashboard
./deployment/migrate-all.sh rollback stream-bot
./deployment/migrate-all.sh rollback discord-bot
```

#### Migration Order

Migrations are applied in this order:
1. **Dashboard** (infrastructure/core service)
2. **Stream Bot** (independent service)
3. **Discord Bot** (independent service)

This ensures dependencies are migrated first.

#### Backup Location

Backups are stored in: `migration-backups/`
- Format: `{service}_{timestamp}.sql`
- Retention: Manual (not auto-deleted)
- Use for disaster recovery

#### Audit Log

All migration operations are logged to: `migration-audit.log`
- Timestamped entries
- Success/failure status
- Error messages
- User confirmation records

---

## Creating New Migrations

### Dashboard (Alembic)

#### Auto-Generate from Model Changes

1. **Modify the model** in `services/dashboard/models/`
   ```python
   # Example: models/user_preferences.py
   class UserPreferences(db.Model):
       id = db.Column(UUID, primary_key=True)
       user_id = db.Column(String, nullable=False)
       theme = db.Column(String, default='dark')
   ```

2. **Generate migration**
   ```bash
   cd services/dashboard
   alembic revision --autogenerate -m "add user preferences"
   ```

3. **Review generated file**
   ```bash
   # Check: services/dashboard/alembic/versions/XXX_add_user_preferences.py
   # Verify upgrade() and downgrade() functions
   ```

4. **Test on development database**
   ```bash
   alembic upgrade head  # Apply
   alembic downgrade -1  # Test rollback
   alembic upgrade head  # Reapply
   ```

5. **Document in code** - Add comments explaining the migration

#### Manual Migration

```python
# services/dashboard/alembic/versions/XXX_custom_migration.py
def upgrade():
    op.execute("""
        -- Your custom SQL here
        UPDATE users SET email_verified = true WHERE created_at < '2025-01-01';
    """)

def downgrade():
    op.execute("""
        -- Reverse the operation
        UPDATE users SET email_verified = false WHERE created_at < '2025-01-01';
    """)
```

---

### Stream Bot & Discord Bot (Drizzle)

#### Auto-Generate from Schema

1. **Modify schema** in `shared/schema.ts`
   ```typescript
   export const userPreferences = pgTable('user_preferences', {
     id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
     userId: varchar('user_id').notNull(),
     theme: varchar('theme').default('dark'),
   });
   ```

2. **Generate migration**
   ```bash
   npm run db:generate
   ```

3. **Review generated SQL**
   ```bash
   # Check: migrations/XXXX_description.sql
   # Verify all statements are correct
   ```

4. **Add rollback documentation**
   - Update `migrations/README.md`
   - Document rollback SQL
   - Note any data implications

5. **Test on development**
   ```bash
   npm run migrate:up     # Apply
   npm run migrate:down   # Rollback
   npm run migrate:up     # Reapply
   ```

#### Manual SQL Migration

```sql
-- migrations/0005_add_custom_feature.sql

-- Add new column
ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{}';

-- Create index
CREATE INDEX idx_users_notification_prefs 
ON users USING gin(notification_preferences);

-- Backfill data
UPDATE users 
SET notification_preferences = '{"email": true, "push": false}'::jsonb
WHERE notification_preferences = '{}'::jsonb;
```

Then document rollback in README:
```sql
-- Rollback procedure:
DROP INDEX IF EXISTS idx_users_notification_prefs;
ALTER TABLE users DROP COLUMN IF EXISTS notification_preferences;
```

---

## Rolling Back Migrations

### When to Rollback

Rollback when:
- ❌ Migration causes application errors
- ❌ Migration takes too long (blocking production)
- ❌ Data corruption detected
- ❌ Breaking changes not backward compatible

**DO NOT** rollback if:
- ✅ Migration completed successfully
- ✅ Application is working normally
- ✅ Just want to make schema changes (create new migration instead)

### Rollback Procedures

#### Dashboard

```bash
cd services/dashboard

# Rollback last migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade 004

# Check current state
alembic current
```

#### Stream Bot / Discord Bot

```bash
cd services/stream-bot  # or discord-bot

# Rollback last migration
npm run migrate:down

# Rollback specific migration
npm run migrate:down 0004_add_giveaway_concurrency_improvements

# Verify rollback
npm run migrate:status
```

#### Using Unified Script

```bash
# Rollback from homelab manager
./homelab-manager.sh
# Choose: 20 → 3 → Select Service

# Or directly
./deployment/migrate-all.sh rollback stream-bot
```

### Post-Rollback Actions

After rolling back:

1. **Verify application works**
   - Test core functionality
   - Check for errors in logs
   - Monitor for issues

2. **Review what went wrong**
   - Check migration SQL
   - Review application code
   - Identify root cause

3. **Fix and reapply**
   - Create new migration if needed
   - Test thoroughly on development
   - Document the fix

---

## Best Practices

### Before Creating Migrations

- ✅ Design schema changes carefully
- ✅ Consider backward compatibility
- ✅ Plan for rollback scenario
- ✅ Test on local database first
- ✅ Review with team if significant changes

### Before Applying Migrations

- ✅ **Always backup first** (automatic in our scripts)
- ✅ Test on development/staging environment
- ✅ Review migration SQL carefully
- ✅ Check for long-running operations
- ✅ Plan maintenance window if needed
- ✅ Have rollback plan ready

### During Migration

- ✅ Run during low-traffic periods
- ✅ Monitor application logs
- ✅ Watch database performance
- ✅ Be ready to rollback quickly
- ✅ Don't interrupt migrations (wait for completion)

### After Migration

- ✅ Verify schema changes applied
- ✅ Test application functionality
- ✅ Monitor for errors (30 minutes minimum)
- ✅ Keep backup for 30 days
- ✅ Document any issues encountered

### General Guidelines

- ✅ One migration per logical change
- ✅ Use descriptive migration names
- ✅ Always include rollback procedure
- ✅ Never edit applied migrations
- ✅ Keep migrations in version control
- ✅ Document breaking changes clearly

---

## Troubleshooting

### Migration Lock Stuck

**Symptom**: "Migration lock held by..."

**Solution**:
```bash
# Check lock status
psql $DATABASE_URL -c "SELECT * FROM migration_lock;"

# If stale (>10 minutes), force release
psql $DATABASE_URL -c "DELETE FROM migration_lock WHERE lock_id = 1;"
```

### Migration Failed Midway

**Symptom**: Migration error, some changes applied

**Solution**:
1. Check `drizzle_migrations` table for applied migrations
2. Manually complete or reverse partial changes
3. Restore from backup if needed
4. Rerun migration

**Example**:
```bash
# Check applied migrations
psql $DATABASE_URL -c "SELECT * FROM drizzle_migrations ORDER BY applied_at;"

# Restore from backup
psql $DATABASE_URL < migration-backups/stream-bot_20251115_103000.sql
```

### Conflicting Migrations

**Symptom**: Two migrations modify same table/column

**Solution**:
1. Rollback both migrations
2. Merge into single migration
3. Test thoroughly
4. Apply merged migration

### Out of Order Migrations

**Symptom**: Migration ID/number conflicts

**Solution**:
- **Alembic**: Use `alembic merge` to create merge point
- **Drizzle**: Rename files to correct order, update `_journal.json`

### Database Connection Issues

**Symptom**: "Cannot connect to database"

**Solution**:
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# For Neon databases, check pooler URL
echo $DATABASE_POOLER_URL
```

### Rollback Not Working

**Symptom**: Rollback fails or doesn't reverse changes

**Solution**:
1. Check rollback SQL in migration file
2. Manually execute rollback commands
3. Restore from backup if needed

```bash
# Manual rollback example
psql $DATABASE_URL << EOF
-- Copy rollback SQL from migration README
ALTER TABLE giveaways DROP COLUMN entry_count;
DROP TABLE giveaway_entry_attempts;
EOF
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All migrations tested on staging
- [ ] Backup strategy confirmed
- [ ] Rollback plan documented
- [ ] Team notified of maintenance window
- [ ] Monitoring systems active
- [ ] Migration status checked: `./deployment/migrate-all.sh status`

### Deployment Steps

1. **Create backup**
   ```bash
   # Automatic with unified script
   ./deployment/migrate-all.sh
   ```

2. **Apply migrations**
   - Follow prompts
   - Monitor progress
   - Watch for errors

3. **Verify success**
   ```bash
   # Check migration status
   ./deployment/migrate-all.sh status
   
   # Test application
   curl https://your-app.com/health
   ```

4. **Monitor application**
   - Watch error logs for 30 minutes
   - Check application metrics
   - Verify functionality

### Post-Deployment

- ✅ Verify all migrations applied
- ✅ Application running normally
- ✅ No errors in logs
- ✅ Performance metrics normal
- ✅ Backup retained for 30 days

### If Something Goes Wrong

1. **Immediate rollback**
   ```bash
   ./deployment/migrate-all.sh rollback <service>
   ```

2. **Restore from backup** (if rollback fails)
   ```bash
   psql $DATABASE_URL < migration-backups/service_timestamp.sql
   ```

3. **Notify team and investigate**

---

## Migration Status Dashboard

### Web Interface

View migration status in the monitoring dashboard:

**URL**: `https://your-dashboard.com/monitoring`

**Features**:
- Real-time migration status for all services
- Applied vs pending migrations count
- Current revision information
- Auto-refresh every 30 seconds

### API Endpoint

```bash
# Get migration status programmatically
curl https://your-dashboard.com/api/migrations/status

# Response example:
{
  "success": true,
  "overall_status": "up_to_date",
  "total_pending": 0,
  "services": {
    "dashboard": {
      "status": "up_to_date",
      "current_revision": "006",
      "latest_revision": "006",
      "pending": 0
    },
    "stream-bot": {
      "status": "up_to_date",
      "applied": 4,
      "pending": 0
    },
    "discord-bot": {
      "status": "up_to_date",
      "applied": 3,
      "pending": 0
    }
  }
}
```

---

## Additional Resources

### Service-Specific Documentation

- **Stream Bot**: [services/stream-bot/migrations/README.md](services/stream-bot/migrations/README.md)
- **Discord Bot**: [services/discord-bot/migrations/README.md](services/discord-bot/migrations/README.md)

### External Documentation

- **Alembic**: https://alembic.sqlalchemy.org/
- **Drizzle ORM**: https://orm.drizzle.team/docs/migrations
- **PostgreSQL**: https://www.postgresql.org/docs/current/sql-commands.html

### Support

For migration issues:
1. Check this guide and service-specific READMEs
2. Review audit log: `migration-audit.log`
3. Check monitoring dashboard
4. Restore from backup if needed
5. Contact database administrator

---

## Summary

**Remember:**

1. ✅ Always backup before migrations
2. ✅ Test on development first
3. ✅ Use the unified script for consistency
4. ✅ Monitor after applying
5. ✅ Document everything
6. ✅ Have rollback plan ready

**Quick Commands:**

```bash
# Check status
./deployment/migrate-all.sh status

# Apply migrations
./deployment/migrate-all.sh

# Rollback if needed
./deployment/migrate-all.sh rollback <service>

# Use homelab manager
./homelab-manager.sh  # Option 20
```

**When in doubt:** Test on development, backup production, and proceed carefully!
