-- Drop incompatible agent tables
-- Run as: docker exec discord-bot-db psql -U ticketbot -d homelab_jarvis -f /tmp/drop_agent_tables.sql

BEGIN;

DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

COMMIT;

\echo 'All agent tables dropped successfully'
