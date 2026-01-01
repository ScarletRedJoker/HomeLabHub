import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users - stores user accounts for multi-tenant access (OAuth-based)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // Nullable - OAuth users don't have passwords
  primaryPlatform: text("primary_platform"), // 'twitch', 'youtube', 'kick' - which OAuth they used first
  role: text("role").default("user").notNull(), // 'user', 'admin'
  isActive: boolean("is_active").default(true).notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(), // 0-4 for tracking progress
  dismissedWelcome: boolean("dismissed_welcome").default(false).notNull(), // Track if user dismissed welcome card
  discordId: varchar("discord_id", { length: 20 }), // Discord user ID for Lanyard presence integration
  personalPresenceEnabled: boolean("personal_presence_enabled").default(false).notNull(), // Enable personal Discord presence via Lanyard
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
  needsRefresh: boolean("needs_refresh").default(false).notNull(), // Token needs manual re-authentication
  lastConnectedAt: timestamp("last_connected_at"),
  connectionData: jsonb("connection_data"), // Platform-specific metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userPlatformIdx: uniqueIndex("platform_connections_user_id_platform_unique").on(table.userId, table.platform),
  platformUserIdx: uniqueIndex("platform_connections_platform_platform_user_id_unique").on(table.platform, table.platformUserId),
}));

// OAuth Sessions - Database-backed OAuth state storage for scalable, production-ready OAuth flows
// Replaces in-memory storage, supports horizontal scaling, automatic expiration, and replay attack prevention
export const oauthSessions = pgTable("oauth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull().unique(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick', 'spotify'
  codeVerifier: text("code_verifier"), // PKCE code verifier
  metadata: jsonb("metadata"), // Additional OAuth metadata
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }), // Tracks if session was used (one-time use)
  ipAddress: text("ip_address"), // For security auditing
}, (table) => ({
  stateIdx: index("oauth_sessions_state_idx").on(table.state),
  expiresAtIdx: index("oauth_sessions_expires_at_idx").on(table.expiresAt),
  userIdIdx: index("oauth_sessions_user_id_idx").on(table.userId),
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
  aiModel: text("ai_model").default("gpt-4o").notNull(),
  aiPromptTemplate: text("ai_prompt_template"), // Full custom prompt template with variables like {streamer}, {theme}, {topic}
  customPrompt: text("custom_prompt"), // Simple custom prompt override
  aiTemperature: integer("ai_temperature").default(9), // Stored as integer, divided by 10 in app (9 = 0.9)
  channelTheme: text("channel_theme"), // User's channel theme for personalized facts (e.g., "gaming", "cooking", "tech")
  
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
  
  // Moderation settings
  bannedWords: text("banned_words").array().default(sql`ARRAY[]::text[]`).notNull(),
  
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

// Command Aliases - alternative names for custom commands
export const commandAliases = pgTable("command_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commandId: varchar("command_id").notNull().references(() => customCommands.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(), // Alternative command name without ! prefix
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  commandAliasIdx: uniqueIndex("command_aliases_command_id_alias_unique").on(table.commandId, table.alias),
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
  entryCount: integer("entry_count").default(0).notNull(),
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

// Giveaway Entry Attempts - Rate limiting tracking for giveaway entries
export const giveawayEntryAttempts = pgTable("giveaway_entry_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(),
  giveawayId: varchar("giveaway_id").references(() => giveaways.id, { onDelete: "cascade" }),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
}, (table) => ({
  userAttemptIdx: uniqueIndex("giveaway_entry_attempts_username_platform_attempted_at_idx").on(
    table.username,
    table.platform,
    table.attemptedAt
  ),
}));

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

// Shoutout Settings - Per-user shoutout configuration
export const shoutoutSettings = pgTable("shoutout_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableAutoShoutouts: boolean("enable_auto_shoutouts").default(false).notNull(),
  shoutoutTemplate: text("shoutout_template").default("Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}").notNull(),
  enableRaidShoutouts: boolean("enable_raid_shoutouts").default(false).notNull(),
  enableHostShoutouts: boolean("enable_host_shoutouts").default(false).notNull(),
  recentFollowerShoutouts: boolean("recent_follower_shoutouts").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shoutout History - Log of all shoutout executions
export const shoutoutHistory = pgTable("shoutout_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUsername: text("target_username").notNull(),
  platform: text("platform").notNull(), // Platform where shoutout was posted
  shoutoutType: text("shoutout_type").notNull(), // 'manual', 'raid', 'host', 'command'
  message: text("message").notNull(), // The actual shoutout message sent
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Stream Sessions - Track individual streaming sessions
export const streamSessions = pgTable("stream_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  peakViewers: integer("peak_viewers").default(0).notNull(),
  totalMessages: integer("total_messages").default(0).notNull(),
  uniqueChatters: integer("unique_chatters").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Viewer Snapshots - Track viewer count over time for each session
export const viewerSnapshots = pgTable("viewer_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => streamSessions.id, { onDelete: "cascade" }),
  viewerCount: integer("viewer_count").default(0).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Chat Activity - Track chat messages for heatmap generation
export const chatActivity = pgTable("chat_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => streamSessions.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  messageCount: integer("message_count").default(1).notNull(),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Game Settings - Per-user mini-games configuration
export const gameSettings = pgTable("game_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableGames: boolean("enable_games").default(true).notNull(),
  cooldownMinutes: integer("cooldown_minutes").default(5).notNull(),
  pointsPerWin: integer("points_per_win").default(10).notNull(),
  enable8Ball: boolean("enable_8ball").default(true).notNull(),
  enableTrivia: boolean("enable_trivia").default(true).notNull(),
  enableDuel: boolean("enable_duel").default(true).notNull(),
  enableSlots: boolean("enable_slots").default(true).notNull(),
  enableRoulette: boolean("enable_roulette").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Game History - Track all game plays and outcomes
export const gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  gameType: text("game_type").notNull(), // '8ball', 'trivia', 'duel', 'slots', 'roulette'
  player: text("player").notNull(), // Username of the player
  opponent: text("opponent"), // For duel games
  outcome: text("outcome").notNull(), // 'win', 'loss', 'neutral'
  pointsAwarded: integer("points_awarded").default(0).notNull(),
  details: jsonb("details"), // Game-specific data (question, answer, slot results, etc.)
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Active Trivia Questions - Track pending trivia questions
export const activeTriviaQuestions = pgTable("active_trivia_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  player: text("player").notNull(),
  platform: text("platform").notNull(),
  question: text("question").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  difficulty: text("difficulty").notNull(), // 'easy', 'medium', 'hard'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Game Stats - Aggregated statistics per user per game
export const gameStats = pgTable("game_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  gameName: text("game_name").notNull(), // '8ball', 'trivia', 'duel', 'slots', 'roulette'
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  neutral: integer("neutral").default(0).notNull(),
  totalPlays: integer("total_plays").default(0).notNull(),
  totalPointsEarned: integer("total_points_earned").default(0).notNull(),
  lastPlayed: timestamp("last_played"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userGameIdx: uniqueIndex("game_stats_user_id_username_game_name_platform_unique").on(
    table.userId,
    table.username,
    table.gameName,
    table.platform
  ),
}));

// Currency Settings - Per-user currency configuration
export const currencySettings = pgTable("currency_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  currencyName: text("currency_name").default("Points").notNull(),
  currencySymbol: text("currency_symbol").default("⭐").notNull(),
  earnPerMessage: integer("earn_per_message").default(1).notNull(),
  earnPerMinute: integer("earn_per_minute").default(10).notNull(),
  startingBalance: integer("starting_balance").default(100).notNull(),
  maxBalance: integer("max_balance").default(1000000).notNull(),
  enableGambling: boolean("enable_gambling").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Balances - Track viewer currency balances
export const userBalances = pgTable("user_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  balance: integer("balance").default(0).notNull(),
  totalEarned: integer("total_earned").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(),
  lastEarned: timestamp("last_earned"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userBalanceIdx: uniqueIndex("user_balances_bot_user_id_username_platform_unique").on(
    table.botUserId,
    table.username,
    table.platform
  ),
  balanceCheck: sql`CONSTRAINT user_balances_balance_check CHECK (balance >= 0)`,
  totalEarnedCheck: sql`CONSTRAINT user_balances_total_earned_check CHECK (total_earned >= 0)`,
  totalSpentCheck: sql`CONSTRAINT user_balances_total_spent_check CHECK (total_spent >= 0)`,
}));

// Currency Transactions - History of all currency transactions
export const currencyTransactions = pgTable("currency_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  balanceId: varchar("balance_id").notNull().references(() => userBalances.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  type: text("type").notNull(), // 'earn_message', 'earn_watch', 'gamble_win', 'gamble_loss', 'reward_purchase', 'admin_adjust', 'transfer_in', 'transfer_out'
  amount: integer("amount").notNull(), // Can be negative for spending
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Currency Rewards - Custom rewards that viewers can redeem
export const currencyRewards = pgTable("currency_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardName: text("reward_name").notNull(),
  cost: integer("cost").default(100).notNull(),
  command: text("command"), // Optional command triggered on redemption
  stock: integer("stock"), // null = unlimited stock
  maxRedeems: integer("max_redeems"), // null = unlimited per user
  rewardType: text("reward_type").notNull(), // 'timeout_immunity', 'song_request', 'highlight_message', 'custom_command'
  rewardData: jsonb("reward_data"), // Type-specific data (duration, command, etc.)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userRewardIdx: uniqueIndex("currency_rewards_bot_user_id_reward_name_unique").on(
    table.botUserId,
    table.rewardName
  ),
}));

// Reward Redemptions - Track reward redemption history
export const rewardRedemptions = pgTable("reward_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rewardId: varchar("reward_id").notNull().references(() => currencyRewards.id, { onDelete: "cascade" }),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  fulfilled: boolean("fulfilled").default(false).notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
});

// Song Queue - Tracks requested songs in queue
export const songQueue = pgTable("song_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull(), // Username who requested
  songTitle: text("song_title").notNull(),
  artist: text("artist").notNull(),
  url: text("url").notNull(), // Spotify or YouTube URL
  platform: text("platform").notNull(), // 'spotify', 'youtube'
  status: text("status").default("pending").notNull(), // 'pending', 'playing', 'played', 'skipped', 'removed'
  albumImageUrl: text("album_image_url"), // For display purposes
  duration: integer("duration"), // Duration in milliseconds
  position: integer("position").notNull(), // Queue position
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  playedAt: timestamp("played_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Song Settings - Per-user song request configuration
export const songSettings = pgTable("song_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableSongRequests: boolean("enable_song_requests").default(true).notNull(),
  maxQueueSize: integer("max_queue_size").default(20).notNull(),
  maxSongsPerUser: integer("max_songs_per_user").default(3).notNull(),
  allowDuplicates: boolean("allow_duplicates").default(false).notNull(),
  profanityFilter: boolean("profanity_filter").default(true).notNull(),
  bannedSongs: text("banned_songs").array().default(sql`ARRAY[]::text[]`).notNull(), // Array of song IDs or URLs
  volumeLimit: integer("volume_limit").default(100).notNull(), // 0-100
  allowSpotify: boolean("allow_spotify").default(true).notNull(),
  allowYoutube: boolean("allow_youtube").default(true).notNull(),
  moderatorOnly: boolean("moderator_only").default(false).notNull(), // Only mods can request
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Polls - Chat polls for viewer engagement
export const polls = pgTable("polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  options: text("options").array().notNull(), // Array of poll options
  duration: integer("duration").notNull(), // Duration in seconds
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  status: text("status").default("pending").notNull(), // 'pending', 'active', 'ended', 'cancelled'
  twitchPollId: text("twitch_poll_id"), // Native Twitch poll ID if using Twitch API
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  totalVotes: integer("total_votes").default(0).notNull(),
  winner: text("winner"), // Winning option text
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Poll Votes - Individual votes on polls
export const pollVotes = pgTable("poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  option: text("option").notNull(), // The option they voted for
  votedAt: timestamp("voted_at").defaultNow().notNull(),
}, (table) => ({
  pollUserIdx: uniqueIndex("poll_votes_poll_id_username_platform_unique").on(
    table.pollId,
    table.username,
    table.platform
  ),
}));

// Predictions - Channel point predictions for viewer engagement
export const predictions = pgTable("predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  outcomes: text("outcomes").array().notNull(), // Array of possible outcomes (2-10 options)
  duration: integer("duration").notNull(), // Duration in seconds
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  status: text("status").default("pending").notNull(), // 'pending', 'active', 'locked', 'resolved', 'cancelled'
  twitchPredictionId: text("twitch_prediction_id"), // Native Twitch prediction ID if using Twitch API
  startedAt: timestamp("started_at"),
  lockedAt: timestamp("locked_at"), // When betting closes
  endedAt: timestamp("ended_at"),
  totalPoints: integer("total_points").default(0).notNull(),
  totalBets: integer("total_bets").default(0).notNull(),
  winningOutcome: text("winning_outcome"), // Winning outcome text
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Prediction Bets - Individual bets on predictions
export const predictionBets = pgTable("prediction_bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  predictionId: varchar("prediction_id").notNull().references(() => predictions.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  outcome: text("outcome").notNull(), // The outcome they bet on
  points: integer("points").notNull(), // Points wagered
  payout: integer("payout").default(0).notNull(), // Points won (0 if lost)
  placedAt: timestamp("placed_at").defaultNow().notNull(),
}, (table) => ({
  predictionUserIdx: uniqueIndex("prediction_bets_prediction_id_username_platform_unique").on(
    table.predictionId,
    table.username,
    table.platform
  ),
}));

// Alert Settings - Per-user alert configuration for follower/sub/raid/milestone events
export const alertSettings = pgTable("alert_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Enable/disable toggles for each alert type
  enableFollowerAlerts: boolean("enable_follower_alerts").default(true).notNull(),
  enableSubAlerts: boolean("enable_sub_alerts").default(true).notNull(),
  enableRaidAlerts: boolean("enable_raid_alerts").default(true).notNull(),
  enableMilestoneAlerts: boolean("enable_milestone_alerts").default(true).notNull(),
  
  // Customizable message templates
  followerTemplate: text("follower_template").default("Thanks for the follow, {user}! Welcome to the community!").notNull(),
  subTemplate: text("sub_template").default("Thanks for subscribing, {user}! {tier} sub for {months} months!").notNull(),
  raidTemplate: text("raid_template").default("Thanks for the raid, {raider}! {viewers} viewers joining the party!").notNull(),
  
  // Milestone thresholds (array of integers like [50, 100, 500, 1000])
  milestoneThresholds: integer("milestone_thresholds").array().default(sql`ARRAY[50, 100, 500, 1000, 5000, 10000]::integer[]`).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Alert History - Log of all posted alerts
export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // 'follower', 'subscriber', 'raid', 'milestone'
  username: text("username"), // Username that triggered the alert (for follower/sub/raid)
  message: text("message").notNull(), // The actual message posted
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  metadata: jsonb("metadata"), // Additional data: {tier, months, viewerCount, milestoneType, threshold, count}
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Milestones - Track achieved milestones for followers/subs
export const milestones = pgTable("milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  milestoneType: text("milestone_type").notNull(), // 'followers', 'subscribers'
  threshold: integer("threshold").notNull(), // The milestone number (50, 100, 500, etc.)
  achieved: boolean("achieved").default(false).notNull(),
  achievedAt: timestamp("achieved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userMilestoneIdx: uniqueIndex("milestones_user_id_type_threshold_unique").on(
    table.userId,
    table.milestoneType,
    table.threshold
  ),
}));

// Stream Alerts - OBS overlay-style alerts for followers/subs/donations/raids/bits
export const streamAlerts = pgTable("stream_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // 'follow', 'sub', 'donation', 'raid', 'bits', 'host'
  enabled: boolean("enabled").default(true).notNull(),
  soundUrl: text("sound_url"), // URL to the alert sound
  imageUrl: text("image_url"), // URL to the alert image/GIF
  duration: integer("duration").default(5).notNull(), // Duration in seconds to show alert
  animation: text("animation").default("fade").notNull(), // 'fade', 'slide', 'bounce', 'zoom', 'flip', 'shake'
  textTemplate: text("text_template").notNull(), // Template with variables like {user}, {amount}, {message}
  fontSize: integer("font_size").default(32).notNull(), // Font size for alert text
  fontColor: text("font_color").default("#ffffff").notNull(), // Color for alert text
  backgroundColor: text("background_color").default("transparent").notNull(), // Background color
  ttsEnabled: boolean("tts_enabled").default(false).notNull(), // Text-to-speech enabled
  ttsVoice: text("tts_voice").default("en-US").notNull(), // TTS voice/language
  minAmount: integer("min_amount").default(0).notNull(), // Minimum amount to trigger (for donations/bits)
  volume: integer("volume").default(50).notNull(), // Sound volume 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userAlertTypeIdx: uniqueIndex("stream_alerts_user_id_alert_type_unique").on(table.userId, table.alertType),
}));

// Stream Alert History - History of triggered stream alerts
export const streamAlertHistory = pgTable("stream_alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull().references(() => streamAlerts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  triggeredBy: text("triggered_by").notNull(), // Username that triggered the alert
  alertType: text("alert_type").notNull(), // 'follow', 'sub', 'donation', 'raid', 'bits', 'host'
  amount: integer("amount"), // Amount for donations/bits/raid viewers
  message: text("message"), // Optional message from the user
  tier: text("tier"), // Sub tier for subscription alerts
  months: integer("months"), // Months subscribed
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("stream_alert_history_user_id_idx").on(table.userId),
  alertIdIdx: index("stream_alert_history_alert_id_idx").on(table.alertId),
  triggeredAtIdx: index("stream_alert_history_triggered_at_idx").on(table.triggeredAt),
}));

// Alert Queue - Persistent queue for alerts waiting to be displayed
export const alertQueue = pgTable("alert_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // 'follow', 'sub', 'donation', 'raid', 'bits', 'host'
  data: jsonb("data").notNull(), // Alert-specific data: { triggeredBy, amount, message, tier, months, platform }
  played: boolean("played").default(false).notNull(), // Whether the alert has been displayed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("alert_queue_user_id_idx").on(table.userId),
  playedIdx: index("alert_queue_played_idx").on(table.played),
  createdAtIdx: index("alert_queue_created_at_idx").on(table.createdAt),
}));

// Chatbot Settings - AI chatbot personality and configuration
export const chatbotSettings = pgTable("chatbot_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  personality: text("personality").default("friendly").notNull(), // 'friendly', 'snarky', 'professional', 'gamer', 'custom'
  customPersonalityPrompt: text("custom_personality_prompt"), // Used when personality is 'custom'
  temperature: integer("temperature").default(10).notNull(), // Stored as integer (0-20), divided by 10 in app (0.0-2.0)
  responseRate: integer("response_rate").default(30).notNull(), // Max 1 response per user per X seconds
  contextWindow: integer("context_window").default(10).notNull(), // Number of recent messages to include in context
  learningEnabled: boolean("learning_enabled").default(true).notNull(), // Track and learn from user feedback
  mentionTrigger: text("mention_trigger").default("@bot").notNull(), // What to watch for in chat
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chatbot Responses - Log of all chatbot interactions for learning
export const chatbotResponses = pgTable("chatbot_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(), // User who triggered the bot
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  message: text("message").notNull(), // Original message that triggered bot
  response: text("response").notNull(), // Bot's response
  personality: text("personality").notNull(), // Personality used for this response
  wasHelpful: boolean("was_helpful"), // null = no feedback yet, true/false = user feedback
  engagementScore: integer("engagement_score").default(0).notNull(), // 0-100, based on reactions/replies
  metadata: jsonb("metadata"), // Additional data: temperature, contextSize, processingTime
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chatbot Context - Track conversation context per user
export const chatbotContext = pgTable("chatbot_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(), // Chat user's username
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  recentMessages: jsonb("recent_messages").default(sql`'[]'::jsonb`).notNull(), // Array of {message, timestamp, isBot}
  conversationSummary: text("conversation_summary"), // AI-generated summary of conversation
  messageCount: integer("message_count").default(0).notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userContextIdx: uniqueIndex("chatbot_context_bot_user_id_username_platform_unique").on(
    table.botUserId,
    table.username,
    table.platform
  ),
}));

// Chatbot Personalities - Custom AI personalities users can create
export const chatbotPersonalities = pgTable("chatbot_personalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // User-friendly name (e.g., "Gaming Buddy", "Helpful Assistant")
  systemPrompt: text("system_prompt").notNull(), // The full system prompt for this personality
  temperature: integer("temperature").default(10).notNull(), // Stored as integer (0-20), divided by 10 in app (0.0-2.0)
  traits: jsonb("traits").default(sql`'[]'::jsonb`).notNull(), // Array of personality traits/keywords
  tone: text("tone").default("friendly").notNull(), // 'friendly', 'sarcastic', 'professional', 'funny'
  responseStyle: text("response_style").default("medium").notNull(), // 'short', 'medium', 'verbose'
  triggerWords: jsonb("trigger_words").default(sql`'[]'::jsonb`).notNull(), // Array of words that trigger the bot to respond
  replyChance: integer("reply_chance").default(100).notNull(), // 0-100 percentage chance to reply when triggered
  cooldown: integer("cooldown").default(30).notNull(), // Minimum seconds between responses for same user
  lastReply: timestamp("last_reply"), // Last time this personality was used to reply
  isPreset: boolean("is_preset").default(false).notNull(), // True for built-in personalities, false for custom
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(), // Track how often this personality is used
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userNameIdx: uniqueIndex("chatbot_personalities_user_id_name_unique").on(table.userId, table.name),
}));

// Chatbot Memory - Contextual memory for ongoing conversations with expiration
export const chatbotMemory = pgTable("chatbot_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personalityId: varchar("personality_id").notNull().references(() => chatbotPersonalities.id, { onDelete: "cascade" }),
  contextKey: text("context_key").notNull(), // Key for the context (e.g., "user:username", "topic:gaming")
  contextValue: text("context_value").notNull(), // The stored context value
  expiresAt: timestamp("expires_at"), // Optional expiration time for the memory
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  personalityContextIdx: uniqueIndex("chatbot_memory_personality_id_context_key_unique").on(table.personalityId, table.contextKey),
  expiresAtIdx: index("chatbot_memory_expires_at_idx").on(table.expiresAt),
}));

// Analytics Snapshots - Daily snapshots of streamer metrics
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  followers: integer("followers").default(0).notNull(),
  subscribers: integer("subscribers").default(0).notNull(),
  avgViewers: integer("avg_viewers").default(0).notNull(),
  totalStreams: integer("total_streams").default(0).notNull(),
  totalHours: integer("total_hours").default(0).notNull(),
  revenue: integer("revenue").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: uniqueIndex("analytics_snapshots_user_id_date_unique").on(table.userId, table.date),
}));

// Sentiment Analysis - AI-powered sentiment analysis of chat messages
export const sentimentAnalysis = pgTable("sentiment_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  positiveMessages: integer("positive_messages").default(0).notNull(),
  negativeMessages: integer("negative_messages").default(0).notNull(),
  neutralMessages: integer("neutral_messages").default(0).notNull(),
  sentimentScore: integer("sentiment_score").default(0).notNull(), // -100 to 100
  topTopics: jsonb("top_topics").default(sql`'[]'::jsonb`).notNull(), // Array of {topic: string, count: number}
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: uniqueIndex("sentiment_analysis_user_id_date_unique").on(table.userId, table.date),
}));

// OBS Connections - Store OBS WebSocket connection settings per user
export const obsConnections = pgTable("obs_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  host: text("host").default("localhost").notNull(),
  port: integer("port").default(4455).notNull(),
  password: text("password").notNull(), // Encrypted password for OBS WebSocket
  isConnected: boolean("is_connected").default(false).notNull(),
  lastConnectedAt: timestamp("last_connected_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OBS Automations - Event-triggered OBS actions
export const obsAutomations = pgTable("obs_automations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  trigger: jsonb("trigger").notNull(), // {type: 'follow' | 'subscribe' | 'bits' | 'raid' | 'command' | 'timer', value?: string}
  actions: jsonb("actions").notNull(), // Array of {type: 'scene' | 'source_visibility' | 'text_update' | 'media_play', params: object, delay?: number}
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userNameIdx: uniqueIndex("obs_automations_user_id_name_unique").on(table.userId, table.name),
}));

// Facts - AI-generated Snapple facts stored by stream-bot
export const facts = pgTable("facts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fact: text("fact").notNull(),
  source: text("source").default("stream-bot").notNull(), // 'stream-bot', 'openai', 'manual'
  tags: jsonb("tags").default(sql`'[]'::jsonb`).notNull(), // Array of tag strings for categorization
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("facts_created_at_idx").on(table.createdAt),
  sourceIdx: index("facts_source_idx").on(table.source),
}));

// Stream Clips - Capture and highlight stream moments from connected platforms
export const streamClips = pgTable("stream_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  clipId: text("clip_id").notNull(), // External platform clip ID
  title: text("title").notNull(),
  url: text("url").notNull(),
  embedUrl: text("embed_url"), // Embeddable player URL
  thumbnailUrl: text("thumbnail_url"),
  duration: integer("duration").default(0).notNull(), // Duration in seconds
  viewCount: integer("view_count").default(0).notNull(),
  gameId: text("game_id"), // Game/category ID from platform
  gameName: text("game_name"), // Game/category name
  broadcasterName: text("broadcaster_name"),
  broadcasterId: text("broadcaster_id"),
  isHighlight: boolean("is_highlight").default(false).notNull(), // User-marked as highlight/favorite
  status: text("status").default("new").notNull(), // 'new', 'reviewed', 'posted' - Workflow status for social posting
  tags: jsonb("tags").default(sql`'[]'::jsonb`).notNull(), // Array of tag strings for organization
  socialCaption: text("social_caption"), // AI-generated or custom caption for social media
  clipCreatedAt: timestamp("clip_created_at"), // When the clip was created on the platform
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("stream_clips_user_id_idx").on(table.userId),
  platformIdx: index("stream_clips_platform_idx").on(table.platform),
  clipIdIdx: uniqueIndex("stream_clips_user_clip_unique").on(table.userId, table.platform, table.clipId),
  isHighlightIdx: index("stream_clips_is_highlight_idx").on(table.isHighlight),
  statusIdx: index("stream_clips_status_idx").on(table.status),
  createdAtIdx: index("stream_clips_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// ENHANCED DATABASE AND AI FEATURES
// Per-Platform Credentials, Analytics, Time-Series, Intent Detection, etc.
// ============================================================================

// Enhanced Platform Credentials - Additional token metadata per platform
export const platformCredentialMetadata = pgTable("platform_credential_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }).unique(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick', 'spotify'
  scopes: jsonb("scopes").default(sql`'[]'::jsonb`).notNull(), // Array of granted OAuth scopes
  issuedAt: timestamp("issued_at"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  refreshCount: integer("refresh_count").default(0).notNull(),
  encryptedAccessToken: text("encrypted_access_token"), // Backup encrypted access token
  encryptedRefreshToken: text("encrypted_refresh_token"), // Backup encrypted refresh token
  tokenVersion: integer("token_version").default(1).notNull(), // For token versioning/rollback
  previousTokenHash: text("previous_token_hash"), // Hash of previous token for rollback verification
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("platform_credential_metadata_connection_id_idx").on(table.connectionId),
  platformIdx: index("platform_credential_metadata_platform_idx").on(table.platform),
}));

// Fact Generation Analytics - Track fact generation history and performance
export const factAnalytics = pgTable("fact_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  factId: varchar("fact_id").references(() => facts.id, { onDelete: "set null" }),
  factContent: text("fact_content").notNull(),
  topic: text("topic").notNull(), // Topic category (space, history, animals, etc.)
  length: integer("length").notNull(), // Character count
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  triggerType: text("trigger_type").notNull(), // 'scheduled', 'manual', 'command', 'chat_trigger'
  triggerUser: text("trigger_user"), // Username who triggered (if applicable)
  aiModel: text("ai_model").default("gpt-4o").notNull(), // Model used to generate
  generationTimeMs: integer("generation_time_ms"), // Time taken to generate in ms
  views: integer("views").default(0).notNull(),
  reactions: jsonb("reactions").default(sql`'{}'::jsonb`).notNull(), // {emoji: count} reactions
  engagementScore: integer("engagement_score").default(0).notNull(), // Calculated engagement
  wasPersonalized: boolean("was_personalized").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("fact_analytics_user_id_idx").on(table.userId),
  topicIdx: index("fact_analytics_topic_idx").on(table.topic),
  platformIdx: index("fact_analytics_platform_idx").on(table.platform),
  createdAtIdx: index("fact_analytics_created_at_idx").on(table.createdAt),
}));

// User Topic Preferences - Learn user preferences from reactions for personalization
export const userTopicPreferences = pgTable("user_topic_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(), // Topic category
  positiveReactions: integer("positive_reactions").default(0).notNull(),
  negativeReactions: integer("negative_reactions").default(0).notNull(),
  totalShown: integer("total_shown").default(0).notNull(),
  preferenceScore: integer("preference_score").default(50).notNull(), // 0-100 score
  lastShownAt: timestamp("last_shown_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userTopicIdx: uniqueIndex("user_topic_preferences_user_topic_unique").on(table.userId, table.topic),
}));

// Platform Stats Time-Series - Hourly/daily aggregated platform statistics
export const platformStats = pgTable("platform_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  periodType: text("period_type").notNull(), // 'hourly', 'daily'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  messagesReceived: integer("messages_received").default(0).notNull(),
  apiCalls: integer("api_calls").default(0).notNull(),
  apiErrors: integer("api_errors").default(0).notNull(),
  factsGenerated: integer("facts_generated").default(0).notNull(),
  commandsProcessed: integer("commands_processed").default(0).notNull(),
  moderationActions: integer("moderation_actions").default(0).notNull(),
  avgResponseTimeMs: integer("avg_response_time_ms"),
  peakConcurrentUsers: integer("peak_concurrent_users"),
  totalEngagement: integer("total_engagement").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPlatformPeriodIdx: uniqueIndex("platform_stats_user_platform_period_unique").on(
    table.userId, table.platform, table.periodType, table.periodStart
  ),
  periodStartIdx: index("platform_stats_period_start_idx").on(table.periodStart),
}));

// Token Rollback Storage - Temporary storage for old tokens during rotation
export const tokenRollbackStorage = pgTable("token_rollback_storage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  encryptedOldAccessToken: text("encrypted_old_access_token").notNull(),
  encryptedOldRefreshToken: text("encrypted_old_refresh_token"),
  oldTokenExpiresAt: timestamp("old_token_expires_at"),
  rotationId: varchar("rotation_id").references(() => tokenRotationHistory.id, { onDelete: "cascade" }),
  rollbackUsed: boolean("rollback_used").default(false).notNull(),
  rollbackUsedAt: timestamp("rollback_used_at"),
  expiresAt: timestamp("expires_at").notNull(), // Auto-cleanup after this time
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("token_rollback_storage_connection_id_idx").on(table.connectionId),
  expiresAtIdx: index("token_rollback_storage_expires_at_idx").on(table.expiresAt),
}));

// Intent Classifications - Store chat message intent analysis results
export const intentClassifications = pgTable("intent_classifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  username: text("username").notNull(),
  message: text("message").notNull(),
  intent: text("intent").notNull(), // 'question', 'command', 'request', 'greeting', 'complaint', 'praise', 'other'
  subIntent: text("sub_intent"), // More specific classification
  confidence: integer("confidence").default(0).notNull(), // 0-100
  entities: jsonb("entities").default(sql`'[]'::jsonb`).notNull(), // Extracted entities [{type, value}]
  sentiment: text("sentiment"), // 'positive', 'negative', 'neutral'
  wasRouted: boolean("was_routed").default(false).notNull(),
  routedTo: text("routed_to"), // Handler name that processed this
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("intent_classifications_user_id_idx").on(table.userId),
  intentIdx: index("intent_classifications_intent_idx").on(table.intent),
  createdAtIdx: index("intent_classifications_created_at_idx").on(table.createdAt),
}));

// Enhanced Moderation Settings - Configurable moderation with sensitivity levels
export const enhancedModerationSettings = pgTable("enhanced_moderation_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  globalSensitivity: text("global_sensitivity").default("medium").notNull(), // 'low', 'medium', 'high', 'custom'
  toxicitySensitivity: integer("toxicity_sensitivity").default(50).notNull(), // 0-100
  spamSensitivity: integer("spam_sensitivity").default(50).notNull(),
  hateSensitivity: integer("hate_sensitivity").default(70).notNull(),
  harassmentSensitivity: integer("harassment_sensitivity").default(60).notNull(),
  sexualSensitivity: integer("sexual_sensitivity").default(70).notNull(),
  violenceSensitivity: integer("violence_sensitivity").default(60).notNull(),
  selfHarmSensitivity: integer("self_harm_sensitivity").default(80).notNull(),
  customWhitelist: jsonb("custom_whitelist").default(sql`'[]'::jsonb`).notNull(), // Whitelisted words/phrases
  customBlacklist: jsonb("custom_blacklist").default(sql`'[]'::jsonb`).notNull(), // Blacklisted words/phrases
  whitelistedUsers: jsonb("whitelisted_users").default(sql`'[]'::jsonb`).notNull(), // Users exempt from moderation
  autoTimeoutEnabled: boolean("auto_timeout_enabled").default(true).notNull(),
  autoBanThreshold: integer("auto_ban_threshold").default(3).notNull(), // Number of violations before auto-ban
  logAllMessages: boolean("log_all_messages").default(false).notNull(), // Log all checked messages
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Moderation Action Log - Detailed log of all moderation actions
export const moderationActionLog = pgTable("moderation_action_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  targetUsername: text("target_username").notNull(),
  targetMessage: text("target_message").notNull(),
  actionType: text("action_type").notNull(), // 'delete', 'timeout', 'ban', 'warn', 'allow'
  actionReason: text("action_reason").notNull(),
  violationType: text("violation_type"), // 'toxic', 'spam', 'hate', 'harassment', 'sexual', 'violence', 'custom'
  confidenceScore: integer("confidence_score"), // 0-100 AI confidence
  sensitivityUsed: integer("sensitivity_used"), // Sensitivity setting at time of action
  wasAppealed: boolean("was_appealed").default(false).notNull(),
  appealOutcome: text("appeal_outcome"), // 'upheld', 'reversed', 'modified'
  moderatorOverride: boolean("moderator_override").default(false).notNull(),
  overrideBy: text("override_by"), // Moderator who overrode the decision
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("moderation_action_log_user_id_idx").on(table.userId),
  targetUsernameIdx: index("moderation_action_log_target_username_idx").on(table.targetUsername),
  actionTypeIdx: index("moderation_action_log_action_type_idx").on(table.actionType),
  createdAtIdx: index("moderation_action_log_created_at_idx").on(table.createdAt),
}));

// Speech-to-Text Queue - Prepare for future Whisper integration
export const speechToTextQueue = pgTable("speech_to_text_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  audioSource: text("audio_source").notNull(), // 'stream_audio', 'clip', 'upload'
  audioUrl: text("audio_url"), // URL to audio file if stored externally
  audioFormat: text("audio_format").default("wav").notNull(), // 'wav', 'mp3', 'webm', 'ogg'
  durationMs: integer("duration_ms"),
  sampleRate: integer("sample_rate").default(16000).notNull(),
  channels: integer("channels").default(1).notNull(),
  status: text("status").default("pending").notNull(), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  priority: integer("priority").default(5).notNull(),
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  processingTimeMs: integer("processing_time_ms"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("speech_to_text_queue_user_id_idx").on(table.userId),
  statusIdx: index("speech_to_text_queue_status_idx").on(table.status),
  createdAtIdx: index("speech_to_text_queue_created_at_idx").on(table.createdAt),
}));

// Transcriptions - Store completed speech-to-text transcriptions
export const transcriptions = pgTable("transcriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").references(() => speechToTextQueue.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  audioSource: text("audio_source").notNull(),
  transcriptionText: text("transcription_text").notNull(),
  language: text("language").default("en").notNull(),
  confidence: integer("confidence"), // 0-100 overall confidence
  wordTimestamps: jsonb("word_timestamps"), // [{word, start_ms, end_ms, confidence}]
  segments: jsonb("segments"), // [{text, start_ms, end_ms, confidence}]
  speakerLabels: jsonb("speaker_labels"), // [{speaker_id, segments: [indices]}]
  durationMs: integer("duration_ms"),
  modelUsed: text("model_used").default("whisper-1").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("transcriptions_user_id_idx").on(table.userId),
  queueIdIdx: index("transcriptions_queue_id_idx").on(table.queueId),
  createdAtIdx: index("transcriptions_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// ENHANCED BACKEND FEATURES - Onboarding, Feature Toggles, Platform Failover,
// Job Queue, and Enhanced Token Management
// ============================================================================

// Feature Toggles - Per-user feature configuration for modular feature management
export const featureToggles = pgTable("feature_toggles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Platform-specific features
  twitchEnabled: boolean("twitch_enabled").default(true).notNull(),
  youtubeEnabled: boolean("youtube_enabled").default(true).notNull(),
  kickEnabled: boolean("kick_enabled").default(true).notNull(),
  spotifyEnabled: boolean("spotify_enabled").default(true).notNull(),
  
  // Core features
  factsEnabled: boolean("facts_enabled").default(true).notNull(),
  shoutoutsEnabled: boolean("shoutouts_enabled").default(true).notNull(),
  commandsEnabled: boolean("commands_enabled").default(true).notNull(),
  songRequestsEnabled: boolean("song_requests_enabled").default(true).notNull(),
  pollsEnabled: boolean("polls_enabled").default(true).notNull(),
  alertsEnabled: boolean("alerts_enabled").default(true).notNull(),
  gamesEnabled: boolean("games_enabled").default(true).notNull(),
  moderationEnabled: boolean("moderation_enabled").default(true).notNull(),
  chatbotEnabled: boolean("chatbot_enabled").default(false).notNull(),
  currencyEnabled: boolean("currency_enabled").default(true).notNull(),
  giveawaysEnabled: boolean("giveaways_enabled").default(true).notNull(),
  analyticsEnabled: boolean("analytics_enabled").default(true).notNull(),
  obsIntegrationEnabled: boolean("obs_integration_enabled").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Platform Health - Circuit breaker state for platform failover
export const platformHealth = pgTable("platform_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: text("platform").notNull().unique(), // 'twitch', 'youtube', 'kick', 'spotify'
  
  // Circuit breaker state
  circuitState: text("circuit_state").default("closed").notNull(), // 'closed', 'open', 'half-open'
  failureCount: integer("failure_count").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  lastFailure: timestamp("last_failure"),
  lastSuccess: timestamp("last_success"),
  
  // Throttling state
  isThrottled: boolean("is_throttled").default(false).notNull(),
  throttledUntil: timestamp("throttled_until"),
  throttleRetryCount: integer("throttle_retry_count").default(0).notNull(),
  
  // Health metrics
  avgResponseTime: integer("avg_response_time").default(0).notNull(), // ms
  requestsToday: integer("requests_today").default(0).notNull(),
  errorsToday: integer("errors_today").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  platformIdx: index("platform_health_platform_idx").on(table.platform),
  circuitStateIdx: index("platform_health_circuit_state_idx").on(table.circuitState),
}));

// Message Queue - Queue for throttled/failed messages
export const messageQueue = pgTable("message_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  messageType: text("message_type").notNull(), // 'fact', 'shoutout', 'alert', 'command_response'
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // Additional context
  
  // Queue state
  status: text("status").default("pending").notNull(), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  priority: integer("priority").default(5).notNull(), // 1-10, higher = more priority
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastError: text("last_error"),
  
  // Timing
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("message_queue_status_idx").on(table.status),
  platformIdx: index("message_queue_platform_idx").on(table.platform),
  scheduledForIdx: index("message_queue_scheduled_for_idx").on(table.scheduledFor),
  userIdIdx: index("message_queue_user_id_idx").on(table.userId),
}));

// Job Queue - Background task processing
export const jobQueue = pgTable("job_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // null for system jobs
  
  // Job definition
  jobType: text("job_type").notNull(), // 'scheduled_fact', 'analytics_aggregation', 'token_refresh', 'cleanup', 'notification'
  jobName: text("job_name").notNull(), // Human-readable name
  payload: jsonb("payload"), // Job-specific data
  
  // Scheduling
  status: text("status").default("pending").notNull(), // 'pending', 'running', 'completed', 'failed', 'cancelled', 'scheduled'
  priority: integer("priority").default(5).notNull(), // 1-10
  runAt: timestamp("run_at").defaultNow().notNull(), // When to run
  repeatInterval: integer("repeat_interval"), // Interval in seconds for recurring jobs (null = one-time)
  
  // Execution
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastError: text("last_error"),
  result: jsonb("result"), // Job output/result
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("job_queue_status_idx").on(table.status),
  jobTypeIdx: index("job_queue_job_type_idx").on(table.jobType),
  runAtIdx: index("job_queue_run_at_idx").on(table.runAt),
  userIdIdx: index("job_queue_user_id_idx").on(table.userId),
}));

// Token Rotation History - Track OAuth token changes
export const tokenRotationHistory = pgTable("token_rotation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick', 'spotify'
  
  // Rotation details
  rotationType: text("rotation_type").notNull(), // 'scheduled', 'on_error', 'manual', 'expiry_warning'
  previousExpiresAt: timestamp("previous_expires_at"),
  newExpiresAt: timestamp("new_expires_at"),
  
  // Result
  success: boolean("success").default(true).notNull(),
  errorMessage: text("error_message"),
  
  // Tracking
  rotatedAt: timestamp("rotated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("token_rotation_history_user_id_idx").on(table.userId),
  platformIdx: index("token_rotation_history_platform_idx").on(table.platform),
  rotatedAtIdx: index("token_rotation_history_rotated_at_idx").on(table.rotatedAt),
}));

// Onboarding Progress - Track broadcaster onboarding steps
export const onboardingProgress = pgTable("onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Step completion flags
  welcomeCompleted: boolean("welcome_completed").default(false).notNull(), // Step 1: Welcome
  platformsCompleted: boolean("platforms_completed").default(false).notNull(), // Step 2: Connect platforms
  featuresCompleted: boolean("features_completed").default(false).notNull(), // Step 3: Enable features
  settingsCompleted: boolean("settings_completed").default(false).notNull(), // Step 4: Configure settings
  finishCompleted: boolean("finish_completed").default(false).notNull(), // Step 5: Review and finish
  
  // Platform connection status
  twitchConnected: boolean("twitch_connected").default(false).notNull(),
  youtubeConnected: boolean("youtube_connected").default(false).notNull(),
  kickConnected: boolean("kick_connected").default(false).notNull(),
  spotifyConnected: boolean("spotify_connected").default(false).notNull(),
  
  // Feature enablement checklist
  enabledFeatures: jsonb("enabled_features").default(sql`'[]'::jsonb`).notNull(), // Array of enabled feature names
  
  // Progress metadata
  currentStep: integer("current_step").default(1).notNull(), // 1-5
  lastVisitedAt: timestamp("last_visited_at"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Token Expiry Alerts - Track tokens nearing expiry
export const tokenExpiryAlerts = pgTable("token_expiry_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick', 'spotify'
  
  // Alert details
  alertType: text("alert_type").notNull(), // '24hr_warning', '1hr_warning', 'expired', 'refresh_failed'
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  
  // Notification status
  notificationSent: boolean("notification_sent").default(false).notNull(),
  notifiedAt: timestamp("notified_at"),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("token_expiry_alerts_user_id_idx").on(table.userId),
  platformIdx: index("token_expiry_alerts_platform_idx").on(table.platform),
  alertTypeIdx: index("token_expiry_alerts_alert_type_idx").on(table.alertType),
}));

// Webhook Queue - Durable webhook retry system for go-live notifications
export const webhookQueue = pgTable("webhook_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(), // twitch, youtube, kick
  payload: text("payload").notNull(), // JSON stringified webhook data
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  status: text("status").default("pending").notNull(), // pending, sent, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("webhook_queue_status_idx").on(table.status),
  nextRetryAtIdx: index("webhook_queue_next_retry_at_idx").on(table.nextRetryAt),
  userIdIdx: index("webhook_queue_user_id_idx").on(table.userId),
}));

// Scheduled Announcements - User-scheduled messages for going live alerts and automated messages
export const scheduledAnnouncements = pgTable("scheduled_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  platforms: jsonb("platforms").default(sql`'[]'::jsonb`).notNull(), // Array of platforms: ['twitch', 'youtube', 'kick', 'discord']
  scheduleType: text("schedule_type").notNull(), // 'once', 'before_stream', 'recurring'
  scheduledTime: timestamp("scheduled_time"), // For 'once' type
  beforeStreamMinutes: integer("before_stream_minutes"), // For 'before_stream' type (e.g., 15 means 15 min before stream)
  cronPattern: text("cron_pattern"), // For 'recurring' type (e.g., "0 18 * * 1,3,5" for Mon/Wed/Fri at 6pm)
  discordWebhookUrl: text("discord_webhook_url"), // Optional Discord webhook URL
  status: text("status").default("pending").notNull(), // 'pending', 'sent', 'failed', 'cancelled'
  lastSentAt: timestamp("last_sent_at"),
  nextRunAt: timestamp("next_run_at"), // Next scheduled execution time
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  errorMessage: text("error_message"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("scheduled_announcements_user_id_idx").on(table.userId),
  statusIdx: index("scheduled_announcements_status_idx").on(table.status),
  nextRunAtIdx: index("scheduled_announcements_next_run_at_idx").on(table.nextRunAt),
  scheduleTypeIdx: index("scheduled_announcements_schedule_type_idx").on(table.scheduleType),
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
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommandAliasSchema = createInsertSchema(commandAliases, {
  alias: z.string().min(1, "Alias is required").max(50, "Alias too long"),
}).omit({
  id: true,
  createdAt: true,
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

export const insertGiveawayEntryAttemptSchema = createInsertSchema(giveawayEntryAttempts).omit({
  id: true,
  attemptedAt: true,
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

export const insertShoutoutSettingsSchema = createInsertSchema(shoutoutSettings, {
  shoutoutTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShoutoutHistorySchema = createInsertSchema(shoutoutHistory, {
  targetUsername: z.string().min(1, "Target username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  shoutoutType: z.enum(["manual", "raid", "host", "command"]),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
}).omit({
  id: true,
  timestamp: true,
});

export const insertStreamSessionSchema = createInsertSchema(streamSessions, {
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertViewerSnapshotSchema = createInsertSchema(viewerSnapshots).omit({
  id: true,
  timestamp: true,
});

export const insertChatActivitySchema = createInsertSchema(chatActivity, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  messageCount: z.coerce.number().min(1),
}).omit({
  id: true,
  timestamp: true,
});

export const insertGameSettingsSchema = createInsertSchema(gameSettings, {
  cooldownMinutes: z.coerce.number().min(0).max(60),
  pointsPerWin: z.coerce.number().min(0).max(1000),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGameHistorySchema = createInsertSchema(gameHistory, {
  gameType: z.enum(["8ball", "trivia", "duel", "slots", "roulette"]),
  player: z.string().min(1, "Player is required").max(100, "Player name too long"),
  opponent: z.string().max(100, "Opponent name too long").optional(),
  outcome: z.enum(["win", "loss", "neutral"]),
  pointsAwarded: z.coerce.number().min(0),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  timestamp: true,
});

export const insertActiveTriviaQuestionSchema = createInsertSchema(activeTriviaQuestions, {
  player: z.string().min(1, "Player is required").max(100, "Player name too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  question: z.string().min(1, "Question is required"),
  correctAnswer: z.string().min(1, "Answer is required"),
  difficulty: z.enum(["easy", "medium", "hard"]),
}).omit({
  id: true,
  createdAt: true,
});

export const insertGameStatsSchema = createInsertSchema(gameStats, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  gameName: z.enum(["8ball", "trivia", "duel", "slots", "roulette"]),
  platform: z.enum(["twitch", "youtube", "kick"]),
  wins: z.coerce.number().min(0),
  losses: z.coerce.number().min(0),
  neutral: z.coerce.number().min(0),
  totalPlays: z.coerce.number().min(0),
  totalPointsEarned: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCurrencySettingsSchema = createInsertSchema(currencySettings, {
  currencyName: z.string().min(1, "Currency name is required").max(50, "Currency name too long"),
  currencySymbol: z.string().min(1, "Currency symbol is required").max(10, "Currency symbol too long"),
  earnPerMessage: z.coerce.number().min(0).max(1000),
  earnPerMinute: z.coerce.number().min(0).max(1000),
  startingBalance: z.coerce.number().min(0).max(1000000),
  maxBalance: z.coerce.number().min(0).max(100000000),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserBalanceSchema = createInsertSchema(userBalances, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  balance: z.coerce.number().min(0),
  totalEarned: z.coerce.number().min(0),
  totalSpent: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCurrencyTransactionSchema = createInsertSchema(currencyTransactions, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  type: z.enum(["earn_message", "earn_watch", "gamble_win", "gamble_loss", "reward_purchase", "admin_adjust", "transfer_in", "transfer_out"]),
  amount: z.coerce.number(),
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
}).omit({
  id: true,
  timestamp: true,
});

export const insertCurrencyRewardSchema = createInsertSchema(currencyRewards, {
  rewardName: z.string().min(1, "Reward name is required").max(100, "Reward name too long"),
  cost: z.coerce.number().min(1).max(1000000),
  command: z.string().max(500, "Command too long").optional(),
  stock: z.coerce.number().min(0).optional(),
  maxRedeems: z.coerce.number().min(1).optional(),
  rewardType: z.enum(["timeout_immunity", "song_request", "highlight_message", "custom_command"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRewardRedemptionSchema = createInsertSchema(rewardRedemptions, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  redeemedAt: true,
});

export const insertSongQueueSchema = createInsertSchema(songQueue, {
  requestedBy: z.string().min(1, "Username is required").max(100, "Username too long"),
  songTitle: z.string().min(1, "Song title is required").max(200, "Song title too long"),
  artist: z.string().min(1, "Artist is required").max(200, "Artist too long"),
  url: z.string().url("Invalid URL"),
  platform: z.enum(["spotify", "youtube"]),
  status: z.enum(["pending", "playing", "played", "skipped", "removed"]),
  position: z.coerce.number().min(0),
  duration: z.coerce.number().min(0).optional(),
}).omit({
  id: true,
  createdAt: true,
  requestedAt: true,
});

export const insertSongSettingsSchema = createInsertSchema(songSettings, {
  maxQueueSize: z.coerce.number().min(1).max(100),
  maxSongsPerUser: z.coerce.number().min(1).max(10),
  volumeLimit: z.coerce.number().min(0).max(100),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollSchema = createInsertSchema(polls, {
  question: z.string().min(1, "Question is required").max(200, "Question too long"),
  options: z.array(z.string().min(1).max(100)).min(2, "At least 2 options required").max(10, "Maximum 10 options"),
  duration: z.coerce.number().min(30, "Minimum 30 seconds").max(3600, "Maximum 1 hour"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  status: z.enum(["pending", "active", "ended", "cancelled"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollVoteSchema = createInsertSchema(pollVotes, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  option: z.string().min(1, "Option is required"),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  votedAt: true,
});

export const insertPredictionSchema = createInsertSchema(predictions, {
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  outcomes: z.array(z.string().min(1).max(100)).min(2, "At least 2 outcomes required").max(10, "Maximum 10 outcomes"),
  duration: z.coerce.number().min(30, "Minimum 30 seconds").max(3600, "Maximum 1 hour"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  status: z.enum(["pending", "active", "locked", "resolved", "cancelled"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPredictionBetSchema = createInsertSchema(predictionBets, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  outcome: z.string().min(1, "Outcome is required"),
  points: z.coerce.number().min(1, "Minimum 1 point").max(1000000),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  placedAt: true,
});

export const insertAlertSettingsSchema = createInsertSchema(alertSettings, {
  followerTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  subTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  raidTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  milestoneThresholds: z.array(z.number().min(1).max(1000000)).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory, {
  alertType: z.enum(["follower", "subscriber", "raid", "milestone"]),
  message: z.string().min(1, "Message is required"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  username: z.string().max(100, "Username too long").optional(),
}).omit({
  id: true,
  timestamp: true,
});

export const insertMilestoneSchema = createInsertSchema(milestones, {
  milestoneType: z.enum(["followers", "subscribers"]),
  threshold: z.coerce.number().min(1).max(1000000),
}).omit({
  id: true,
  createdAt: true,
});

export const insertStreamAlertSchema = createInsertSchema(streamAlerts, {
  alertType: z.enum(["follow", "sub", "donation", "raid", "bits", "host"]),
  textTemplate: z.string().min(1, "Text template is required").max(500, "Text template too long"),
  animation: z.enum(["fade", "slide", "bounce", "zoom", "flip", "shake"]),
  duration: z.coerce.number().min(1).max(60),
  fontSize: z.coerce.number().min(10).max(100),
  fontColor: z.string().regex(/^#[0-9A-Fa-f]{6}$|^transparent$/, "Invalid color format"),
  backgroundColor: z.string().max(50),
  volume: z.coerce.number().min(0).max(100),
  minAmount: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAlertQueueSchema = createInsertSchema(alertQueue, {
  alertType: z.enum(["follow", "sub", "donation", "raid", "bits", "host"]),
  data: z.object({
    triggeredBy: z.string(),
    amount: z.number().optional(),
    message: z.string().optional(),
    tier: z.string().optional(),
    months: z.number().optional(),
    platform: z.string(),
  }),
}).omit({
  id: true,
  createdAt: true,
});

export const insertStreamAlertHistorySchema = createInsertSchema(streamAlertHistory, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  alertType: z.enum(["follow", "sub", "donation", "raid", "bits", "host"]),
  triggeredBy: z.string().min(1, "Triggered by is required").max(100, "Username too long"),
  amount: z.coerce.number().min(0).optional(),
  message: z.string().max(500, "Message too long").optional(),
  tier: z.string().max(20).optional(),
  months: z.coerce.number().min(0).optional(),
}).omit({
  id: true,
  triggeredAt: true,
});

export const insertChatbotSettingsSchema = createInsertSchema(chatbotSettings, {
  personality: z.enum(["friendly", "snarky", "professional", "enthusiastic", "chill", "custom"]),
  customPersonalityPrompt: z.string().max(1000, "Personality prompt too long").optional(),
  temperature: z.coerce.number().min(0).max(20), // 0-20 representing 0.0-2.0
  responseRate: z.coerce.number().min(10).max(300), // 10-300 seconds
  contextWindow: z.coerce.number().min(1).max(50), // 1-50 messages
  mentionTrigger: z.string().min(1, "Mention trigger is required").max(50, "Mention trigger too long"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatbotResponseSchema = createInsertSchema(chatbotResponses, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
  response: z.string().min(1, "Response is required").max(500, "Response too long"),
  personality: z.enum(["friendly", "snarky", "professional", "enthusiastic", "chill", "custom"]),
  wasHelpful: z.boolean().optional(),
  engagementScore: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  timestamp: true,
  createdAt: true,
});

export const insertChatbotContextSchema = createInsertSchema(chatbotContext, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  messageCount: z.coerce.number().min(0).optional(),
  conversationSummary: z.string().max(1000, "Summary too long").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatbotPersonalitySchema = createInsertSchema(chatbotPersonalities, {
  name: z.string().min(1, "Personality name is required").max(100, "Name too long"),
  systemPrompt: z.string().min(10, "System prompt is required").max(2000, "Prompt too long"),
  temperature: z.coerce.number().min(0).max(20), // 0-20 representing 0.0-2.0
  traits: z.array(z.string()).optional(),
  tone: z.enum(["friendly", "sarcastic", "professional", "funny"]).optional(),
  responseStyle: z.enum(["short", "medium", "verbose"]).optional(),
  triggerWords: z.array(z.string()).optional(),
  replyChance: z.coerce.number().min(0).max(100).optional(),
  cooldown: z.coerce.number().min(0).max(3600).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatbotMemorySchema = createInsertSchema(chatbotMemory, {
  contextKey: z.string().min(1, "Context key is required").max(200, "Context key too long"),
  contextValue: z.string().min(1, "Context value is required").max(5000, "Context value too long"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots, {
  followers: z.coerce.number().min(0),
  subscribers: z.coerce.number().min(0),
  avgViewers: z.coerce.number().min(0),
  totalStreams: z.coerce.number().min(0),
  totalHours: z.coerce.number().min(0),
  revenue: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
});

export const insertSentimentAnalysisSchema = createInsertSchema(sentimentAnalysis, {
  positiveMessages: z.coerce.number().min(0),
  negativeMessages: z.coerce.number().min(0),
  neutralMessages: z.coerce.number().min(0),
  sentimentScore: z.coerce.number().min(-100).max(100),
  topTopics: z.array(z.object({
    topic: z.string(),
    count: z.number(),
  })).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertOBSConnectionSchema = createInsertSchema(obsConnections, {
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().min(1).max(65535),
  password: z.string().min(1, "Password is required"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOBSAutomationSchema = createInsertSchema(obsAutomations, {
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  enabled: z.boolean().optional(),
  trigger: z.object({
    type: z.enum(["follow", "subscribe", "bits", "raid", "command", "timer"]),
    value: z.string().optional(),
  }),
  actions: z.array(z.object({
    type: z.enum(["scene", "source_visibility", "text_update", "media_play"]),
    params: z.record(z.any()),
    delay: z.number().optional(),
  })),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFactSchema = createInsertSchema(facts, {
  fact: z.string().min(1, "Fact is required").max(1000, "Fact too long"),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertStreamClipSchema = createInsertSchema(streamClips, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  clipId: z.string().min(1, "Clip ID is required"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  url: z.string().url("Invalid URL"),
  embedUrl: z.string().url("Invalid embed URL").optional(),
  thumbnailUrl: z.string().url("Invalid thumbnail URL").optional(),
  duration: z.coerce.number().min(0).optional(),
  viewCount: z.coerce.number().min(0).optional(),
  gameId: z.string().optional(),
  gameName: z.string().optional(),
  broadcasterName: z.string().optional(),
  broadcasterId: z.string().optional(),
  isHighlight: z.boolean().optional(),
  status: z.enum(["new", "reviewed", "posted"]).optional(),
  tags: z.array(z.string()).optional(),
  socialCaption: z.string().max(500, "Caption too long").optional(),
  clipCreatedAt: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateStreamClipSchema = insertStreamClipSchema.partial();

export const insertScheduledAnnouncementSchema = createInsertSchema(scheduledAnnouncements, {
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  message: z.string().min(1, "Message is required").max(1000, "Message too long"),
  platforms: z.array(z.enum(["twitch", "youtube", "kick", "discord"])).min(1, "At least one platform required"),
  scheduleType: z.enum(["once", "before_stream", "recurring"]),
  scheduledTime: z.coerce.date().optional(),
  beforeStreamMinutes: z.coerce.number().min(1).max(120).optional(),
  cronPattern: z.string().max(100).optional(),
  discordWebhookUrl: z.string().url("Invalid webhook URL").optional().or(z.literal("")),
  status: z.enum(["pending", "sent", "failed", "cancelled"]).optional(),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const updateScheduledAnnouncementSchema = insertScheduledAnnouncementSchema.partial();

// ============================================================================
// INSERT SCHEMAS FOR ENHANCED BACKEND FEATURES
// ============================================================================

export const insertFeatureTogglesSchema = createInsertSchema(featureToggles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformHealthSchema = createInsertSchema(platformHealth).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageQueueSchema = createInsertSchema(messageQueue, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  messageType: z.enum(["fact", "shoutout", "alert", "command_response"]),
  content: z.string().min(1, "Content is required").max(2000, "Content too long"),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
  priority: z.coerce.number().min(1).max(10).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertJobQueueSchema = createInsertSchema(jobQueue, {
  jobType: z.enum(["scheduled_fact", "analytics_aggregation", "token_refresh", "cleanup", "notification"]),
  jobName: z.string().min(1, "Job name is required").max(100, "Job name too long"),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "scheduled"]).optional(),
  priority: z.coerce.number().min(1).max(10).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTokenRotationHistorySchema = createInsertSchema(tokenRotationHistory, {
  platform: z.enum(["twitch", "youtube", "kick", "spotify"]),
  rotationType: z.enum(["scheduled", "on_error", "manual", "expiry_warning"]),
}).omit({
  id: true,
  rotatedAt: true,
});

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTokenExpiryAlertSchema = createInsertSchema(tokenExpiryAlerts, {
  platform: z.enum(["twitch", "youtube", "kick", "spotify"]),
  alertType: z.enum(["24hr_warning", "1hr_warning", "expired", "refresh_failed"]),
}).omit({
  id: true,
  createdAt: true,
});

// ============================================================================
// INSERT SCHEMAS FOR ENHANCED DATABASE AND AI FEATURES
// ============================================================================

export const insertPlatformCredentialMetadataSchema = createInsertSchema(platformCredentialMetadata, {
  platform: z.enum(["twitch", "youtube", "kick", "spotify"]),
  scopes: z.array(z.string()).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFactAnalyticsSchema = createInsertSchema(factAnalytics, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  triggerType: z.enum(["scheduled", "manual", "command", "chat_trigger"]),
  factContent: z.string().min(1).max(200),
  topic: z.string().min(1).max(50),
  length: z.coerce.number().min(1).max(200),
}).omit({
  id: true,
  createdAt: true,
});

export const insertUserTopicPreferencesSchema = createInsertSchema(userTopicPreferences, {
  topic: z.string().min(1).max(50),
  preferenceScore: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformStatsSchema = createInsertSchema(platformStats, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  periodType: z.enum(["hourly", "daily"]),
}).omit({
  id: true,
  createdAt: true,
});

export const insertTokenRollbackStorageSchema = createInsertSchema(tokenRollbackStorage, {
  platform: z.enum(["twitch", "youtube", "kick", "spotify"]),
  encryptedOldAccessToken: z.string().min(1),
}).omit({
  id: true,
  createdAt: true,
});

export const insertIntentClassificationSchema = createInsertSchema(intentClassifications, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  intent: z.enum(["question", "command", "request", "greeting", "complaint", "praise", "feedback", "spam", "other"]),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  confidence: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertEnhancedModerationSettingsSchema = createInsertSchema(enhancedModerationSettings, {
  globalSensitivity: z.enum(["low", "medium", "high", "custom"]).optional(),
  toxicitySensitivity: z.coerce.number().min(0).max(100).optional(),
  spamSensitivity: z.coerce.number().min(0).max(100).optional(),
  hateSensitivity: z.coerce.number().min(0).max(100).optional(),
  harassmentSensitivity: z.coerce.number().min(0).max(100).optional(),
  sexualSensitivity: z.coerce.number().min(0).max(100).optional(),
  violenceSensitivity: z.coerce.number().min(0).max(100).optional(),
  selfHarmSensitivity: z.coerce.number().min(0).max(100).optional(),
  customWhitelist: z.array(z.string()).optional(),
  customBlacklist: z.array(z.string()).optional(),
  whitelistedUsers: z.array(z.string()).optional(),
  autoBanThreshold: z.coerce.number().min(1).max(10).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModerationActionLogSchema = createInsertSchema(moderationActionLog, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  actionType: z.enum(["allow", "warn", "delete", "timeout", "ban"]),
  violationType: z.enum(["toxic", "spam", "hate", "harassment", "sexual", "violence", "self_harm", "custom_blacklist"]).optional(),
  confidenceScore: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertSpeechToTextQueueSchema = createInsertSchema(speechToTextQueue, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  audioSource: z.enum(["stream_audio", "clip", "upload", "microphone"]),
  audioFormat: z.enum(["wav", "mp3", "webm", "ogg", "m4a", "flac"]).optional(),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
  priority: z.coerce.number().min(1).max(10).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  audioSource: z.enum(["stream_audio", "clip", "upload", "microphone"]),
  transcriptionText: z.string().min(1),
  language: z.string().min(2).max(10).optional(),
  confidence: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertWebhookQueueSchema = createInsertSchema(webhookQueue, {
  platform: z.enum(["twitch", "youtube", "kick"]),
  payload: z.string().min(1),
  status: z.enum(["pending", "sent", "failed"]).optional(),
}).omit({
  id: true,
  createdAt: true,
});

// Update schemas for enhanced database and AI features
export const updatePlatformCredentialMetadataSchema = insertPlatformCredentialMetadataSchema.partial();
export const updateFactAnalyticsSchema = insertFactAnalyticsSchema.partial();
export const updateUserTopicPreferencesSchema = insertUserTopicPreferencesSchema.partial();
export const updatePlatformStatsSchema = insertPlatformStatsSchema.partial();
export const updateTokenRollbackStorageSchema = insertTokenRollbackStorageSchema.partial();
export const updateIntentClassificationSchema = insertIntentClassificationSchema.partial();
export const updateEnhancedModerationSettingsSchema = insertEnhancedModerationSettingsSchema.partial();
export const updateModerationActionLogSchema = insertModerationActionLogSchema.partial();
export const updateSpeechToTextQueueSchema = insertSpeechToTextQueueSchema.partial();
export const updateTranscriptionSchema = insertTranscriptionSchema.partial();

// Update schemas for partial updates
export const updateUserSchema = insertUserSchema.partial();
export const updateBotConfigSchema = insertBotConfigSchema.partial();
export const updatePlatformConnectionSchema = insertPlatformConnectionSchema.partial();
export const updateBotInstanceSchema = insertBotInstanceSchema.partial();
export const updateCustomCommandSchema = insertCustomCommandSchema.partial();
export const updateModerationRuleSchema = insertModerationRuleSchema.partial();
export const updateGiveawaySchema = insertGiveawaySchema.partial();
export const updateShoutoutSchema = insertShoutoutSchema.partial();
export const updateShoutoutSettingsSchema = insertShoutoutSettingsSchema.partial();
export const updateStreamSessionSchema = insertStreamSessionSchema.partial();
export const updateGameSettingsSchema = insertGameSettingsSchema.partial();
export const updateGameStatsSchema = insertGameStatsSchema.partial();
export const updateCurrencySettingsSchema = insertCurrencySettingsSchema.partial();
export const updateUserBalanceSchema = insertUserBalanceSchema.partial();
export const updateCurrencyRewardSchema = insertCurrencyRewardSchema.partial();
export const updateRewardRedemptionSchema = insertRewardRedemptionSchema.partial();
export const updateSongQueueSchema = insertSongQueueSchema.partial();
export const updateSongSettingsSchema = insertSongSettingsSchema.partial();
export const updatePollSchema = insertPollSchema.partial();
export const updatePollVoteSchema = insertPollVoteSchema.partial();
export const updatePredictionSchema = insertPredictionSchema.partial();
export const updatePredictionBetSchema = insertPredictionBetSchema.partial();
export const updateAlertSettingsSchema = insertAlertSettingsSchema.partial();
export const updateMilestoneSchema = insertMilestoneSchema.partial();
export const updateStreamAlertSchema = insertStreamAlertSchema.partial();
export const updateStreamAlertHistorySchema = insertStreamAlertHistorySchema.partial();
export const updateChatbotSettingsSchema = insertChatbotSettingsSchema.partial();
export const updateChatbotResponseSchema = insertChatbotResponseSchema.partial();
export const updateChatbotContextSchema = insertChatbotContextSchema.partial();
export const updateChatbotPersonalitySchema = insertChatbotPersonalitySchema.partial();
export const updateChatbotMemorySchema = insertChatbotMemorySchema.partial();
export const updateOBSConnectionSchema = insertOBSConnectionSchema.partial();
export const updateOBSAutomationSchema = insertOBSAutomationSchema.partial();

// Update schemas for enhanced backend features
export const updateFeatureTogglesSchema = insertFeatureTogglesSchema.partial();
export const updatePlatformHealthSchema = insertPlatformHealthSchema.partial();
export const updateMessageQueueSchema = insertMessageQueueSchema.partial();
export const updateJobQueueSchema = insertJobQueueSchema.partial();
export const updateOnboardingProgressSchema = insertOnboardingProgressSchema.partial();

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
export type CommandAlias = typeof commandAliases.$inferSelect;
export type ModerationRule = typeof moderationRules.$inferSelect;
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type LinkWhitelist = typeof linkWhitelist.$inferSelect;
export type Giveaway = typeof giveaways.$inferSelect;
export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type GiveawayWinner = typeof giveawayWinners.$inferSelect;
export type GiveawayEntryAttempt = typeof giveawayEntryAttempts.$inferSelect;
export type Shoutout = typeof shoutouts.$inferSelect;
export type ShoutoutSettings = typeof shoutoutSettings.$inferSelect;
export type ShoutoutHistory = typeof shoutoutHistory.$inferSelect;
export type StreamSession = typeof streamSessions.$inferSelect;
export type ViewerSnapshot = typeof viewerSnapshots.$inferSelect;
export type ChatActivity = typeof chatActivity.$inferSelect;
export type GameSettings = typeof gameSettings.$inferSelect;
export type GameHistory = typeof gameHistory.$inferSelect;
export type ActiveTriviaQuestion = typeof activeTriviaQuestions.$inferSelect;
export type GameStats = typeof gameStats.$inferSelect;
export type CurrencySettings = typeof currencySettings.$inferSelect;
export type UserBalance = typeof userBalances.$inferSelect;
export type CurrencyTransaction = typeof currencyTransactions.$inferSelect;
export type CurrencyReward = typeof currencyRewards.$inferSelect;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type SongQueue = typeof songQueue.$inferSelect;
export type SongSettings = typeof songSettings.$inferSelect;
export type Poll = typeof polls.$inferSelect;
export type PollVote = typeof pollVotes.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type PredictionBet = typeof predictionBets.$inferSelect;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type AlertHistory = typeof alertHistory.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type StreamAlert = typeof streamAlerts.$inferSelect;
export type StreamAlertHistory = typeof streamAlertHistory.$inferSelect;
export type AlertQueue = typeof alertQueue.$inferSelect;
export type ChatbotSettings = typeof chatbotSettings.$inferSelect;
export type ChatbotResponse = typeof chatbotResponses.$inferSelect;
export type ChatbotContext = typeof chatbotContext.$inferSelect;
export type ChatbotPersonality = typeof chatbotPersonalities.$inferSelect;
export type ChatbotMemory = typeof chatbotMemory.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type SentimentAnalysis = typeof sentimentAnalysis.$inferSelect;
export type OBSConnection = typeof obsConnections.$inferSelect;
export type OBSAutomation = typeof obsAutomations.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type StreamClip = typeof streamClips.$inferSelect;

// Select types for enhanced backend features
export type FeatureToggles = typeof featureToggles.$inferSelect;
export type PlatformHealth = typeof platformHealth.$inferSelect;
export type MessageQueue = typeof messageQueue.$inferSelect;
export type JobQueue = typeof jobQueue.$inferSelect;
export type TokenRotationHistory = typeof tokenRotationHistory.$inferSelect;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type TokenExpiryAlert = typeof tokenExpiryAlerts.$inferSelect;

// Select types for enhanced database and AI features
export type PlatformCredentialMetadata = typeof platformCredentialMetadata.$inferSelect;
export type FactAnalytics = typeof factAnalytics.$inferSelect;
export type UserTopicPreferences = typeof userTopicPreferences.$inferSelect;
export type PlatformStats = typeof platformStats.$inferSelect;
export type TokenRollbackStorage = typeof tokenRollbackStorage.$inferSelect;
export type IntentClassification = typeof intentClassifications.$inferSelect;
export type EnhancedModerationSettings = typeof enhancedModerationSettings.$inferSelect;
export type ModerationActionLog = typeof moderationActionLog.$inferSelect;
export type SpeechToTextQueue = typeof speechToTextQueue.$inferSelect;
export type Transcription = typeof transcriptions.$inferSelect;
export type WebhookQueue = typeof webhookQueue.$inferSelect;
export type ScheduledAnnouncement = typeof scheduledAnnouncements.$inferSelect;

// Insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPlatformConnection = z.infer<typeof insertPlatformConnectionSchema>;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type InsertBotInstance = z.infer<typeof insertBotInstanceSchema>;
export type InsertMessageHistory = z.infer<typeof insertMessageHistorySchema>;
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type InsertCommandAlias = z.infer<typeof insertCommandAliasSchema>;
export type InsertModerationRule = z.infer<typeof insertModerationRuleSchema>;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type InsertLinkWhitelist = z.infer<typeof insertLinkWhitelistSchema>;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;
export type InsertGiveawayWinner = z.infer<typeof insertGiveawayWinnerSchema>;
export type InsertGiveawayEntryAttempt = z.infer<typeof insertGiveawayEntryAttemptSchema>;
export type InsertShoutout = z.infer<typeof insertShoutoutSchema>;
export type InsertShoutoutSettings = z.infer<typeof insertShoutoutSettingsSchema>;
export type InsertShoutoutHistory = z.infer<typeof insertShoutoutHistorySchema>;
export type InsertStreamSession = z.infer<typeof insertStreamSessionSchema>;
export type InsertViewerSnapshot = z.infer<typeof insertViewerSnapshotSchema>;
export type InsertChatActivity = z.infer<typeof insertChatActivitySchema>;
export type InsertGameSettings = z.infer<typeof insertGameSettingsSchema>;
export type InsertGameHistory = z.infer<typeof insertGameHistorySchema>;
export type InsertActiveTriviaQuestion = z.infer<typeof insertActiveTriviaQuestionSchema>;
export type InsertGameStats = z.infer<typeof insertGameStatsSchema>;
export type InsertCurrencySettings = z.infer<typeof insertCurrencySettingsSchema>;
export type InsertUserBalance = z.infer<typeof insertUserBalanceSchema>;
export type InsertCurrencyTransaction = z.infer<typeof insertCurrencyTransactionSchema>;
export type InsertCurrencyReward = z.infer<typeof insertCurrencyRewardSchema>;
export type InsertRewardRedemption = z.infer<typeof insertRewardRedemptionSchema>;
export type InsertSongQueue = z.infer<typeof insertSongQueueSchema>;
export type InsertSongSettings = z.infer<typeof insertSongSettingsSchema>;
export type InsertPoll = z.infer<typeof insertPollSchema>;
export type InsertPollVote = z.infer<typeof insertPollVoteSchema>;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type InsertPredictionBet = z.infer<typeof insertPredictionBetSchema>;
export type InsertAlertSettings = z.infer<typeof insertAlertSettingsSchema>;
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type InsertStreamAlert = z.infer<typeof insertStreamAlertSchema>;
export type InsertAlertQueue = z.infer<typeof insertAlertQueueSchema>;
export type InsertStreamAlertHistory = z.infer<typeof insertStreamAlertHistorySchema>;
export type InsertChatbotSettings = z.infer<typeof insertChatbotSettingsSchema>;
export type InsertChatbotResponse = z.infer<typeof insertChatbotResponseSchema>;
export type InsertChatbotContext = z.infer<typeof insertChatbotContextSchema>;
export type InsertChatbotPersonality = z.infer<typeof insertChatbotPersonalitySchema>;
export type InsertChatbotMemory = z.infer<typeof insertChatbotMemorySchema>;
export type InsertAnalyticsSnapshot = z.infer<typeof insertAnalyticsSnapshotSchema>;
export type InsertSentimentAnalysis = z.infer<typeof insertSentimentAnalysisSchema>;
export type InsertOBSConnection = z.infer<typeof insertOBSConnectionSchema>;
export type InsertOBSAutomation = z.infer<typeof insertOBSAutomationSchema>;
export type InsertFact = z.infer<typeof insertFactSchema>;
export type InsertStreamClip = z.infer<typeof insertStreamClipSchema>;
export type UpdateStreamClip = z.infer<typeof updateStreamClipSchema>;

// Insert types for enhanced backend features
export type InsertFeatureToggles = z.infer<typeof insertFeatureTogglesSchema>;
export type InsertPlatformHealth = z.infer<typeof insertPlatformHealthSchema>;
export type InsertMessageQueue = z.infer<typeof insertMessageQueueSchema>;
export type InsertJobQueue = z.infer<typeof insertJobQueueSchema>;
export type InsertTokenRotationHistory = z.infer<typeof insertTokenRotationHistorySchema>;
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type InsertTokenExpiryAlert = z.infer<typeof insertTokenExpiryAlertSchema>;

// Insert types for enhanced database and AI features
export type InsertPlatformCredentialMetadata = z.infer<typeof insertPlatformCredentialMetadataSchema>;
export type InsertFactAnalytics = z.infer<typeof insertFactAnalyticsSchema>;
export type InsertUserTopicPreferences = z.infer<typeof insertUserTopicPreferencesSchema>;
export type InsertPlatformStats = z.infer<typeof insertPlatformStatsSchema>;
export type InsertTokenRollbackStorage = z.infer<typeof insertTokenRollbackStorageSchema>;
export type InsertIntentClassification = z.infer<typeof insertIntentClassificationSchema>;
export type InsertEnhancedModerationSettings = z.infer<typeof insertEnhancedModerationSettingsSchema>;
export type InsertModerationActionLog = z.infer<typeof insertModerationActionLogSchema>;
export type InsertSpeechToTextQueue = z.infer<typeof insertSpeechToTextQueueSchema>;
export type InsertTranscription = z.infer<typeof insertTranscriptionSchema>;
export type InsertWebhookQueue = z.infer<typeof insertWebhookQueueSchema>;
export type InsertScheduledAnnouncement = z.infer<typeof insertScheduledAnnouncementSchema>;
export type UpdateScheduledAnnouncement = z.infer<typeof updateScheduledAnnouncementSchema>;

// Update types
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateBotConfig = z.infer<typeof updateBotConfigSchema>;
export type UpdatePlatformConnection = z.infer<typeof updatePlatformConnectionSchema>;
export type UpdateBotInstance = z.infer<typeof updateBotInstanceSchema>;
export type UpdateCustomCommand = z.infer<typeof updateCustomCommandSchema>;
export type UpdateModerationRule = z.infer<typeof updateModerationRuleSchema>;
export type UpdateGiveaway = z.infer<typeof updateGiveawaySchema>;
export type UpdateShoutout = z.infer<typeof updateShoutoutSchema>;
export type UpdateShoutoutSettings = z.infer<typeof updateShoutoutSettingsSchema>;
export type UpdateStreamSession = z.infer<typeof updateStreamSessionSchema>;
export type UpdateGameSettings = z.infer<typeof updateGameSettingsSchema>;
export type UpdateGameStats = z.infer<typeof updateGameStatsSchema>;
export type UpdateCurrencySettings = z.infer<typeof updateCurrencySettingsSchema>;
export type UpdateUserBalance = z.infer<typeof updateUserBalanceSchema>;
export type UpdateCurrencyReward = z.infer<typeof updateCurrencyRewardSchema>;
export type UpdateRewardRedemption = z.infer<typeof updateRewardRedemptionSchema>;
export type UpdateSongQueue = z.infer<typeof updateSongQueueSchema>;
export type UpdateSongSettings = z.infer<typeof updateSongSettingsSchema>;
export type UpdatePoll = z.infer<typeof updatePollSchema>;
export type UpdatePollVote = z.infer<typeof updatePollVoteSchema>;
export type UpdatePrediction = z.infer<typeof updatePredictionSchema>;
export type UpdatePredictionBet = z.infer<typeof updatePredictionBetSchema>;
export type UpdateAlertSettings = z.infer<typeof updateAlertSettingsSchema>;
export type UpdateMilestone = z.infer<typeof updateMilestoneSchema>;
export type UpdateStreamAlert = z.infer<typeof updateStreamAlertSchema>;
export type UpdateStreamAlertHistory = z.infer<typeof updateStreamAlertHistorySchema>;
export type UpdateOBSConnection = z.infer<typeof updateOBSConnectionSchema>;
export type UpdateOBSAutomation = z.infer<typeof updateOBSAutomationSchema>;

// Update types for enhanced backend features
export type UpdateFeatureToggles = z.infer<typeof updateFeatureTogglesSchema>;
export type UpdatePlatformHealth = z.infer<typeof updatePlatformHealthSchema>;
export type UpdateMessageQueue = z.infer<typeof updateMessageQueueSchema>;
export type UpdateJobQueue = z.infer<typeof updateJobQueueSchema>;
export type UpdateOnboardingProgress = z.infer<typeof updateOnboardingProgressSchema>;

// Auth types
export type Signup = z.infer<typeof signupSchema>;
export type Login = z.infer<typeof loginSchema>;

// Backward compatibility table exports (deprecated - use botConfigs instead)
export const botSettings = botConfigs;

// Backward compatibility types (deprecated - use BotConfig instead)
export type BotSettings = BotConfig;
export type InsertBotSettings = InsertBotConfig;
export type UpdateBotSettings = UpdateBotConfig;
