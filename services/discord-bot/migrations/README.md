# Discord Bot Database Migrations

This directory contains database schema migrations for the Discord Bot service using Drizzle ORM.

## Migration Files

### 0000_goofy_scream.sql
**Status**: ✅ Applied (Initial Schema)  
**Purpose**: Initial database schema with all core tables  
**Applied**: Auto-applied on first deployment

**Tables Created**:
- `bot_settings` - Per-server bot configuration
- `discord_users` - User authentication and profiles
- `servers` - Discord server (guild) information
- `ticket_categories` - Ticket categorization
- `ticket_messages` - Ticket conversation history
- `ticket_panel_categories` - Ticket panel button configuration
- `ticket_panels` - Ticket creation panels with embeds
- `tickets` - Support ticket management

**Rollback**: Not recommended - this is the foundation schema

---

### 0001_tricky_iron_monger.sql
**Status**: ✅ Applied  
**Purpose**: Add ticket panel configuration and customization features  
**Date**: Initial release

**Changes**:
- Enhanced ticket panel system with custom embeds
- Panel template support
- Category-specific configurations
- Role-based ticket assignment

**Rollback Risk**: LOW - No critical data structures affected

---

### 0002_add_auto_detection_fields.sql
**Status**: ✅ Applied  
**Purpose**: Add stream auto-detection capabilities for notifications  
**Date**: Recent update

**Changes**:
- Add stream notification configuration fields
- Auto-detection for Twitch/YouTube/Kick streams
- Notification channel settings per server

**Rollback Procedure**:
```sql
-- Remove auto-detection fields from relevant tables
-- (Specific SQL depends on exact schema changes)
ALTER TABLE bot_settings DROP COLUMN IF EXISTS stream_notification_channel_id;
ALTER TABLE bot_settings DROP COLUMN IF EXISTS enable_stream_notifications;
```

**Rollback Risk**: LOW - Non-critical feature addition

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
- Creates automatic backup before applying (if not Neon cloud)
- Applies all pending migrations in order
- Uses migration lock to prevent concurrent runs

### Rollback Last Migration
```bash
npm run migrate:down
```
- Creates backup before rollback (if not Neon cloud)
- Removes last migration record
- ⚠️ WARNING: Does not automatically reverse schema changes
- You must manually run the rollback SQL or restore from backup

### Rollback Specific Migration
```bash
npm run migrate:down 0002_add_auto_detection_fields
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
2. Use sequential numbering (e.g., `0003_add_new_feature.sql`)
3. Write forward migration SQL
4. Document rollback procedure in this README
5. Test thoroughly before production

---

## Migration Best Practices

### Before Applying Migrations
- ✅ Test on development database first
- ✅ Review SQL changes carefully
- ✅ Ensure backup exists (automatic for local PostgreSQL)
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

## Backup Information

### For Local PostgreSQL
- Backups are automatically created in: `services/discord-bot/backups/`
- Format: `discordbot_YYYY-MM-DDTHH-MM-SS.sql`
- Restore command:
  ```bash
  psql $DATABASE_URL < backups/discordbot_2025-11-15T10-30-00.sql
  ```

### For Neon Cloud (Replit)
- Automatic backups are skipped (pg_dump not accessible)
- Use Replit Database UI for backups and rollbacks
- Access via: Replit sidebar → Database → Backups

---

## Database Environment Detection

The migration script automatically detects your database type:

### Neon Cloud Database (Replit)
- Uses `@neondatabase/serverless` driver
- WebSocket-based connection
- No local pg_dump backups
- Detection: URL contains `neon.tech` or `neon.dev`

### Local/Docker PostgreSQL
- Uses standard `pg` driver
- TCP connection
- Supports pg_dump backups
- Detection: Standard PostgreSQL connection string

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

### Neon Database Backup
For Neon cloud databases (Replit):
1. Go to Replit Database UI
2. Click "Backups" tab
3. Create manual backup or use automatic ones
4. Restore via UI if needed

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
5. For Neon databases: Use Replit Database UI
6. Contact database administrator
