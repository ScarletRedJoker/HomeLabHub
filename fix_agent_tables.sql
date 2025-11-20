-- Fix agent tables type mismatch
-- This script drops all agent-related tables so migrations can recreate them properly

BEGIN;

-- Drop tables in correct order (child tables first)
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

COMMIT;

-- After running this, re-run the migrations:
-- docker exec homelab-dashboard python -m alembic upgrade head
