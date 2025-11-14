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
  
  // Shoutout settings
  autoShoutoutOnRaid: boolean("auto_shoutout_on_raid").default(false).notNull(),
  autoShoutoutOnHost: boolean("auto_shoutout_on_host").default(false).notNull(),
  shoutoutMessageTemplate: text("shoutout_message_template").default("Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}"),
  
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

// Custom Commands - user-defined chat commands with variables
export const customCommands = pgTable("custom_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Command name without ! prefix (e.g., "discord", "socials")
  response: text("response").notNull(), // Response template with variables like {user}, {count}, etc.
  cooldown: integer("cooldown").default(0).notNull(), // Cooldown in seconds (0 = no cooldown)
  permission: text("permission").default("everyone").notNull(), // 'everyone', 'subs', 'mods', 'broadcaster'
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userCommandIdx: uniqueIndex("custom_commands_user_id_name_unique").on(table.userId, table.name),
}));

// Moderation Rules - AI-powered auto-moderation settings per user
export const moderationRules = pgTable("moderation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ruleType: text("rule_type").notNull(), // 'toxic', 'spam', 'links', 'caps', 'symbols'
  isEnabled: boolean("is_enabled").default(true).notNull(),
  severity: text("severity").default("medium").notNull(), // 'low', 'medium', 'high'
  action: text("action").default("warn").notNull(), // 'warn', 'timeout', 'ban'
  customPattern: text("custom_pattern"), // Optional regex pattern for custom filtering
  timeoutDuration: integer("timeout_duration").default(60), // Timeout duration in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userRuleTypeIdx: uniqueIndex("moderation_rules_user_id_rule_type_unique").on(table.userId, table.ruleType),
}));

// Moderation Logs - History of all moderation actions taken
export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  username: text("username").notNull(), // Username of the user who sent the message
  message: text("message").notNull(), // The message that triggered moderation
  ruleTriggered: text("rule_triggered").notNull(), // Which rule was triggered
  action: text("action").notNull(), // 'warn', 'timeout', 'ban', 'delete'
  severity: text("severity").notNull(), // 'low', 'medium', 'high'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Link Whitelist - Allowed domains that bypass link filtering
export const linkWhitelist = pgTable("link_whitelist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(), // Domain to whitelist (e.g., "youtube.com", "twitter.com")
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDomainIdx: uniqueIndex("link_whitelist_user_id_domain_unique").on(table.userId, table.domain),
}));

// Giveaways - Chat giveaways/raffles for viewer engagement
export const giveaways = pgTable("giveaways", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  keyword: text("keyword").notNull(), // Entry keyword (e.g., "!enter")
  isActive: boolean("is_active").default(true).notNull(),
  requiresSubscription: boolean("requires_subscription").default(false).notNull(),
  maxWinners: integer("max_winners").default(1).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Giveaway Entries - User entries for active giveaways
export const giveawayEntries = pgTable("giveaway_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giveawayId: varchar("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  subscriberStatus: boolean("subscriber_status").default(false).notNull(),
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
}, (table) => ({
  giveawayUserIdx: uniqueIndex("giveaway_entries_giveaway_id_username_platform_unique").on(
    table.giveawayId,
    table.username,
    table.platform
  ),
}));

// Giveaway Winners - Selected winners from completed giveaways
export const giveawayWinners = pgTable("giveaway_winners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giveawayId: varchar("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(),
  selectedAt: timestamp("selected_at").defaultNow().notNull(),
});

// Shoutouts - Track shoutout history and custom messages
export const shoutouts = pgTable("shoutouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUsername: text("target_username").notNull(),
  targetPlatform: text("target_platform").notNull(), // 'twitch', 'youtube', 'kick'
  customMessage: text("custom_message"),
  usageCount: integer("usage_count").default(1).notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userTargetIdx: uniqueIndex("shoutouts_user_id_target_username_platform_unique").on(
    table.userId,
    table.targetUsername,
    table.targetPlatform
  ),
}));

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

export const insertCustomCommandSchema = createInsertSchema(customCommands, {
  name: z.string().min(1, "Command name is required").max(50, "Command name too long"),
  response: z.string().min(1, "Response is required").max(500, "Response too long"),
  cooldown: z.coerce.number().min(0).max(86400),
  permission: z.enum(["everyone", "subs", "mods", "broadcaster"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModerationRuleSchema = createInsertSchema(moderationRules, {
  ruleType: z.enum(["toxic", "spam", "links", "caps", "symbols"]),
  severity: z.enum(["low", "medium", "high"]),
  action: z.enum(["warn", "timeout", "ban"]),
  timeoutDuration: z.coerce.number().min(1).max(86400),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({
  id: true,
  timestamp: true,
});

export const insertLinkWhitelistSchema = createInsertSchema(linkWhitelist).omit({
  id: true,
  createdAt: true,
});

export const insertGiveawaySchema = createInsertSchema(giveaways, {
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  keyword: z.string().min(1, "Keyword is required").regex(/^!?\w+$/, "Invalid keyword format"),
  maxWinners: z.coerce.number().min(1).max(100),
}).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export const insertGiveawayEntrySchema = createInsertSchema(giveawayEntries).omit({
  id: true,
  enteredAt: true,
});

export const insertGiveawayWinnerSchema = createInsertSchema(giveawayWinners).omit({
  id: true,
  selectedAt: true,
});

export const insertShoutoutSchema = createInsertSchema(shoutouts, {
  targetUsername: z.string().min(1, "Target username is required").max(100, "Username too long"),
  targetPlatform: z.enum(["twitch", "youtube", "kick"]),
  customMessage: z.string().max(500, "Custom message too long").optional(),
}).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

// Update schemas for partial updates
export const updateUserSchema = insertUserSchema.partial();
export const updateBotConfigSchema = insertBotConfigSchema.partial();
export const updatePlatformConnectionSchema = insertPlatformConnectionSchema.partial();
export const updateBotInstanceSchema = insertBotInstanceSchema.partial();
export const updateCustomCommandSchema = insertCustomCommandSchema.partial();
export const updateModerationRuleSchema = insertModerationRuleSchema.partial();
export const updateGiveawaySchema = insertGiveawaySchema.partial();
export const updateShoutoutSchema = insertShoutoutSchema.partial();

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
export type CustomCommand = typeof customCommands.$inferSelect;
export type ModerationRule = typeof moderationRules.$inferSelect;
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type LinkWhitelist = typeof linkWhitelist.$inferSelect;
export type Giveaway = typeof giveaways.$inferSelect;
export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type GiveawayWinner = typeof giveawayWinners.$inferSelect;
export type Shoutout = typeof shoutouts.$inferSelect;

// Insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPlatformConnection = z.infer<typeof insertPlatformConnectionSchema>;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type InsertBotInstance = z.infer<typeof insertBotInstanceSchema>;
export type InsertMessageHistory = z.infer<typeof insertMessageHistorySchema>;
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type InsertModerationRule = z.infer<typeof insertModerationRuleSchema>;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type InsertLinkWhitelist = z.infer<typeof insertLinkWhitelistSchema>;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;
export type InsertGiveawayWinner = z.infer<typeof insertGiveawayWinnerSchema>;
export type InsertShoutout = z.infer<typeof insertShoutoutSchema>;

// Update types
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateBotConfig = z.infer<typeof updateBotConfigSchema>;
export type UpdatePlatformConnection = z.infer<typeof updatePlatformConnectionSchema>;
export type UpdateBotInstance = z.infer<typeof updateBotInstanceSchema>;
export type UpdateCustomCommand = z.infer<typeof updateCustomCommandSchema>;
export type UpdateModerationRule = z.infer<typeof updateModerationRuleSchema>;
export type UpdateGiveaway = z.infer<typeof updateGiveawaySchema>;
export type UpdateShoutout = z.infer<typeof updateShoutoutSchema>;

// Auth types
export type Signup = z.infer<typeof signupSchema>;
export type Login = z.infer<typeof loginSchema>;

// Backward compatibility table exports (deprecated - use botConfigs instead)
export const botSettings = botConfigs;

// Backward compatibility types (deprecated - use BotConfig instead)
export type BotSettings = BotConfig;
export type InsertBotSettings = InsertBotConfig;
export type UpdateBotSettings = UpdateBotConfig;
