-- Creative Studio Projects Tables
-- Enables cross-device project storage for the Creative Studio

CREATE TABLE IF NOT EXISTS creative_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  thumbnail TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creative_project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES creative_projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_projects_user_id ON creative_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_projects_type ON creative_projects(type);
CREATE INDEX IF NOT EXISTS idx_creative_projects_updated_at ON creative_projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_project_assets_project_id ON creative_project_assets(project_id);
