-- Remote Deployment history
CREATE TABLE IF NOT EXISTS remote_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending, running, success, failed, rolled_back
  git_commit VARCHAR(40),
  git_branch VARCHAR(100),
  previous_commit VARCHAR(40),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  triggered_by VARCHAR(100), -- user, webhook, schedule
  steps JSONB,
  logs TEXT[],
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Verification results
CREATE TABLE IF NOT EXISTS deployment_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES remote_deployments(id),
  environment VARCHAR(50),
  probe_results JSONB NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Environment status (cached)
CREATE TABLE IF NOT EXISTS environment_status (
  environment VARCHAR(50) PRIMARY KEY,
  online BOOLEAN DEFAULT false,
  last_deployment_id UUID REFERENCES remote_deployments(id),
  git_commit VARCHAR(40),
  git_branch VARCHAR(100),
  services JSONB,
  capabilities TEXT[],
  last_checked TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Configuration snapshots for rollback
CREATE TABLE IF NOT EXISTS config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type VARCHAR(50) NOT NULL, -- nebula, environments, services, pipelines
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_remote_deployments_environment ON remote_deployments(environment);
CREATE INDEX IF NOT EXISTS idx_remote_deployments_status ON remote_deployments(status);
CREATE INDEX IF NOT EXISTS idx_remote_deployments_created_at ON remote_deployments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_verifications_deployment_id ON deployment_verifications(deployment_id);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_config_type ON config_snapshots(config_type);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_created_at ON config_snapshots(created_at DESC);
