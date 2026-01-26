#!/bin/bash
set -e

echo "=========================================="
echo "  Nebula Command - Production DB Sync"
echo "=========================================="
echo ""

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    echo "Usage: DATABASE_URL=postgres://... ./sync-production-db.sh"
    exit 1
fi

echo "[1/5] Testing database connection..."
psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1 || {
    echo "ERROR: Cannot connect to database"
    exit 1
}
echo "      Connection OK"

echo ""
echo "[2/5] Ensuring users table has required columns..."
psql "$DATABASE_URL" <<'EOSQL'
-- Add username column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(100);

-- Add other potentially missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) DEFAULT 'viewer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create unique index on username if not exists
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL;
EOSQL
echo "      Schema updated"

echo ""
echo "[3/5] Fixing any users without usernames..."
psql "$DATABASE_URL" <<'EOSQL'
-- Set username from email for users that don't have one
UPDATE users 
SET username = COALESCE(
    NULLIF(split_part(email, '@', 1), ''),
    'user_' || LEFT(id::text, 8)
)
WHERE username IS NULL OR username = '';
EOSQL
echo "      Existing users fixed"

echo ""
echo "[4/5] Creating admin user if not exists..."
psql "$DATABASE_URL" <<'EOSQL'
-- Check if admin exists, create if not
INSERT INTO users (id, username, email, password_hash, role, is_active, created_at)
SELECT 
    gen_random_uuid(),
    'admin',
    'admin@nebula.local',
    '$2a$10$4rb3ZAc1VL5QI.WdRmGGbewjZcx3NlXY.JlqoAQqCZ5vdvX0T55Q.',
    'admin',
    true,
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'admin'
);
EOSQL
echo "      Admin user ready"

echo ""
echo "[5/5] Verifying setup..."
psql "$DATABASE_URL" -c "SELECT username, email, role, is_active FROM users ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "=========================================="
echo "  Database sync complete!"
echo ""
echo "  Login credentials:"
echo "    Username: admin"
echo "    Password: admin123"
echo "=========================================="
