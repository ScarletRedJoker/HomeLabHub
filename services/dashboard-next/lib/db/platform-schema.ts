/**
 * Nebula Command - Platform Database Schema
 * Drizzle ORM schema for projects, agents, marketplace, and incidents
 */

import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, uuid, decimal, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  path: text("path"),
  projectType: varchar("project_type", { length: 50 }),
  framework: varchar("framework", { length: 50 }),
  detectedAt: timestamp("detected_at"),
  lastScanned: timestamp("last_scanned"),
  config: jsonb("config"),
  status: varchar("status", { length: 50 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id),
  environment: varchar("environment", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  version: varchar("version", { length: 50 }),
  buildLogs: text("build_logs"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketplacePackages = pgTable("marketplace_packages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  iconUrl: varchar("icon_url", { length: 500 }),
  repository: varchar("repository", { length: 500 }),
  version: varchar("version", { length: 50 }),
  manifest: jsonb("manifest").notNull(),
  downloads: integer("downloads").default(0),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const installations = pgTable("installations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: uuid("package_id").references(() => marketplacePackages.id),
  projectId: uuid("project_id").references(() => projects.id),
  status: varchar("status", { length: 50 }).notNull(),
  config: jsonb("config"),
  containerIds: text("container_ids").array(),
  port: integer("port"),
  installedAt: timestamp("installed_at").defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.7"),
  tools: text("tools").array(),
  config: jsonb("config"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const functions = pgTable("functions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  parameters: jsonb("parameters").notNull(),
  implementation: text("implementation"),
  implementationType: varchar("implementation_type", { length: 50 }),
  isBuiltin: boolean("is_builtin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentExecutions = pgTable("agent_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id").references(() => agents.id),
  input: text("input").notNull(),
  output: text("output"),
  status: varchar("status", { length: 50 }).notNull(),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  functionCalls: jsonb("function_calls"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  severity: varchar("severity", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  runbookId: varchar("runbook_id", { length: 255 }),
  resolution: text("resolution"),
  acknowledgedBy: varchar("acknowledged_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
});

export const runbookExecutions = pgTable("runbook_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid("incident_id").references(() => incidents.id),
  runbookName: varchar("runbook_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  stepsCompleted: integer("steps_completed").default(0),
  stepsTotal: integer("steps_total"),
  output: jsonb("output"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  provider: varchar("provider", { length: 50 }),
  zoneId: varchar("zone_id", { length: 255 }),
  sslStatus: varchar("ssl_status", { length: 50 }),
  sslExpiresAt: timestamp("ssl_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dnsRecords = pgTable("dns_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  domainId: uuid("domain_id").references(() => domains.id),
  recordType: varchar("record_type", { length: 10 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  content: varchar("content", { length: 500 }).notNull(),
  ttl: integer("ttl").default(3600),
  proxied: boolean("proxied").default(false),
  providerId: varchar("provider_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  location: varchar("location", { length: 50 }).notNull(),
  url: varchar("url", { length: 500 }),
  healthEndpoint: varchar("health_endpoint", { length: 255 }),
  status: varchar("status", { length: 50 }).default("unknown"),
  lastHealthCheck: timestamp("last_health_check"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  tags: text("tags").array().default([]),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  trigger: jsonb("trigger").notNull(),
  actions: jsonb("actions").notNull(),
  enabled: boolean("enabled").default(true),
  lastRun: timestamp("last_run"),
  runCount: integer("run_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workflowExecutions = pgTable("workflow_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id),
  status: varchar("status", { length: 50 }).notNull(),
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(),
  output: jsonb("output"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type MarketplacePackage = typeof marketplacePackages.$inferSelect;
export type Installation = typeof installations.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Function = typeof functions.$inferSelect;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }),
  username: varchar("username", { length: 255 }),
  sessionId: varchar("session_id", { length: 255 }),
  activityType: varchar("activity_type", { length: 50 }),
  action: varchar("action", { length: 100 }),
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 255 }),
  resourceName: varchar("resource_name", { length: 255 }),
  description: text("description"),
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: varchar("user_agent", { length: 500 }),
  durationMs: integer("duration_ms"),
  success: varchar("success", { length: 10 }),
  timestamp: timestamp("timestamp").defaultNow(),
  yearMonth: varchar("year_month", { length: 7 }),
  metadataJson: jsonb("metadata_json"),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export const templateCatalog = pgTable("template_catalog", {
  id: serial("id").primaryKey(),
  name: text("name"),
  description: text("description"),
  category: text("category"),
  tags: text("tags"),
  templateType: text("template_type"),
  templateJson: text("template_json"),
  previewImageUrl: text("preview_image_url"),
  isOfficial: boolean("is_official"),
  sourceServerId: text("source_server_id"),
  createdBy: text("created_by"),
  createdByUsername: text("created_by_username"),
  installCount: integer("install_count").default(0),
  rating: integer("rating"),
  ratingCount: integer("rating_count").default(0),
  isPublic: boolean("is_public").default(true),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type TemplateCatalog = typeof templateCatalog.$inferSelect;
export type NewTemplateCatalog = typeof templateCatalog.$inferInsert;

export const communityNodes = pgTable("community_nodes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  ownerId: varchar("owner_id", { length: 255 }),
  ownerName: varchar("owner_name", { length: 255 }),
  storageUsed: decimal("storage_used", { precision: 20, scale: 0 }).default("0"),
  storageTotal: decimal("storage_total", { precision: 20, scale: 0 }).default("0"),
  mediaCount: integer("media_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeen: timestamp("last_seen"),
});

export type CommunityNode = typeof communityNodes.$inferSelect;
export type NewCommunityNode = typeof communityNodes.$inferInsert;

export const homelabServers = pgTable("homelab_servers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  host: varchar("host", { length: 255 }).notNull(),
  user: varchar("ssh_user", { length: 100 }).notNull(),
  port: integer("port").default(22),
  keyPath: varchar("key_path", { length: 500 }),
  deployPath: varchar("deploy_path", { length: 500 }),
  supportsWol: boolean("supports_wol").default(false),
  macAddress: varchar("mac_address", { length: 17 }),
  broadcastAddress: varchar("broadcast_address", { length: 255 }),
  ipmiHost: varchar("ipmi_host", { length: 255 }),
  ipmiUser: varchar("ipmi_user", { length: 100 }),
  ipmiPassword: varchar("ipmi_password", { length: 255 }),
  ipmiManagementServer: varchar("ipmi_management_server", { length: 255 }),
  vncHost: varchar("vnc_host", { length: 255 }),
  vncPort: integer("vnc_port"),
  noVncUrl: varchar("novnc_url", { length: 500 }),
  location: varchar("location", { length: 50 }).default("local"),
  capabilities: text("capabilities").array().default([]),
  status: varchar("status", { length: 50 }).default("unknown"),
  lastHealthCheck: timestamp("last_health_check"),
  healthMetrics: jsonb("health_metrics"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type HomelabServer = typeof homelabServers.$inferSelect;
export type NewHomelabServer = typeof homelabServers.$inferInsert;

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  channels: text("channels").array().default([]),
  userId: varchar("user_id", { length: 255 }),
  serverId: varchar("server_id", { length: 255 }),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export const eventSubscriptions = pgTable("event_subscriptions", {
  id: serial("id").primaryKey(),
  channel: varchar("channel", { length: 50 }).notNull(),
  webhookUrl: varchar("webhook_url", { length: 500 }),
  email: varchar("email", { length: 255 }),
  categories: text("categories").array().default([]),
  severities: text("severities").array().default([]),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EventSubscription = typeof eventSubscriptions.$inferSelect;
export type NewEventSubscription = typeof eventSubscriptions.$inferInsert;

export const deploymentPipelines = pgTable("deployment_pipelines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  targetServerId: uuid("target_server_id").references(() => homelabServers.id),
  branch: varchar("branch", { length: 100 }).default("main"),
  deployType: varchar("deploy_type", { length: 50 }).notNull(), // docker, pm2, static
  buildCommand: text("build_command"),
  startCommand: text("start_command"),
  envVars: jsonb("env_vars"),
  healthCheckUrl: varchar("health_check_url", { length: 500 }),
  autoRollback: boolean("auto_rollback").default(true),
  scheduleCron: varchar("schedule_cron", { length: 100 }),
  lastRunStatus: varchar("last_run_status", { length: 50 }),
  lastRunAt: timestamp("last_run_at"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pipelineId: uuid("pipeline_id").references(() => deploymentPipelines.id).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // pending, running, success, failed, cancelled
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // manual, webhook, schedule
  commitHash: varchar("commit_hash", { length: 40 }),
  commitMessage: text("commit_message"),
  logs: jsonb("logs"),
  buildArtifactUrl: varchar("build_artifact_url", { length: 500 }),
  containerIds: text("container_ids").array(),
  rollbackVersion: varchar("rollback_version", { length: 100 }),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const pipelineSteps = pgTable("pipeline_steps", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id").references(() => pipelineRuns.id).notNull(),
  stepNumber: integer("step_number").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  command: text("command"),
  output: text("output"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const serverMetricsHistory = pgTable("server_metrics_history", {
  id: serial("id").primaryKey(),
  serverId: uuid("server_id").references(() => homelabServers.id).notNull(),
  cpuPercent: decimal("cpu_percent", { precision: 5, scale: 2 }),
  memoryPercent: decimal("memory_percent", { precision: 5, scale: 2 }),
  memoryUsedMb: integer("memory_used_mb"),
  memoryTotalMb: integer("memory_total_mb"),
  diskPercent: decimal("disk_percent", { precision: 5, scale: 2 }),
  diskUsedGb: integer("disk_used_gb"),
  diskTotalGb: integer("disk_total_gb"),
  networkInMb: decimal("network_in_mb", { precision: 10, scale: 2 }),
  networkOutMb: decimal("network_out_mb", { precision: 10, scale: 2 }),
  loadAverage1: decimal("load_average_1", { precision: 5, scale: 2 }),
  loadAverage5: decimal("load_average_5", { precision: 5, scale: 2 }),
  loadAverage15: decimal("load_average_15", { precision: 5, scale: 2 }),
  containerCount: integer("container_count"),
  processCount: integer("process_count"),
  uptimeSeconds: integer("uptime_seconds"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const aiModelUsage = pgTable("ai_model_usage", {
  id: serial("id").primaryKey(),
  modelName: varchar("model_name", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // ollama, openai, replicate
  requestType: varchar("request_type", { length: 50 }), // generate, chat, embed
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  durationMs: integer("duration_ms"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  userId: varchar("user_id", { length: 255 }),
  metadata: jsonb("metadata"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const quickStartKits = pgTable("quick_start_kits", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // youtuber, streamer, developer, musician, community
  icon: varchar("icon", { length: 100 }),
  colorScheme: varchar("color_scheme", { length: 50 }),
  features: jsonb("features").notNull(), // Array of feature objects
  templateIds: text("template_ids").array().default([]),
  estimatedSetupTime: integer("estimated_setup_time"), // minutes
  popularity: integer("popularity").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectAssets = pgTable("project_assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  assetType: varchar("asset_type", { length: 50 }).notNull(), // logo, screenshot, document, config
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 500 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  metadata: jsonb("metadata"),
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiSessions = pgTable("ai_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }),
  provider: varchar("provider", { length: 50 }),
  model: varchar("model", { length: 100 }),
  toolsUsed: text("tools_used").array().default([]),
  totalMessages: integer("total_messages").default(0),
  totalTokens: integer("total_tokens").default(0),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").references(() => aiSessions.id).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  provider: varchar("provider", { length: 50 }),
  model: varchar("model", { length: 100 }),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiMemories = pgTable("ai_memories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  memoryType: varchar("memory_type", { length: 50 }).notNull(),
  content: text("content").notNull(),
  embedding: text("embedding"),
  tags: text("tags").array().default([]),
  importance: integer("importance").default(5),
  accessCount: integer("access_count").default(0),
  lastAccessed: timestamp("last_accessed"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiLearnings = pgTable("ai_learnings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  pattern: text("pattern").notNull(),
  correction: text("correction"),
  confidence: integer("confidence").default(50),
  occurrences: integer("occurrences").default(1),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const websiteBuilds = pgTable("website_builds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  html: text("html").notNull(),
  css: text("css"),
  js: text("js"),
  version: integer("version").default(1),
  isPublished: boolean("is_published").default(false),
  publishedUrl: varchar("published_url", { length: 500 }),
  thumbnail: text("thumbnail"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const websiteVersions = pgTable("website_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: uuid("website_id").references(() => websiteBuilds.id).notNull(),
  version: integer("version").notNull(),
  html: text("html").notNull(),
  css: text("css"),
  js: text("js"),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const automationWorkflows = pgTable("automation_workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  nodes: jsonb("nodes").notNull().default([]),
  connections: jsonb("connections").notNull().default([]),
  isActive: boolean("is_active").default(false),
  lastRun: timestamp("last_run"),
  runCount: integer("run_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const botConfigs = pgTable("bot_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  botType: varchar("bot_type", { length: 50 }).notNull(),
  config: jsonb("config").notNull(),
  commands: jsonb("commands").notNull().default([]),
  isRunning: boolean("is_running").default(false),
  lastStarted: timestamp("last_started"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceRegistry = pgTable("service_registry", {
  id: serial("id").primaryKey(),
  serviceName: varchar("service_name", { length: 64 }).notNull(),
  environment: varchar("environment", { length: 32 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  capabilities: text("capabilities").array().default([]),
  lastHeartbeat: timestamp("last_heartbeat").defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => ({
  uniqueServiceEnv: sql`UNIQUE(service_name, environment)`,
}));

export type ServiceRegistry = typeof serviceRegistry.$inferSelect;
export type NewServiceRegistry = typeof serviceRegistry.$inferInsert;

export type DeploymentPipeline = typeof deploymentPipelines.$inferSelect;
export type NewDeploymentPipeline = typeof deploymentPipelines.$inferInsert;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
export type PipelineStep = typeof pipelineSteps.$inferSelect;
export type ServerMetricsHistory = typeof serverMetricsHistory.$inferSelect;
export type NewServerMetricsHistory = typeof serverMetricsHistory.$inferInsert;
export type AiModelUsage = typeof aiModelUsage.$inferSelect;
export type NewAiModelUsage = typeof aiModelUsage.$inferInsert;
export type QuickStartKit = typeof quickStartKits.$inferSelect;
export type NewQuickStartKit = typeof quickStartKits.$inferInsert;
export type ProjectAsset = typeof projectAssets.$inferSelect;
export type AiSession = typeof aiSessions.$inferSelect;
export type NewAiSession = typeof aiSessions.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
export type AiMemory = typeof aiMemories.$inferSelect;
export type NewAiMemory = typeof aiMemories.$inferInsert;
export type AiLearning = typeof aiLearnings.$inferSelect;
export type NewAiLearning = typeof aiLearnings.$inferInsert;

export const remoteDeployments = pgTable("remote_deployments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  environment: varchar("environment", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  gitCommit: varchar("git_commit", { length: 40 }),
  gitBranch: varchar("git_branch", { length: 100 }),
  previousCommit: varchar("previous_commit", { length: 40 }),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  triggeredBy: varchar("triggered_by", { length: 100 }),
  steps: jsonb("steps"),
  logs: text("logs").array(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deploymentVerifications = pgTable("deployment_verifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  deploymentId: uuid("deployment_id").references(() => remoteDeployments.id),
  environment: varchar("environment", { length: 50 }),
  probeResults: jsonb("probe_results").notNull(),
  passed: integer("passed").notNull(),
  failed: integer("failed").notNull(),
  total: integer("total").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const environmentStatus = pgTable("environment_status", {
  environment: varchar("environment", { length: 50 }).primaryKey(),
  online: boolean("online").default(false),
  lastDeploymentId: uuid("last_deployment_id").references(() => remoteDeployments.id),
  gitCommit: varchar("git_commit", { length: 40 }),
  gitBranch: varchar("git_branch", { length: 100 }),
  services: jsonb("services"),
  capabilities: text("capabilities").array(),
  lastChecked: timestamp("last_checked"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const configSnapshots = pgTable("config_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  configType: varchar("config_type", { length: 50 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type RemoteDeployment = typeof remoteDeployments.$inferSelect;
export type NewRemoteDeployment = typeof remoteDeployments.$inferInsert;
export type DeploymentVerification = typeof deploymentVerifications.$inferSelect;
export type NewDeploymentVerification = typeof deploymentVerifications.$inferInsert;
export type EnvironmentStatus = typeof environmentStatus.$inferSelect;
export type NewEnvironmentStatus = typeof environmentStatus.$inferInsert;
export type ConfigSnapshot = typeof configSnapshots.$inferSelect;
export type NewConfigSnapshot = typeof configSnapshots.$inferInsert;

export const shortUrls = pgTable("short_urls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  shortCode: varchar("short_code", { length: 10 }).notNull().unique(),
  originalUrl: text("original_url").notNull(),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  clickCount: integer("click_count").default(0),
  lastClickedAt: timestamp("last_clicked_at"),
  creatorIp: varchar("creator_ip", { length: 45 }),
  isActive: boolean("is_active").default(true),
});

export const urlClicks = pgTable("url_clicks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  shortUrlId: uuid("short_url_id").references(() => shortUrls.id).notNull(),
  clickedAt: timestamp("clicked_at").defaultNow(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  country: varchar("country", { length: 2 }),
});

export type ShortUrl = typeof shortUrls.$inferSelect;
export type NewShortUrl = typeof shortUrls.$inferInsert;
export type UrlClick = typeof urlClicks.$inferSelect;
export type NewUrlClick = typeof urlClicks.$inferInsert;

export const discordPresenceSettings = pgTable("discord_presence_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  discordAppId: varchar("discord_app_id", { length: 100 }),
  presenceLastSeen: timestamp("presence_last_seen"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DiscordPresenceSettings = typeof discordPresenceSettings.$inferSelect;
export type NewDiscordPresenceSettings = typeof discordPresenceSettings.$inferInsert;

export const jarvisJobs = pgTable("jarvis_jobs", {
  id: varchar("id", { length: 50 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  progress: integer("progress").default(0),
  params: jsonb("params").notNull().default({}),
  result: jsonb("result"),
  error: text("error"),
  subagentId: varchar("subagent_id", { length: 50 }),
  parentJobId: varchar("parent_job_id", { length: 50 }),
  retries: integer("retries").default(0),
  maxRetries: integer("max_retries").default(2),
  timeout: integer("timeout").default(120000),
  notifyOnComplete: boolean("notify_on_complete").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const jarvisSubagents = pgTable("jarvis_subagents", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("idle"),
  currentJobId: varchar("current_job_id", { length: 50 }),
  capabilities: text("capabilities").array().default([]),
  preferLocalAI: boolean("prefer_local_ai").default(true),
  tasksCompleted: integer("tasks_completed").default(0),
  tasksRunning: integer("tasks_running").default(0),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
});

export const jarvisTaskReviews = pgTable("jarvis_task_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id", { length: 50 }).references(() => jarvisJobs.id).notNull(),
  executorSubagentId: varchar("executor_subagent_id", { length: 50 }),
  verifierSubagentId: varchar("verifier_subagent_id", { length: 50 }),
  reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
  issues: jsonb("issues").default([]),
  suggestions: jsonb("suggestions").default([]),
  fixAttempts: integer("fix_attempts").default(0),
  escalated: boolean("escalated").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type JarvisJob = typeof jarvisJobs.$inferSelect;
export type NewJarvisJob = typeof jarvisJobs.$inferInsert;
export type JarvisSubagent = typeof jarvisSubagents.$inferSelect;
export type NewJarvisSubagent = typeof jarvisSubagents.$inferInsert;
export type JarvisTaskReview = typeof jarvisTaskReviews.$inferSelect;
export type NewJarvisTaskReview = typeof jarvisTaskReviews.$inferInsert;

// ============================================
// Jarvis Agent Configuration System
// ============================================

export const jarvisAgents = pgTable("jarvis_agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  persona: text("persona").notNull(),
  description: text("description"),
  capabilities: jsonb("capabilities").notNull().default([]),
  tools: jsonb("tools").notNull().default([]),
  modelPreference: varchar("model_preference", { length: 100 }).default("llama3.2"),
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.70"),
  maxTokens: integer("max_tokens").default(4096),
  nodeAffinity: varchar("node_affinity", { length: 50 }).default("any"),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jarvisAgentExecutions = pgTable("jarvis_agent_executions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => jarvisAgents.id).notNull(),
  task: text("task").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  input: jsonb("input").default({}),
  output: jsonb("output"),
  tokensUsed: integer("tokens_used"),
  executionTimeMs: integer("execution_time_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type JarvisAgent = typeof jarvisAgents.$inferSelect;
export type NewJarvisAgent = typeof jarvisAgents.$inferInsert;
export type JarvisAgentExecution = typeof jarvisAgentExecutions.$inferSelect;
export type NewJarvisAgentExecution = typeof jarvisAgentExecutions.$inferInsert;

// ============================================
// Nebula Creative Engine Schema
// ============================================

export const creativeJobs = pgTable("creative_jobs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // 'text-to-image', 'image-to-image', 'inpainting', 'outpainting', 'controlnet', 'upscale', 'face-swap', 'batch'
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  pipeline: varchar("pipeline", { length: 255 }),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  inputImages: jsonb("input_images").default([]),
  outputImages: jsonb("output_images").default([]),
  parameters: jsonb("parameters").default({}),
  controlnetConfig: jsonb("controlnet_config"),
  error: text("error"),
  userId: varchar("user_id", { length: 255 }),
  parentJobId: integer("parent_job_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const creativePipelines = pgTable("creative_pipelines", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  stages: jsonb("stages").notNull().default([]),
  isTemplate: boolean("is_template").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creativeAssets = pgTable("creative_assets", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // 'input', 'output', 'reference', 'controlnet_map', 'template'
  filename: varchar("filename", { length: 255 }).notNull(),
  path: varchar("path", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  size: integer("size"),
  metadata: jsonb("metadata").default({}),
  jobId: integer("job_id").references(() => creativeJobs.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CreativeJob = typeof creativeJobs.$inferSelect;
export type NewCreativeJob = typeof creativeJobs.$inferInsert;
export type CreativePipeline = typeof creativePipelines.$inferSelect;
export type NewCreativePipeline = typeof creativePipelines.$inferInsert;
export type CreativeAsset = typeof creativeAssets.$inferSelect;
export type NewCreativeAsset = typeof creativeAssets.$inferInsert;

// ============================================
// Jarvis Workflow Launcher System
// ============================================

export const jarvisWorkflows = pgTable("jarvis_workflows", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  steps: jsonb("steps").notNull().default([]),
  triggerType: varchar("trigger_type", { length: 50 }).notNull().default("manual"),
  triggerConfig: jsonb("trigger_config").default({}),
  isActive: boolean("is_active").default(true),
  isTemplate: boolean("is_template").default(false),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jarvisWorkflowRuns = pgTable("jarvis_workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").references(() => jarvisWorkflows.id).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  currentStep: integer("current_step").default(0),
  stepResults: jsonb("step_results").default([]),
  context: jsonb("context").default({}),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type JarvisWorkflow = typeof jarvisWorkflows.$inferSelect;
export type NewJarvisWorkflow = typeof jarvisWorkflows.$inferInsert;
export type JarvisWorkflowRun = typeof jarvisWorkflowRuns.$inferSelect;
export type NewJarvisWorkflowRun = typeof jarvisWorkflowRuns.$inferInsert;

// ============================================
// Jarvis Security & Verification System
// ============================================

export const jarvisSecurityRules = pgTable("jarvis_security_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ruleType: varchar("rule_type", { length: 50 }).notNull(), // 'content_filter', 'output_validator', 'input_sanitizer', 'rate_limit'
  pattern: text("pattern").notNull(), // regex or keywords to match
  action: varchar("action", { length: 20 }).notNull(), // 'block', 'warn', 'log', 'redact'
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // 'low', 'medium', 'high', 'critical'
  isActive: boolean("is_active").default(true),
  isBuiltin: boolean("is_builtin").default(false),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jarvisSecurityEvents = pgTable("jarvis_security_events", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => jarvisSecurityRules.id),
  eventType: varchar("event_type", { length: 20 }).notNull(), // 'blocked', 'warned', 'logged', 'redacted'
  agentId: integer("agent_id"),
  executionId: integer("execution_id"),
  inputPreview: text("input_preview"), // first 500 chars of flagged input
  outputPreview: text("output_preview"), // first 500 chars of flagged output
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JarvisSecurityRule = typeof jarvisSecurityRules.$inferSelect;
export type NewJarvisSecurityRule = typeof jarvisSecurityRules.$inferInsert;
export type JarvisSecurityEvent = typeof jarvisSecurityEvents.$inferSelect;
export type NewJarvisSecurityEvent = typeof jarvisSecurityEvents.$inferInsert;

// ============================================
// Secrets Management System
// ============================================

export const deploymentSecrets = pgTable("deployment_secrets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  keyName: varchar("key_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("custom"),
  targets: jsonb("targets").notNull().default([]),
  valueHash: varchar("value_hash", { length: 64 }),
  encryptedValue: text("encrypted_value"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const secretSyncLogs = pgTable("secret_sync_logs", {
  id: serial("id").primaryKey(),
  deploymentTarget: varchar("deployment_target", { length: 50 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  message: text("message"),
  secretsAffected: integer("secrets_affected").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tokenRotationConfig = pgTable("token_rotation_config", {
  id: serial("id").primaryKey(),
  tokenName: varchar("token_name", { length: 255 }).notNull().unique(),
  autoRotate: boolean("auto_rotate").default(false),
  rotationIntervalDays: integer("rotation_interval_days").default(30),
  lastRotatedAt: timestamp("last_rotated_at"),
  expiresAt: timestamp("expires_at"),
  rotationHistory: jsonb("rotation_history").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deploymentTargets = pgTable("deployment_targets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  connectionType: varchar("connection_type", { length: 20 }).notNull(),
  sshHost: varchar("ssh_host", { length: 255 }),
  sshUser: varchar("ssh_user", { length: 100 }),
  sshPort: integer("ssh_port").default(22),
  agentUrl: varchar("agent_url", { length: 500 }),
  envFilePath: varchar("env_file_path", { length: 500 }),
  status: varchar("status", { length: 20 }).default("unknown"),
  lastConnectedAt: timestamp("last_connected_at"),
  secretsCount: integer("secrets_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DeploymentSecret = typeof deploymentSecrets.$inferSelect;
export type NewDeploymentSecret = typeof deploymentSecrets.$inferInsert;
export type SecretSyncLog = typeof secretSyncLogs.$inferSelect;
export type NewSecretSyncLog = typeof secretSyncLogs.$inferInsert;
export type TokenRotationConfig = typeof tokenRotationConfig.$inferSelect;
export type NewTokenRotationConfig = typeof tokenRotationConfig.$inferInsert;
export type DeploymentTarget = typeof deploymentTargets.$inferSelect;
export type NewDeploymentTarget = typeof deploymentTargets.$inferInsert;

// ============================================
// Video Generation Pipeline System
// ============================================

export const videoJobs = pgTable("video_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: varchar("mode", { length: 50 }).notNull(), // 'text-to-video', 'image-to-video', 'video-to-video'
  status: varchar("status", { length: 50 }).notNull().default("queued"), // 'queued', 'processing', 'completed', 'failed', 'cancelled'
  progress: integer("progress").default(0),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  inputImage: text("input_image"),
  inputVideo: text("input_video"),
  outputUrl: text("output_url"),
  thumbnailUrl: text("thumbnail_url"),
  previewFrames: jsonb("preview_frames").default([]),
  duration: integer("duration").default(16), // frames
  fps: integer("fps").default(8),
  width: integer("width").default(512),
  height: integer("height").default(512),
  motionScale: decimal("motion_scale", { precision: 4, scale: 2 }).default("1.00"),
  cfgScale: decimal("cfg_scale", { precision: 4, scale: 2 }).default("7.00"),
  steps: integer("steps").default(25),
  scheduler: varchar("scheduler", { length: 100 }).default("euler"),
  animateDiffModel: varchar("animatediff_model", { length: 255 }),
  cameraMotion: jsonb("camera_motion").default({}), // { pan: 0, zoom: 0, rotate: 0 }
  subjectMotion: decimal("subject_motion", { precision: 4, scale: 2 }).default("1.00"),
  seed: integer("seed").default(-1),
  presetId: uuid("preset_id"),
  comfyJobId: varchar("comfy_job_id", { length: 255 }),
  error: text("error"),
  userId: varchar("user_id", { length: 255 }),
  batchId: uuid("batch_id"),
  batchIndex: integer("batch_index"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const videoPresets = pgTable("video_presets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  mode: varchar("mode", { length: 50 }).notNull().default("text-to-video"),
  duration: integer("duration").default(16),
  fps: integer("fps").default(8),
  width: integer("width").default(512),
  height: integer("height").default(512),
  motionScale: decimal("motion_scale", { precision: 4, scale: 2 }).default("1.00"),
  cfgScale: decimal("cfg_scale", { precision: 4, scale: 2 }).default("7.00"),
  steps: integer("steps").default(25),
  scheduler: varchar("scheduler", { length: 100 }).default("euler"),
  animateDiffModel: varchar("animatediff_model", { length: 255 }),
  cameraMotion: jsonb("camera_motion").default({}),
  subjectMotion: decimal("subject_motion", { precision: 4, scale: 2 }).default("1.00"),
  negativePrompt: text("negative_prompt"),
  isDefault: boolean("is_default").default(false),
  isPublic: boolean("is_public").default(true),
  userId: varchar("user_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type VideoJob = typeof videoJobs.$inferSelect;
export type NewVideoJob = typeof videoJobs.$inferInsert;
export type VideoPreset = typeof videoPresets.$inferSelect;
export type NewVideoPreset = typeof videoPresets.$inferInsert;

// ============================================
// AI Model Marketplace System
// ============================================

export const aiModels = pgTable("ai_models", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // checkpoint, lora, embedding, controlnet, vae
  source: varchar("source", { length: 50 }).notNull(), // civitai, huggingface, local
  sourceUrl: text("source_url"),
  sourceId: varchar("source_id", { length: 255 }),
  version: varchar("version", { length: 100 }),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  fileSize: decimal("file_size", { precision: 20, scale: 0 }),
  downloadedAt: timestamp("downloaded_at"),
  installedPath: text("installed_path"),
  nodeId: varchar("node_id", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("available"), // available, downloading, installed, error
  downloadProgress: integer("download_progress").default(0),
  lastUsed: timestamp("last_used"),
  useCount: integer("use_count").default(0),
  tags: text("tags").array().default([]),
  creator: varchar("creator", { length: 255 }),
  license: varchar("license", { length: 100 }),
  nsfw: boolean("nsfw").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const modelDownloads = pgTable("model_downloads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: uuid("model_id").references(() => aiModels.id),
  status: varchar("status", { length: 50 }).notNull().default("queued"), // queued, downloading, extracting, installing, completed, failed
  progress: integer("progress").default(0),
  downloadUrl: text("download_url").notNull(),
  destinationPath: text("destination_path"),
  bytesDownloaded: decimal("bytes_downloaded", { precision: 20, scale: 0 }).default("0"),
  totalBytes: decimal("total_bytes", { precision: 20, scale: 0 }),
  speed: decimal("speed", { precision: 15, scale: 0 }), // bytes per second
  eta: integer("eta"), // seconds remaining
  error: text("error"),
  checksum: varchar("checksum", { length: 255 }),
  checksumVerified: boolean("checksum_verified"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiModel = typeof aiModels.$inferSelect;
export type NewAiModel = typeof aiModels.$inferInsert;
export type ModelDownload = typeof modelDownloads.$inferSelect;
export type NewModelDownload = typeof modelDownloads.$inferInsert;

// ============================================
// Visual Website Builder System
// ============================================

export const websiteProjects = pgTable("website_projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull().default("custom"), // portfolio, landing, blog, ecommerce, custom
  status: varchar("status", { length: 50 }).notNull().default("draft"), // draft, published, archived
  thumbnail: text("thumbnail"),
  domain: varchar("domain", { length: 255 }),
  favicon: text("favicon"),
  settings: jsonb("settings"), // global settings like colors, fonts, meta
  globalCss: text("global_css"),
  globalJs: text("global_js"),
  publishedAt: timestamp("published_at"),
  publishedUrl: varchar("published_url", { length: 500 }),
  userId: varchar("user_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const websitePages = pgTable("website_pages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => websiteProjects.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }),
  description: text("description"),
  isHomepage: boolean("is_homepage").default(false),
  components: jsonb("components").notNull().default([]), // array of component definitions
  pageCss: text("page_css"),
  pageJs: text("page_js"),
  metaTags: jsonb("meta_tags"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const websiteComponents = pgTable("website_components", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // headers, content, forms, footers, layout
  type: varchar("type", { length: 100 }).notNull(), // navbar, hero, text-block, image, card, etc.
  icon: varchar("icon", { length: 100 }),
  defaultHtml: text("default_html").notNull(),
  defaultCss: text("default_css"),
  defaultProps: jsonb("default_props"),
  isBuiltin: boolean("is_builtin").default(true),
  thumbnail: text("thumbnail"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const websiteHistory = pgTable("website_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => websiteProjects.id).notNull(),
  pageId: uuid("page_id").references(() => websitePages.id),
  action: varchar("action", { length: 50 }).notNull(), // create, update, delete, publish
  snapshot: jsonb("snapshot").notNull(), // snapshot of page/project state
  userId: varchar("user_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebsiteProject = typeof websiteProjects.$inferSelect;
export type NewWebsiteProject = typeof websiteProjects.$inferInsert;
export type WebsitePage = typeof websitePages.$inferSelect;
export type NewWebsitePage = typeof websitePages.$inferInsert;
export type WebsiteComponent = typeof websiteComponents.$inferSelect;
export type NewWebsiteComponent = typeof websiteComponents.$inferInsert;
export type WebsiteHistory = typeof websiteHistory.$inferSelect;

// ============================================
// Setup Wizard Configuration
// ============================================

export const setupConfiguration = pgTable("setup_configuration", {
  id: serial("id").primaryKey(),
  setupComplete: boolean("setup_complete").default(false).notNull(),
  currentStep: integer("current_step").default(0),
  welcomeCompleted: boolean("welcome_completed").default(false),
  environmentDetected: jsonb("environment_detected"),
  adminConfigured: boolean("admin_configured").default(false),
  adminUserId: varchar("admin_user_id", { length: 255 }),
  nodesConfigured: jsonb("nodes_configured"),
  secretsConfigured: jsonb("secrets_configured"),
  aiServicesConfigured: jsonb("ai_services_configured"),
  featuresEnabled: jsonb("features_enabled"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const setupStepData = pgTable("setup_step_data", {
  id: serial("id").primaryKey(),
  stepName: varchar("step_name", { length: 50 }).notNull().unique(),
  stepNumber: integer("step_number").notNull(),
  completed: boolean("completed").default(false),
  data: jsonb("data"),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SetupConfiguration = typeof setupConfiguration.$inferSelect;
export type NewSetupConfiguration = typeof setupConfiguration.$inferInsert;
export type SetupStepData = typeof setupStepData.$inferSelect;
export type NewSetupStepData = typeof setupStepData.$inferInsert;

// ============================================
// ComfyUI Workflows and Jobs
// ============================================

export const comfyuiWorkflows = pgTable("comfyui_workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workflowJson: jsonb("workflow_json").notNull(),
  category: varchar("category", { length: 100 }),
  tags: text("tags").array().default([]),
  thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comfyuiJobs = pgTable("comfyui_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => comfyuiWorkflows.id),
  promptId: varchar("prompt_id", { length: 100 }),
  status: varchar("status", { length: 50 }).notNull(),
  inputParams: jsonb("input_params"),
  outputAssets: jsonb("output_assets"),
  errorMessage: text("error_message"),
  errorCode: varchar("error_code", { length: 50 }),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  priority: integer("priority").default(0),
  batchId: uuid("batch_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ComfyuiWorkflow = typeof comfyuiWorkflows.$inferSelect;
export type NewComfyuiWorkflow = typeof comfyuiWorkflows.$inferInsert;
export type ComfyuiJob = typeof comfyuiJobs.$inferSelect;
export type NewComfyuiJob = typeof comfyuiJobs.$inferInsert;

// ============================================
// Model Collections System
// ============================================

export const modelCollections = pgTable("model_collections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  isPublic: boolean("is_public").default(false),
  isStarterPack: boolean("is_starter_pack").default(false),
  category: varchar("category", { length: 100 }),
  userId: varchar("user_id", { length: 255 }),
  modelCount: integer("model_count").default(0),
  totalSize: decimal("total_size", { precision: 20, scale: 0 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const modelCollectionItems = pgTable("model_collection_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: uuid("collection_id").references(() => modelCollections.id).notNull(),
  modelId: uuid("model_id").references(() => aiModels.id),
  externalSource: varchar("external_source", { length: 50 }),
  externalId: varchar("external_id", { length: 255 }),
  name: varchar("name", { length: 255 }),
  type: varchar("type", { length: 50 }),
  downloadUrl: text("download_url"),
  thumbnailUrl: text("thumbnail_url"),
  sortOrder: integer("sort_order").default(0),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const modelFavorites = pgTable("model_favorites", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 }).notNull(),
  modelId: uuid("model_id").references(() => aiModels.id),
  externalSource: varchar("external_source", { length: 50 }),
  externalId: varchar("external_id", { length: 255 }),
  name: varchar("name", { length: 255 }),
  type: varchar("type", { length: 50 }),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ModelCollection = typeof modelCollections.$inferSelect;
export type NewModelCollection = typeof modelCollections.$inferInsert;
export type ModelCollectionItem = typeof modelCollectionItems.$inferSelect;
export type NewModelCollectionItem = typeof modelCollectionItems.$inferInsert;
export type ModelFavorite = typeof modelFavorites.$inferSelect;
export type NewModelFavorite = typeof modelFavorites.$inferInsert;

// ============================================================================
// USER MANAGEMENT & ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================================

export const userRoleEnum = ["admin", "developer", "viewer", "client"] as const;
export type UserRole = typeof userRoleEnum[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("viewer"),
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: uuid("created_by"),
  metadata: jsonb("metadata"),
});

export const dashboardModuleEnum = [
  "overview", "deployments", "ssh_connections", "ai_training",
  "content_generation", "database_management", "user_management",
  "system_settings", "analytics", "api_keys", "creative_studio",
  "jarvis", "bot_editor", "stream_config", "media_library",
  "servers", "services", "marketplace", "domains", "terminal",
  "windows_vm", "command_center", "secrets_manager", "pipelines"
] as const;
export type DashboardModule = typeof dashboardModuleEnum[number];

export const modulePermissions = pgTable("module_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  canRead: boolean("can_read").default(false),
  canWrite: boolean("can_write").default(false),
  canDelete: boolean("can_delete").default(false),
  canAdmin: boolean("can_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  username: varchar("username", { length: 100 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  resourceId: varchar("resource_id", { length: 255 }),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  status: varchar("status", { length: 20 }).default("success"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
  scopes: text("scopes").array(),
  expiresAt: timestamp("expires_at"),
  lastUsed: timestamp("last_used"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// AI MODEL TRAINING PIPELINE
// ============================================================================

export const trainingDatasets = pgTable("training_datasets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(),
  format: varchar("format", { length: 50 }),
  size: integer("size"),
  recordCount: integer("record_count"),
  storagePath: text("storage_path"),
  metadata: jsonb("metadata"),
  status: varchar("status", { length: 50 }).default("pending"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trainingJobs = pgTable("training_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  modelType: varchar("model_type", { length: 100 }).notNull(),
  baseModel: varchar("base_model", { length: 255 }),
  datasetId: uuid("dataset_id").references(() => trainingDatasets.id),
  status: varchar("status", { length: 50 }).default("pending"),
  progress: decimal("progress", { precision: 5, scale: 2 }).default("0"),
  config: jsonb("config"),
  hyperparameters: jsonb("hyperparameters"),
  metrics: jsonb("metrics"),
  outputPath: text("output_path"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trainedModels = pgTable("trained_models", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 50 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  baseModel: varchar("base_model", { length: 255 }),
  trainingJobId: uuid("training_job_id").references(() => trainingJobs.id),
  storagePath: text("storage_path"),
  size: integer("size"),
  metrics: jsonb("metrics"),
  config: jsonb("config"),
  isDeployed: boolean("is_deployed").default(false),
  deploymentEndpoint: text("deployment_endpoint"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// SSL CERTIFICATE MANAGEMENT
// ============================================================================

export const sslCertificates = pgTable("ssl_certificates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).default("letsencrypt"),
  status: varchar("status", { length: 50 }).default("pending"),
  issuedAt: timestamp("issued_at"),
  expiresAt: timestamp("expires_at"),
  autoRenew: boolean("auto_renew").default(true),
  certificatePath: text("certificate_path"),
  privateKeyPath: text("private_key_path"),
  lastRenewalAttempt: timestamp("last_renewal_attempt"),
  renewalError: text("renewal_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// SFTP FILE TRANSFERS
// ============================================================================

export const sftpTransfers = pgTable("sftp_transfers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid("connection_id"),
  direction: varchar("direction", { length: 20 }).notNull(),
  localPath: text("local_path").notNull(),
  remotePath: text("remote_path").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  progress: decimal("progress", { precision: 5, scale: 2 }).default("0"),
  size: integer("size"),
  bytesTransferred: integer("bytes_transferred").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Type exports for RBAC
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ModulePermission = typeof modulePermissions.$inferSelect;
export type NewModulePermission = typeof modulePermissions.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

// Type exports for Training
export type TrainingDataset = typeof trainingDatasets.$inferSelect;
export type NewTrainingDataset = typeof trainingDatasets.$inferInsert;
export type TrainingJob = typeof trainingJobs.$inferSelect;
export type NewTrainingJob = typeof trainingJobs.$inferInsert;
export type TrainedModel = typeof trainedModels.$inferSelect;
export type NewTrainedModel = typeof trainedModels.$inferInsert;

// Type exports for SSL
export type SSLCertificate = typeof sslCertificates.$inferSelect;
export type NewSSLCertificate = typeof sslCertificates.$inferInsert;

// Type exports for SFTP
export type SFTPTransfer = typeof sftpTransfers.$inferSelect;
export type NewSFTPTransfer = typeof sftpTransfers.$inferInsert;

// ============================================================================
// AI DEVELOPER - AUTONOMOUS CODE MODIFICATION SYSTEM
// ============================================================================

export const aiDevJobs = pgTable("ai_dev_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // 'feature', 'bugfix', 'refactor', 'test', 'docs'
  status: varchar("status", { length: 50 }).default("pending"), // pending, planning, executing, review, approved, applied, rejected, rolled_back, failed
  priority: integer("priority").default(0),
  
  // Target scope
  targetPaths: text("target_paths").array(), // Files/directories to modify
  targetRepo: varchar("target_repo", { length: 255 }).default("services/dashboard-next"),
  
  // AI configuration
  provider: varchar("provider", { length: 50 }).default("ollama"), // ollama, openai, anthropic
  model: varchar("model", { length: 100 }),
  
  // Planning and execution
  plan: jsonb("plan"), // Array of steps the AI plans to take
  context: jsonb("context"), // Codebase context, relevant files, architecture info
  
  // Results
  filesModified: text("files_modified").array(),
  testsRun: boolean("tests_run").default(false),
  testsPassed: boolean("tests_passed"),
  errorMessage: text("error_message"),
  
  // Metrics
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  
  // Audit
  createdBy: uuid("created_by").references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => agents.id), // AI agent handling this
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const aiDevPatches = pgTable("ai_dev_patches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => aiDevJobs.id).notNull(),
  
  // Patch details
  filePath: text("file_path").notNull(),
  patchType: varchar("patch_type", { length: 50 }).notNull(), // 'create', 'modify', 'delete', 'rename'
  
  // Content
  originalContent: text("original_content"), // For rollback
  newContent: text("new_content"),
  diffUnified: text("diff_unified"), // Unified diff format
  diffStats: jsonb("diff_stats"), // { additions: number, deletions: number, hunks: number }
  
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, applied, rolled_back, rejected
  appliedAt: timestamp("applied_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  
  // Git info
  commitHash: varchar("commit_hash", { length: 40 }),
  rollbackCommitHash: varchar("rollback_commit_hash", { length: 40 }),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiDevApprovals = pgTable("ai_dev_approvals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => aiDevJobs.id).notNull(),
  
  // Approval details
  decision: varchar("decision", { length: 50 }).notNull(), // 'approved', 'rejected', 'request_changes'
  comments: text("comments"),
  reviewedPatches: uuid("reviewed_patches").array(), // Specific patches reviewed
  
  // Reviewer
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at").defaultNow(),
  
  // Auto-approval config
  isAutoApproved: boolean("is_auto_approved").default(false),
  autoApprovalRule: varchar("auto_approval_rule", { length: 100 }), // e.g., 'tests_pass', 'docs_only'
});

export const aiDevRuns = pgTable("ai_dev_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => aiDevJobs.id).notNull(),
  
  // Run details
  stepIndex: integer("step_index").default(0),
  stepName: varchar("step_name", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(), // 'read_file', 'search_code', 'edit_file', 'run_test', 'run_command'
  
  // Input/Output
  input: jsonb("input"),
  output: jsonb("output"),
  
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, running, completed, failed
  errorMessage: text("error_message"),
  
  // Metrics
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiDevProviders = pgTable("ai_dev_providers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'ollama', 'openai', 'anthropic', 'local'
  
  // Configuration
  baseUrl: text("base_url"),
  defaultModel: varchar("default_model", { length: 100 }),
  availableModels: text("available_models").array(),
  
  // Capabilities
  supportsStreaming: boolean("supports_streaming").default(true),
  supportsTools: boolean("supports_tools").default(true),
  maxContextTokens: integer("max_context_tokens"),
  
  // Status
  isEnabled: boolean("is_enabled").default(true),
  isDefault: boolean("is_default").default(false),
  lastHealthCheck: timestamp("last_health_check"),
  healthStatus: varchar("health_status", { length: 50 }).default("unknown"),
  
  // Config
  config: jsonb("config"), // Provider-specific settings
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports for AI Developer
export type AIDevJob = typeof aiDevJobs.$inferSelect;
export type NewAIDevJob = typeof aiDevJobs.$inferInsert;
export type AIDevPatch = typeof aiDevPatches.$inferSelect;
export type NewAIDevPatch = typeof aiDevPatches.$inferInsert;
export type AIDevApproval = typeof aiDevApprovals.$inferSelect;
export type NewAIDevApproval = typeof aiDevApprovals.$inferInsert;
export type AIDevRun = typeof aiDevRuns.$inferSelect;
export type NewAIDevRun = typeof aiDevRuns.$inferInsert;
export type AIDevProvider = typeof aiDevProviders.$inferSelect;
export type NewAIDevProvider = typeof aiDevProviders.$inferInsert;

// ============================================================================
// AI INFLUENCER / VIDEO AUTOMATION PIPELINE
// ============================================================================

/**
 * AI Influencer Personas - Define consistent character identities
 * Stores character reference images, style parameters, personality traits
 */
export const influencerPersonas = pgTable("influencer_personas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  description: text("description"),
  
  // Character consistency
  referenceImages: text("reference_images").array(), // URLs/paths to character reference images
  stylePrompt: text("style_prompt"), // Base prompt for consistent style
  negativePrompt: text("negative_prompt"),
  
  // LoRA/embedding for character persistence
  loraPath: text("lora_path"), // Path to trained LoRA model
  loraWeight: decimal("lora_weight", { precision: 3, scale: 2 }).default("0.8"),
  embeddingName: varchar("embedding_name", { length: 255 }),
  
  // ComfyUI workflow template for this persona
  workflowTemplateId: uuid("workflow_template_id").references(() => comfyuiWorkflows.id),
  
  // Voice settings (for TTS)
  voiceId: varchar("voice_id", { length: 100 }),
  voiceSettings: jsonb("voice_settings"), // pitch, speed, etc.
  
  // Personality for LLM-generated scripts
  personalityTraits: text("personality_traits").array(),
  writingStyle: text("writing_style"),
  topicFocus: text("topic_focus").array(),
  
  // Platform config
  platforms: text("platforms").array(), // ['youtube', 'tiktok', 'instagram']
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Content Pipelines - Define automated content generation workflows
 * Connects scripts → images → video → publishing
 */
export const contentPipelines = pgTable("content_pipelines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  personaId: uuid("persona_id").references(() => influencerPersonas.id),
  
  // Pipeline type
  pipelineType: varchar("pipeline_type", { length: 50 }).notNull(), // 'script_to_video', 'image_series', 'shorts', 'static_posts'
  
  // Stage configuration (ordered)
  stages: jsonb("stages").notNull(), // [{type: 'script_gen', config: {}}, {type: 'image_gen', ...}, ...]
  
  // ComfyUI integration
  workflowId: uuid("workflow_id").references(() => comfyuiWorkflows.id),
  workflowOverrides: jsonb("workflow_overrides"), // Parameter overrides for the workflow
  
  // Output configuration
  outputFormat: varchar("output_format", { length: 50 }).default("mp4"), // mp4, webm, gif, png
  outputResolution: varchar("output_resolution", { length: 20 }).default("1080p"),
  aspectRatio: varchar("aspect_ratio", { length: 10 }).default("16:9"), // 16:9, 9:16, 1:1
  
  // Batch settings
  batchSize: integer("batch_size").default(1),
  parallelExecution: boolean("parallel_execution").default(false),
  
  // Scheduling
  isScheduled: boolean("is_scheduled").default(false),
  cronExpression: varchar("cron_expression", { length: 100 }),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Video Projects - Individual video generation jobs
 */
export const videoProjects = pgTable("video_projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  pipelineId: uuid("pipeline_id").references(() => contentPipelines.id),
  personaId: uuid("persona_id").references(() => influencerPersonas.id),
  
  // Content
  title: varchar("title", { length: 500 }),
  description: text("description"),
  script: text("script"), // Full script/narration text
  
  // Prompt chain (for multi-shot videos)
  promptChain: jsonb("prompt_chain"), // [{shot: 1, prompt: '...', duration: 5}, ...]
  
  // Generated assets
  generatedFrames: jsonb("generated_frames"), // [{path, thumbnail, shotIndex}, ...]
  audioPath: text("audio_path"), // TTS-generated audio
  musicPath: text("music_path"), // Background music
  finalVideoPath: text("final_video_path"),
  thumbnailPath: text("thumbnail_path"),
  
  // Metadata for publishing
  hashtags: text("hashtags").array(),
  targetPlatform: varchar("target_platform", { length: 50 }),
  publishConfig: jsonb("publish_config"), // Platform-specific settings
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"), // draft, generating, review, approved, published, failed
  currentStage: varchar("current_stage", { length: 100 }),
  progress: integer("progress").default(0), // 0-100
  errorMessage: text("error_message"),
  
  // Metrics (post-publish)
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).default("0.00"),
  
  // Scheduling
  scheduledPublishAt: timestamp("scheduled_publish_at"),
  publishedAt: timestamp("published_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Content Pipeline Runs - Execution history for content pipelines
 */
export const contentPipelineRuns = pgTable("content_pipeline_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  pipelineId: uuid("pipeline_id").references(() => contentPipelines.id).notNull(),
  videoProjectId: uuid("video_project_id").references(() => videoProjects.id),
  
  // Batch info
  batchId: varchar("batch_id", { length: 100 }),
  batchIndex: integer("batch_index"),
  batchTotal: integer("batch_total"),
  
  // Trigger
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // 'schedule', 'manual', 'api', 'webhook'
  
  // Stage progress
  stages: jsonb("stages"), // [{name, status, startedAt, completedAt, output}, ...]
  currentStageIndex: integer("current_stage_index").default(0),
  
  // ComfyUI jobs
  comfyuiJobIds: text("comfyui_job_ids").array(),
  
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, running, paused, completed, failed, cancelled
  errorMessage: text("error_message"),
  errorStage: varchar("error_stage", { length: 100 }),
  
  // Metrics
  totalDurationMs: integer("total_duration_ms"),
  gpuTimeMs: integer("gpu_time_ms"),
  tokensUsed: integer("tokens_used"),
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Content Templates - Reusable templates for content generation
 */
export const contentTemplates = pgTable("content_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Template type
  templateType: varchar("template_type", { length: 50 }).notNull(), // 'script', 'prompt_chain', 'video_structure'
  
  // Content
  content: text("content").notNull(), // Template with {{variables}}
  variables: jsonb("variables"), // [{name, type, default, description}, ...]
  
  // Category
  category: varchar("category", { length: 100 }),
  tags: text("tags").array(),
  
  // Usage
  usageCount: integer("usage_count").default(0),
  
  isPublic: boolean("is_public").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Monetization Hooks - Track revenue and monetization events
 */
export const monetizationEvents = pgTable("monetization_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  videoProjectId: uuid("video_project_id").references(() => videoProjects.id),
  personaId: uuid("persona_id").references(() => influencerPersonas.id),
  
  // Event type
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'ad_revenue', 'sponsorship', 'affiliate', 'donation', 'subscription'
  platform: varchar("platform", { length: 50 }),
  
  // Amount
  amount: decimal("amount", { precision: 12, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  
  // Source details
  sourceId: varchar("source_id", { length: 255 }), // External ID from platform
  sourceData: jsonb("source_data"), // Raw data from platform
  
  // Attribution
  attributionWindow: varchar("attribution_window", { length: 50 }), // '7d', '28d', etc.
  
  eventAt: timestamp("event_at").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

/**
 * Scheduled Jobs - Cron-style scheduling for pipeline automation
 */
export const scheduledJobs = pgTable("scheduled_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Job type
  jobType: varchar("job_type", { length: 50 }).notNull(), // 'pipeline_run', 'publish', 'analytics_sync', 'cleanup'
  
  // Target
  targetId: uuid("target_id"), // Pipeline ID, Video ID, etc.
  targetType: varchar("target_type", { length: 50 }), // 'pipeline', 'video', 'persona'
  
  // Schedule
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  
  // Execution params
  params: jsonb("params"),
  
  // Status
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 50 }),
  lastRunError: text("last_run_error"),
  consecutiveFailures: integer("consecutive_failures").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports for AI Influencer Pipeline
export type InfluencerPersona = typeof influencerPersonas.$inferSelect;
export type NewInfluencerPersona = typeof influencerPersonas.$inferInsert;
export type ContentPipeline = typeof contentPipelines.$inferSelect;
export type NewContentPipeline = typeof contentPipelines.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type NewVideoProject = typeof videoProjects.$inferInsert;
export type ContentPipelineRun = typeof contentPipelineRuns.$inferSelect;
export type NewContentPipelineRun = typeof contentPipelineRuns.$inferInsert;
export type ContentTemplate = typeof contentTemplates.$inferSelect;
export type NewContentTemplate = typeof contentTemplates.$inferInsert;
export type MonetizationEvent = typeof monetizationEvents.$inferSelect;
export type NewMonetizationEvent = typeof monetizationEvents.$inferInsert;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type NewScheduledJob = typeof scheduledJobs.$inferInsert;
