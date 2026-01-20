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
