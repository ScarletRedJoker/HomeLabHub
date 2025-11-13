import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users - stores user accounts for multi-tenant access
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("user").notNull(), // 'user', 'admin'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Platform connections - stores OAuth tokens and platform-specific config
export const platformConnections = pgTable("platform_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  platformUserId: text("platform_user_id"), // External platform user ID
  platformUsername: text("platform_username"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  channelId: text("channel_id"), // Channel/stream ID for the platform
  isConnected: boolean("is_connected").default(false).notNull(),
  lastConnectedAt: timestamp("last_connected_at"),
  connectionData: jsonb("connection_data"), // Platform-specific metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userPlatformIdx: uniqueIndex("platform_connections_user_id_platform_unique").on(table.userId, table.platform),
}));

// Bot configs - per-user bot configuration (replaces singleton botSettings)
export const botConfigs = pgTable("bot_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Interval settings
  intervalMode: text("interval_mode").default("manual").notNull(), // 'fixed', 'random', 'manual'
  fixedIntervalMinutes: integer("fixed_interval_minutes"), // For fixed mode
  randomMinMinutes: integer("random_min_minutes"), // For random mode
  randomMaxMinutes: integer("random_max_minutes"), // For random mode
  
  // AI settings
  aiModel: text("ai_model").default("gpt-5-mini").notNull(),
  aiPromptTemplate: text("ai_prompt_template"),
  aiTemperature: integer("ai_temperature").default(1), // Stored as integer, divided by 10 in app
  
  // Trigger settings
  enableChatTriggers: boolean("enable_chat_triggers").default(true).notNull(),
  chatKeywords: text("chat_keywords").array().default(sql`ARRAY['!snapple', '!fact']::text[]`).notNull(),
  
  // Active platforms
  activePlatforms: text("active_platforms").array().default(sql`ARRAY[]::text[]`).notNull(),
  
  // Bot status
  isActive: boolean("is_active").default(false).notNull(),
  lastFactPostedAt: timestamp("last_fact_posted_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bot instances - tracks running bot status and health
export const botInstances = pgTable("bot_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  status: text("status").default("stopped").notNull(), // 'running', 'stopped', 'error'
  lastHeartbeat: timestamp("last_heartbeat"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Message history - logs all posted facts
export const messageHistory = pgTable("message_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  triggerType: text("trigger_type").notNull(), // 'scheduled', 'manual', 'chat_command'
  triggerUser: text("trigger_user"), // Username if triggered by chat command
  factContent: text("fact_content").notNull(),
  postedAt: timestamp("posted_at").defaultNow().notNull(),
  status: text("status").default("success").notNull(), // 'success', 'failed'
  errorMessage: text("error_message"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformConnectionSchema = createInsertSchema(platformConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBotConfigSchema = createInsertSchema(botConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBotInstanceSchema = createInsertSchema(botInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageHistorySchema = createInsertSchema(messageHistory).omit({
  id: true,
  postedAt: true,
});

// Update schemas for partial updates
export const updateUserSchema = insertUserSchema.partial();
export const updateBotConfigSchema = insertBotConfigSchema.partial();
export const updatePlatformConnectionSchema = insertPlatformConnectionSchema.partial();
export const updateBotInstanceSchema = insertBotInstanceSchema.partial();

// Signup schema - for user registration
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Select types
export type User = typeof users.$inferSelect;
export type PlatformConnection = typeof platformConnections.$inferSelect;
export type BotConfig = typeof botConfigs.$inferSelect;
export type BotInstance = typeof botInstances.$inferSelect;
export type MessageHistory = typeof messageHistory.$inferSelect;

// Insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPlatformConnection = z.infer<typeof insertPlatformConnectionSchema>;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type InsertBotInstance = z.infer<typeof insertBotInstanceSchema>;
export type InsertMessageHistory = z.infer<typeof insertMessageHistorySchema>;

// Update types
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateBotConfig = z.infer<typeof updateBotConfigSchema>;
export type UpdatePlatformConnection = z.infer<typeof updatePlatformConnectionSchema>;
export type UpdateBotInstance = z.infer<typeof updateBotInstanceSchema>;

// Auth types
export type Signup = z.infer<typeof signupSchema>;
export type Login = z.infer<typeof loginSchema>;

// Backward compatibility table exports (deprecated - use botConfigs instead)
export const botSettings = botConfigs;

// Backward compatibility types (deprecated - use BotConfig instead)
export type BotSettings = BotConfig;
export type InsertBotSettings = InsertBotConfig;
export type UpdateBotSettings = UpdateBotConfig;
