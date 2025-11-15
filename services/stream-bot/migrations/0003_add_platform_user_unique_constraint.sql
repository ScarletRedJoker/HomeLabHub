-- Migration: Add unique constraint on (platform, platform_user_id) to prevent account hijacking
-- Date: 2025-11-15
-- Purpose: Ensure one platform account (Twitch/YouTube/Kick) can only be linked to ONE StreamBot user
-- Security: Prevents attackers from linking someone else's platform account to their own StreamBot account

-- Add unique index on (platform, platform_user_id)
CREATE UNIQUE INDEX IF NOT EXISTS platform_connections_platform_platform_user_id_unique 
ON platform_connections (platform, platform_user_id);

-- Verify the constraint was created
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'platform_connections' 
AND indexname = 'platform_connections_platform_platform_user_id_unique';
