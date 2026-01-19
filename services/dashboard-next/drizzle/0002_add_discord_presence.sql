-- Migration: Add Discord Presence Settings table
-- Created: 2026-01-19

CREATE TABLE IF NOT EXISTS discord_presence_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL UNIQUE,
  discord_app_id VARCHAR(100),
  presence_last_seen TIMESTAMP,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_presence_user_id ON discord_presence_settings(user_id);
