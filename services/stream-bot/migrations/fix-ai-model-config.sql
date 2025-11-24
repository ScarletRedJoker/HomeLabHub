-- Data Migration: Fix AI Model Configuration
-- Date: 2025-11-24
-- Purpose: Update existing records that use non-existent AI models (gpt-5-mini, gpt-4o-mini) to gpt-4o
-- 
-- This migration addresses the issue where:
-- - Old migration default was 'gpt-5-mini' (doesn't exist)
-- - Some configs may use 'gpt-4o-mini' (deprecated in our setup)
-- - Production requires 'gpt-4o' as the standard model
--
-- Run this AFTER deploying the code changes but BEFORE users start using the system.

BEGIN;

-- Update bot_configs table: Change gpt-5-mini and gpt-4o-mini to gpt-4o
UPDATE bot_configs 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini');

-- Verify the update
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM bot_configs
    WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini');
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % bot configs still have invalid ai_model values', invalid_count;
    END IF;
    
    RAISE NOTICE 'Migration successful: All bot configs now use valid AI models';
END $$;

COMMIT;

-- Optional: Display summary of current AI model usage
SELECT ai_model, COUNT(*) as count
FROM bot_configs
GROUP BY ai_model
ORDER BY count DESC;
