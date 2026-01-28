-- HomeLabHub Dashboard Tables
-- Run against homelab_jarvis database

\c homelab_jarvis;

-- Creative Studio Jobs Table
CREATE TABLE IF NOT EXISTS creative_jobs (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    pipeline VARCHAR(255),
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    input_images JSONB DEFAULT '[]'::jsonb,
    output_images JSONB DEFAULT '[]'::jsonb,
    parameters JSONB DEFAULT '{}'::jsonb,
    controlnet_config JSONB,
    error TEXT,
    user_id VARCHAR(255),
    parent_job_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Creative Pipelines Table
CREATE TABLE IF NOT EXISTS creative_pipelines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Creative Assets Table
CREATE TABLE IF NOT EXISTS creative_assets (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    filename VARCHAR(255),
    storage_path TEXT,
    width INTEGER,
    height INTEGER,
    size INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    job_id INTEGER REFERENCES creative_jobs(id),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    path TEXT,
    project_type VARCHAR(50),
    framework VARCHAR(50),
    detected_at TIMESTAMP,
    last_scanned TIMESTAMP,
    config JSONB,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Homelab Servers
CREATE TABLE IF NOT EXISTS homelab_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    host VARCHAR(255) NOT NULL,
    ssh_user VARCHAR(100) NOT NULL,
    port INTEGER DEFAULT 22,
    key_path VARCHAR(500),
    deploy_path VARCHAR(500),
    supports_wol BOOLEAN DEFAULT false,
    mac_address VARCHAR(17),
    broadcast_address VARCHAR(255),
    ipmi_host VARCHAR(255),
    ipmi_user VARCHAR(100),
    ipmi_password VARCHAR(255),
    ipmi_management_server VARCHAR(255),
    vnc_host VARCHAR(255),
    vnc_port INTEGER,
    novnc_url VARCHAR(500),
    location VARCHAR(50) DEFAULT 'local',
    capabilities TEXT[] DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP,
    health_metrics JSONB,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    location VARCHAR(50) NOT NULL,
    url VARCHAR(500),
    health_endpoint VARCHAR(255),
    status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    username VARCHAR(255),
    session_id VARCHAR(255),
    activity_type VARCHAR(50),
    action VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    resource_name VARCHAR(255),
    description TEXT,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    duration_ms INTEGER,
    success VARCHAR(10),
    timestamp TIMESTAMP DEFAULT NOW(),
    year_month VARCHAR(7),
    metadata_json JSONB
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    channels TEXT[] DEFAULT '{}',
    user_id VARCHAR(255),
    server_id VARCHAR(255),
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Website Builds
CREATE TABLE IF NOT EXISTS website_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    html TEXT NOT NULL,
    css TEXT,
    js TEXT,
    framework VARCHAR(50),
    description TEXT,
    thumbnail_url TEXT,
    is_published BOOLEAN DEFAULT false,
    published_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_creative_jobs_status ON creative_jobs(status);
CREATE INDEX IF NOT EXISTS idx_creative_jobs_type ON creative_jobs(type);
CREATE INDEX IF NOT EXISTS idx_creative_jobs_created_at ON creative_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_assets_job_id ON creative_assets(job_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homelab_servers_slug ON homelab_servers(slug);

-- System Metrics for Observability
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value VARCHAR(100) NOT NULL,
    tags JSONB,
    timestamp TIMESTAMP DEFAULT NOW(),
    metric_type VARCHAR(20) NOT NULL
);

-- System Alerts for Production Alerting
CREATE TABLE IF NOT EXISTS system_alerts (
    id VARCHAR(100) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    deduplication_key VARCHAR(500) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Incidents table (must exist before references)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    runbook_id VARCHAR(255),
    resolution TEXT,
    acknowledged_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Incident Events
CREATE TABLE IF NOT EXISTS incident_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Failure Records
CREATE TABLE IF NOT EXISTS failure_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_type VARCHAR(50) NOT NULL,
    service VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    fingerprint VARCHAR(64),
    context JSONB DEFAULT '{}',
    incident_id UUID REFERENCES incidents(id),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Failure Aggregates
CREATE TABLE IF NOT EXISTS failure_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint VARCHAR(64) NOT NULL UNIQUE,
    service VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMP DEFAULT NOW() NOT NULL,
    last_seen_at TIMESTAMP DEFAULT NOW() NOT NULL,
    incident_id UUID REFERENCES incidents(id),
    metadata JSONB DEFAULT '{}'
);

-- Content Pipelines for AI Influencer
CREATE TABLE IF NOT EXISTS content_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    persona_id UUID,
    template_id UUID,
    schedule_cron VARCHAR(100),
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for observability tables
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_category ON system_alerts(category);
CREATE INDEX IF NOT EXISTS idx_system_alerts_timestamp ON system_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_failure_records_fingerprint ON failure_records(fingerprint);
CREATE INDEX IF NOT EXISTS idx_content_pipelines_enabled ON content_pipelines(is_enabled);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO jarvis;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jarvis;

SELECT 'Dashboard tables created successfully!' as status;
