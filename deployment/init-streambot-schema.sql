-- Stream Bot Database Schema
-- This creates all required tables for the stream-bot service

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Platform connections table
CREATE TABLE IF NOT EXISTS platform_connections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  platform_username TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  channel_id TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_connected_at TIMESTAMP,
  connection_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create unique index for platform_connections
CREATE UNIQUE INDEX IF NOT EXISTS platform_connections_user_id_platform_unique 
ON platform_connections(user_id, platform);

-- Bot configs table
CREATE TABLE IF NOT EXISTS bot_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  interval_mode TEXT NOT NULL DEFAULT 'manual',
  fixed_interval_minutes INTEGER,
  random_min_minutes INTEGER,
  random_max_minutes INTEGER,
  ai_model TEXT NOT NULL DEFAULT 'gpt-5-mini',
  ai_prompt_template TEXT,
  ai_temperature INTEGER DEFAULT 1,
  enable_chat_triggers BOOLEAN NOT NULL DEFAULT true,
  chat_keywords TEXT[] NOT NULL DEFAULT ARRAY['!snapple', '!fact']::text[],
  active_platforms TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_fact_posted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Bot instances table
CREATE TABLE IF NOT EXISTS bot_instances (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_heartbeat TIMESTAMP,
  error_message TEXT,
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Message history table
CREATE TABLE IF NOT EXISTS message_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_user TEXT,
  fact_content TEXT NOT NULL,
  posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO streambot;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO streambot;
