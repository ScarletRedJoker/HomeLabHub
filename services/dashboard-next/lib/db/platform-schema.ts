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
